const express = require('express');
const router = express.Router({ mergeParams: true });
const { v4: uuidv4 } = require('uuid');
const { getAuth } = require('@clerk/express');
const turso = require('../db');
const authenticate = require('../middleware/auth');

// All routes in this file are protected
router.use(authenticate);

/**
 * Scope helper: projects are org-scoped when orgId is present, user-scoped otherwise.
 * Mirrors the same pattern used in projects.js for consistency.
 */
function getScope(auth) {
    if (auth.orgId) {
        return { scopeWhere: 'p.org_id = ?', scopeValues: [auth.orgId] };
    }
    return { scopeWhere: 'p.user_id = ? AND p.org_id IS NULL', scopeValues: [auth.userId] };
}

// ─── MOCK CRUD ──────────────────────────────────────────────────────────────

// GET /projects/:projectId/mocks
router.get('/projects/:projectId/mocks', async (req, res) => {
    try {
        const { projectId } = req.params;
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);

        // Verify project ownership (org-aware)
        const project = await turso.execute(
            `SELECT project_id FROM projects p WHERE p.project_id = ? AND (${scopeWhere})`,
            [projectId, ...scopeValues]
        );
        if (project.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const result = await turso.execute(
            `SELECT m.*, 
        (SELECT COUNT(*) FROM mock_responses mr WHERE mr.mock_id = m.mock_id) as response_count
       FROM mocks m 
       WHERE m.project_id = ? 
       ORDER BY m.created_at ASC`,
            [projectId]
        );
        res.status(200).json({ data: result.rows });
    } catch (error) {
        console.error('List mocks error:', error);
        res.status(500).json({ error: 'Failed to fetch mocks' });
    }
});

// POST /projects/:projectId/mocks
router.post('/projects/:projectId/mocks', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, path, method, description, responseType, responseDelay } = req.body;
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);

        if (!name || !path || !method) {
            return res.status(400).json({ error: 'name, path, and method are required' });
        }

        // Verify project ownership (org-aware)
        const project = await turso.execute(
            `SELECT project_id FROM projects p WHERE p.project_id = ? AND (${scopeWhere})`,
            [projectId, ...scopeValues]
        );
        if (project.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const mockId = uuidv4();
        const now = new Date().toISOString();
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;

        await turso.execute(
            `INSERT INTO mocks (mock_id, project_id, name, path, method, description, response_type, response_delay_ms, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                mockId, projectId, name, normalizedPath,
                method.toUpperCase(), description || '',
                responseType || 'json', responseDelay || 0,
                now, now
            ]
        );

        const result = await turso.execute('SELECT * FROM mocks WHERE mock_id = ?', [mockId]);
        res.status(201).json({ data: result.rows[0] });
    } catch (error) {
        console.error('Create mock error:', error);
        res.status(500).json({ error: 'Failed to create mock' });
    }
});

// GET /mocks/:id
router.get('/mocks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);

        const mockResult = await turso.execute(
            `SELECT m.* FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        const mock = mockResult.rows[0];
        if (!mock) {
            return res.status(404).json({ error: 'Mock not found' });
        }

        const responsesResult = await turso.execute(
            'SELECT * FROM mock_responses WHERE mock_id = ? ORDER BY is_default DESC, created_at ASC',
            [id]
        );

        res.status(200).json({ data: { ...mock, responses: responsesResult.rows } });
    } catch (error) {
        console.error('Get mock error:', error);
        res.status(500).json({ error: 'Failed to fetch mock' });
    }
});

