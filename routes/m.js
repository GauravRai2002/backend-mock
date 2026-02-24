const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');
const { matchPath, evaluateCondition, responseMatchesConditions, pickResponse } = require('../utils/execution');

/**
 * Find the best matching mock for a given project, path, and method.
 * Priority: exact match > longest pattern match.
 */
async function findMatchingMock(projectId, requestPath, method) {
    // Try exact match first
    const exact = await turso.execute(
        `SELECT * FROM mocks 
     WHERE project_id = ? AND path = ? AND method = ? AND is_active = 1`,
        [projectId, requestPath, method]
    );
    if (exact.rows.length > 0) {
        return { mock: exact.rows[0], pathParams: {} };
    }

    // Try pattern matching — fetch all active mocks for this project+method
    const allMocks = await turso.execute(
        `SELECT * FROM mocks 
     WHERE project_id = ? AND method = ? AND is_active = 1 
     ORDER BY LENGTH(path) DESC`,
        [projectId, method]
    );

    for (const mock of allMocks.rows) {
        if (!mock.path.includes('{')) continue; // skip non-parametric paths
        const result = matchPath(mock.path, requestPath);
        if (result.isMatch) {
            return { mock, pathParams: result.params };
        }
    }

    return null;
}

/**
 * Log the request asynchronously (don't block the response).
 */
async function logRequest({ mockId, projectId, req, responseStatus, responseTimeMs }) {
    try {
        await turso.execute(
            `INSERT INTO request_logs 
        (log_id, mock_id, project_id, request_path, request_method, request_headers, request_body, request_query, response_status, response_time_ms, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuidv4(),
                mockId || null,
                projectId || null,
                req.path,
                req.method,
                JSON.stringify(req.headers),
                typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body || ''),
                JSON.stringify(req.query),
                responseStatus,
                responseTimeMs,
                req.ip || req.connection?.remoteAddress || '',
                req.get('user-agent') || '',
                new Date().toISOString()
            ]
        );
    } catch (err) {
        console.error('Failed to write request log:', err);
    }
}

/**
 * Main mock handler — matches all methods on /m/:projectSlug/{*path}
 * This is a PUBLIC endpoint — no auth required.
 *
 * NOTE: Express 5's {*path} wildcard returns segments joined by commas,
 * NOT slashes (e.g. "api,new-endpoint" instead of "api/new-endpoint").
 * We reconstruct the real path from req.path by stripping /:projectSlug.
 */
router.all('/:projectSlug/{*path}', async (req, res) => {
    const startTime = Date.now();
    const { projectSlug } = req.params;

    // Strip "/:projectSlug" from req.path to get the real mock path with slashes
    // req.path here is e.g. "/new-mock/api/new-endpoint" → mockPath = "/api/new-endpoint"
    const mockPath = req.path.replace(/^\/[^/]+/, '') || '/';
    const method = req.method.toUpperCase();


    // Always add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (method === 'OPTIONS') {
        return res.status(204).send();
    }

    try {
        // 1. Find project by slug
        const projectResult = await turso.execute(
            'SELECT * FROM projects WHERE slug = ?',
            [projectSlug]
        );
        const project = projectResult.rows[0];
        if (!project) {
            return res.status(404).json({
                error: 'PROJECT_NOT_FOUND',
                message: `No project found with slug "${projectSlug}"`,
            });
        }

        // 2. Find matching mock
        const match = await findMatchingMock(project.project_id, mockPath, method);
        if (!match) {
            const elapsed = Date.now() - startTime;
            await logRequest({
                mockId: null,
                projectId: project.project_id,
                req, responseStatus: 404, responseTimeMs: elapsed
            });
            return res.status(404).json({
                error: 'MOCK_NOT_FOUND',
                message: `No mock found for ${method} ${mockPath}`,
            });
        }

        const { mock, pathParams } = match;

        // 3. Fetch responses for this mock
        const responsesResult = await turso.execute(
            'SELECT * FROM mock_responses WHERE mock_id = ? ORDER BY is_default DESC, created_at ASC',
            [mock.mock_id]
        );

        const response = pickResponse(responsesResult.rows, req, pathParams);
        if (!response) {
            return res.status(404).json({
                error: 'NO_RESPONSE_DEFINED',
                message: 'This mock has no responses configured',
            });
        }

        // 4. Apply delay
        const delay = mock.response_delay_ms || 0;
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // 5. Parse and set response headers
        let headers = {};
        try {
            headers = typeof response.headers === 'string' ? JSON.parse(response.headers) : (response.headers || {});
        } catch {
            headers = {};
        }

        // Set Content-Type based on mock type if not overridden
        if (!headers['Content-Type'] && !headers['content-type']) {
            const typeMap = {
                json: 'application/json',
                xml: 'application/xml',
                text: 'text/plain',
                html: 'text/html',
            };
            headers['Content-Type'] = typeMap[mock.response_type] || 'application/json';
        }

        Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });

        const elapsed = Date.now() - startTime;

        // 6. Log the request (fire and forget)
        logRequest({
            mockId: mock.mock_id,
            projectId: project.project_id,
            req,
            responseStatus: response.status_code,
            responseTimeMs: elapsed
        });

        // 7. Send response
        res.status(response.status_code).send(response.body || '');

    } catch (error) {
        console.error('Mock execution error:', error);
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An error occurred while processing the mock request',
        });
    }
});

// Handle /m/:projectSlug with no trailing path
router.all('/:projectSlug', async (req, res) => {
    res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Please include a path after the project slug, e.g., /m/my-project/api/users',
    });
});

module.exports = router;