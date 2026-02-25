const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getAuth } = require('@clerk/express');
const turso = require('../db');
const { enforceProjectLimit } = require('../middleware/billing');

// Helper: generate URL-safe slug from name
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 50);
}

// Ensure slug is unique
async function uniqueSlug(base) {
    const existing = await turso.execute('SELECT slug FROM projects WHERE slug = ?', [base]);
    if (existing.rows.length === 0) return base;
    const suffix = uuidv4().substring(0, 6);
    return `${base}-${suffix}`;
}

/**
 * Scope helper: projects are org-scoped when orgId is present, user-scoped otherwise.
 */
function getScope(auth) {
    if (auth.orgId) {
        return { scopeWhere: 'org_id = ?', scopeValues: [auth.orgId] };
    }
    return { scopeWhere: 'user_id = ? AND org_id IS NULL', scopeValues: [auth.userId] };
}

// ─── LIST / SEARCH ────────────────────────────────────────────────────────────

// GET /projects?search=
router.get('/', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { scopeWhere, scopeValues } = getScope(auth);
        const search = req.query.search?.trim() || '';

        const searchClause = search ? `AND (p.name LIKE ? OR p.description LIKE ?)` : '';
        const searchValues = search ? [`%${search}%`, `%${search}%`] : [];

        const result = await turso.execute(
            `SELECT p.*,
        (SELECT COUNT(*) FROM mocks m WHERE m.project_id = p.project_id) as mock_count
       FROM projects p
       WHERE ${scopeWhere} ${searchClause}
       ORDER BY p.updated_at DESC`,
            [...scopeValues, ...searchValues]
        );
        res.status(200).json({ data: result.rows });
    } catch (error) {
        console.error('List projects error:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────

// POST /projects — enforces plan-based project limit before creation
router.post('/', enforceProjectLimit, async (req, res) => {
    try {
        const auth = getAuth(req);
        const { name, description, isPublic } = req.body;

        if (!name) return res.status(400).json({ error: 'name is required' });

        const projectId = uuidv4();
        const slug = await uniqueSlug(generateSlug(name));
        const now = new Date().toISOString();

        await turso.execute(
            `INSERT INTO projects (project_id, name, description, slug, user_id, org_id, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, name, description || '', slug, auth.userId, auth.orgId || null, isPublic ? 1 : 0, now, now]
        );

        const result = await turso.execute('SELECT * FROM projects WHERE project_id = ?', [projectId]);
        res.status(201).json({ data: result.rows[0] });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// ─── READ ─────────────────────────────────────────────────────────────────────

// GET /projects/:id  (includes mocks array)
router.get('/:id', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { id } = req.params;
        const { scopeWhere, scopeValues } = getScope(auth);

        const result = await turso.execute(
            `SELECT * FROM projects WHERE project_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        const project = result.rows[0];
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const mocksResult = await turso.execute(
            'SELECT * FROM mocks WHERE project_id = ? ORDER BY created_at ASC',
            [id]
        );
        res.status(200).json({ data: { ...project, mocks: mocksResult.rows } });
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

// PUT /projects/:id
router.put('/:id', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { id } = req.params;
        const { name, description, isPublic } = req.body;
        const { scopeWhere, scopeValues } = getScope(auth);

        const existing = await turso.execute(
            `SELECT * FROM projects WHERE project_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const now = new Date().toISOString();
        await turso.execute(
            `UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        is_public = COALESCE(?, is_public),
        updated_at = ?
       WHERE project_id = ?`,
            [name || null, description !== undefined ? description : null,
            isPublic !== undefined ? (isPublic ? 1 : 0) : null, now, id]
        );

        const updated = await turso.execute('SELECT * FROM projects WHERE project_id = ?', [id]);
        res.status(200).json({ data: updated.rows[0] });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

// DELETE /projects/:id
router.delete('/:id', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { id } = req.params;
        const { scopeWhere, scopeValues } = getScope(auth);

        const existing = await turso.execute(
            `SELECT project_id FROM projects WHERE project_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        await turso.execute('DELETE FROM projects WHERE project_id = ?', [id]);
        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// ─── STATS ────────────────────────────────────────────────────────────────────

// GET /projects/:id/stats
router.get('/:id/stats', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { id } = req.params;
        const { scopeWhere, scopeValues } = getScope(auth);

        const project = await turso.execute(
            `SELECT project_id FROM projects WHERE project_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        if (project.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const overall = await turso.execute(
            `SELECT COUNT(*) as total_requests, MAX(created_at) as last_request_at
             FROM request_logs WHERE project_id = ?`,
            [id]
        );

        const perMock = await turso.execute(
            `SELECT
               m.mock_id, m.name, m.path, m.method,
               COUNT(rl.log_id) as total_requests,
               MAX(rl.created_at) as last_request_at,
               ROUND(AVG(rl.response_time_ms), 2) as avg_response_time_ms
             FROM mocks m
             LEFT JOIN request_logs rl ON rl.mock_id = m.mock_id
             WHERE m.project_id = ?
             GROUP BY m.mock_id
             ORDER BY total_requests DESC`,
            [id]
        );

        res.status(200).json({
            data: {
                projectId: id,
                totalRequests: overall.rows[0]?.total_requests ?? 0,
                lastRequestAt: overall.rows[0]?.last_request_at ?? null,
                mocks: perMock.rows,
            },
        });
    } catch (error) {
        console.error('GET /projects/:id/stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ─── DUPLICATE ────────────────────────────────────────────────────────────────

// POST /projects/:id/duplicate — also counts against the project limit
router.post('/:id/duplicate', enforceProjectLimit, async (req, res) => {
    try {
        const auth = getAuth(req);
        const { id } = req.params;
        const { scopeWhere, scopeValues } = getScope(auth);

        const existing = await turso.execute(
            `SELECT * FROM projects WHERE project_id = ? AND (${scopeWhere})`,
            [id, ...scopeValues]
        );
        const original = existing.rows[0];
        if (!original) return res.status(404).json({ error: 'Project not found' });

        const newProjectId = uuidv4();
        const newSlug = await uniqueSlug(`${original.slug}-copy`);
        const now = new Date().toISOString();

        // Clone project
        await turso.execute(
            `INSERT INTO projects (project_id, name, description, slug, user_id, org_id, is_public, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newProjectId, `${original.name} (Copy)`, original.description, newSlug,
                auth.userId, auth.orgId || null, original.is_public, now, now]
        );

        // Clone all mocks + their responses
        const mocks = await turso.execute('SELECT * FROM mocks WHERE project_id = ?', [id]);
        for (const mock of mocks.rows) {
            const newMockId = uuidv4();
            await turso.execute(
                `INSERT INTO mocks (mock_id, project_id, name, path, method, description, is_active, response_type, response_delay_ms, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newMockId, newProjectId, mock.name, mock.path, mock.method, mock.description,
                    mock.is_active, mock.response_type, mock.response_delay_ms, now, now]
            );
            const responses = await turso.execute('SELECT * FROM mock_responses WHERE mock_id = ?', [mock.mock_id]);
            for (const resp of responses.rows) {
                await turso.execute(
                    `INSERT INTO mock_responses (response_id, mock_id, name, status_code, headers, body, is_default, weight, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [uuidv4(), newMockId, resp.name, resp.status_code, resp.headers, resp.body, resp.is_default, resp.weight, now]
                );
            }
        }

        const newProject = await turso.execute('SELECT * FROM projects WHERE project_id = ?', [newProjectId]);
        res.status(201).json({ data: newProject.rows[0] });
    } catch (error) {
        console.error('POST /projects/:id/duplicate error:', error);
        res.status(500).json({ error: 'Failed to duplicate project' });
    }
});

module.exports = router;