// PUT /mocks/:id
router.put('/mocks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, path, method, description, responseType, responseDelay, isActive } = req.body;

        // Verify ownership through project (org-aware)
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);
        const existing = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Mock not found' });
        }

        const now = new Date().toISOString();
        const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : null;

        await turso.execute(
            `UPDATE mocks SET 
        name = COALESCE(?, name),
        path = COALESCE(?, path),
        method = COALESCE(?, method),
        description = COALESCE(?, description),
        response_type = COALESCE(?, response_type),
        response_delay_ms = COALESCE(?, response_delay_ms),
        is_active = COALESCE(?, is_active),
        updated_at = ?
       WHERE mock_id = ?`,
            [
                name || null, normalizedPath, method ? method.toUpperCase() : null,
                description || null, responseType || null,
                responseDelay !== undefined ? responseDelay : null,
                isActive !== undefined ? (isActive ? 1 : 0) : null,
                now, id
            ]
        );

        const updated = await turso.execute('SELECT * FROM mocks WHERE mock_id = ?', [id]);
        res.status(200).json({ data: updated.rows[0] });
    } catch (error) {
        console.error('Update mock error:', error);
        res.status(500).json({ error: 'Failed to update mock' });
    }
});

// DELETE /mocks/:id
router.delete('/mocks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);
        const existing = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Mock not found' });
        }

        await turso.execute('DELETE FROM mocks WHERE mock_id = ?', [id]);
        res.status(200).json({ message: 'Mock deleted successfully' });
    } catch (error) {
        console.error('Delete mock error:', error);
        res.status(500).json({ error: 'Failed to delete mock' });
    }
});

// ─── MOCK RESPONSES ──────────────────────────────────────────────────────────

// GET /mocks/:id/responses
router.get('/mocks/:id/responses', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await turso.execute(
            'SELECT * FROM mock_responses WHERE mock_id = ? ORDER BY is_default DESC, created_at ASC',
            [id]
        );
        res.status(200).json({ data: result.rows });
    } catch (error) {
        console.error('Get responses error:', error);
        res.status(500).json({ error: 'Failed to fetch responses' });
    }
});

// POST /mocks/:id/responses
router.post('/mocks/:id/responses', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, statusCode, headers, body, isDefault, weight, conditions } = req.body;
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);

        // Verify mock exists and belongs to user/org
        const mockCheck = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (mockCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Mock not found' });
        }

        // If this is default, unset other defaults
        if (isDefault) {
            await turso.execute(
                'UPDATE mock_responses SET is_default = 0 WHERE mock_id = ?',
                [id]
            );
        }

        const responseId = uuidv4();
        const now = new Date().toISOString();
        const conditionsStr = conditions ? (typeof conditions === 'string' ? conditions : JSON.stringify(conditions)) : '[]';

        await turso.execute(
            `INSERT INTO mock_responses (response_id, mock_id, name, status_code, headers, body, is_default, weight, conditions, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                responseId, id, name || 'Response',
                statusCode || 200,
                typeof headers === 'object' ? JSON.stringify(headers) : (headers || '{}'),
                body || '',
                isDefault ? 1 : 0,
                weight || 100,
                conditionsStr,
                now
            ]
        );

        const result = await turso.execute(
            'SELECT * FROM mock_responses WHERE response_id = ?',
            [responseId]
        );
        res.status(201).json({ data: result.rows[0] });
    } catch (error) {
        console.error('Create response error:', error);
        res.status(500).json({ error: 'Failed to create response' });
    }
});

// PUT /mocks/:id/responses/:responseId
router.put('/mocks/:id/responses/:responseId', async (req, res) => {
    try {
        const { id, responseId } = req.params;
        const { name, statusCode, headers, body, isDefault, weight, conditions } = req.body;

        // If setting new default, unset others
        if (isDefault) {
            await turso.execute(
                'UPDATE mock_responses SET is_default = 0 WHERE mock_id = ?',
                [id]
            );
        }

        const conditionsStr = conditions !== undefined
            ? (typeof conditions === 'string' ? conditions : JSON.stringify(conditions))
            : null;

        await turso.execute(
            `UPDATE mock_responses SET
        name = COALESCE(?, name),
        status_code = COALESCE(?, status_code),
        headers = COALESCE(?, headers),
        body = COALESCE(?, body),
        is_default = COALESCE(?, is_default),
        weight = COALESCE(?, weight),
        conditions = COALESCE(?, conditions)
       WHERE response_id = ? AND mock_id = ?`,
            [
                name || null,
                statusCode !== undefined ? statusCode : null,
                headers !== undefined ? (typeof headers === 'object' ? JSON.stringify(headers) : headers) : null,
                body !== undefined ? body : null,
                isDefault !== undefined ? (isDefault ? 1 : 0) : null,
                weight !== undefined ? weight : null,
                conditionsStr,
                responseId, id
            ]
        );

        const updated = await turso.execute(
            'SELECT * FROM mock_responses WHERE response_id = ?',
            [responseId]
        );
        res.status(200).json({ data: updated.rows[0] });
    } catch (error) {
        console.error('Update response error:', error);
        res.status(500).json({ error: 'Failed to update response' });
    }
});

// DELETE /mocks/:id/responses/:responseId
router.delete('/mocks/:id/responses/:responseId', async (req, res) => {
    try {
        const { id, responseId } = req.params;
        await turso.execute(
            'DELETE FROM mock_responses WHERE response_id = ? AND mock_id = ?',
            [responseId, id]
        );
        res.status(200).json({ message: 'Response deleted successfully' });
    } catch (error) {
        console.error('Delete response error:', error);
        res.status(500).json({ error: 'Failed to delete response' });
    }
});

// ─── REQUEST LOGS ─────────────────────────────────────────────────────────────

// GET /mocks/:id/request-logs?page=1&limit=50&startDate=&endDate=
router.get('/mocks/:id/request-logs', async (req, res) => {
    try {
        const { id } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const { startDate, endDate } = req.query;

        let dateFilter = '';
        const dateValues = [];
        if (startDate) { dateFilter += ' AND created_at >= ?'; dateValues.push(startDate); }
        if (endDate) { dateFilter += ' AND created_at <= ?'; dateValues.push(endDate); }

        const [logsResult, countResult] = await Promise.all([
            turso.execute(
                `SELECT * FROM request_logs
                 WHERE mock_id = ? ${dateFilter}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [id, ...dateValues, limit, offset]
            ),
            turso.execute(
                `SELECT COUNT(*) as total FROM request_logs WHERE mock_id = ? ${dateFilter}`,
                [id, ...dateValues]
            ),
        ]);

        const total = countResult.rows[0]?.total ?? 0;
        res.status(200).json({
            data: logsResult.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('GET /mocks/:id/request-logs error:', error);
        res.status(500).json({ error: 'Failed to fetch request logs' });
    }
});

// ─── DUPLICATE ────────────────────────────────────────────────────────────────

// POST /mocks/:id/duplicate — clone a single mock with all its responses
router.post('/mocks/:id/duplicate', async (req, res) => {
    try {
        const { id } = req.params;

        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);
        const mockResult = await turso.execute(
            `SELECT m.* FROM mocks m
             INNER JOIN projects p ON m.project_id = p.project_id
             WHERE m.mock_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        const original = mockResult.rows[0];
        if (!original) return res.status(404).json({ error: 'Mock not found' });

        const newMockId = uuidv4();
        const now = new Date().toISOString();

        await turso.execute(
            `INSERT INTO mocks (mock_id, project_id, name, path, method, description, is_active, response_type, response_delay_ms, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newMockId, original.project_id, `${original.name} (Copy)`,
                original.path, original.method, original.description,
                original.is_active, original.response_type, original.response_delay_ms, now, now]
        );

        const responses = await turso.execute('SELECT * FROM mock_responses WHERE mock_id = ?', [id]);
        for (const resp of responses.rows) {
            await turso.execute(
                `INSERT INTO mock_responses (response_id, mock_id, name, status_code, headers, body, is_default, weight, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), newMockId, resp.name, resp.status_code, resp.headers, resp.body, resp.is_default, resp.weight, now]
            );
        }

        const newMock = await turso.execute('SELECT * FROM mocks WHERE mock_id = ?', [newMockId]);
        res.status(201).json({ data: newMock.rows[0] });
    } catch (error) {
        console.error('POST /mocks/:id/duplicate error:', error);
        res.status(500).json({ error: 'Failed to duplicate mock' });
    }
});

module.exports = router;
