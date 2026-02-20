const express = require('express');
const router = express.Router({ mergeParams: true });
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');
const authenticate = require('../middleware/auth');

// All routes in this file are protected
router.use(authenticate);

// ─── MOCK CRUD ──────────────────────────────────────────────────────────────

// GET /projects/:projectId/mocks
router.get('/projects/:projectId/mocks', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Verify project ownership
        const project = await turso.execute(
            'SELECT project_id FROM projects WHERE project_id = ? AND user_id = ?',
            [projectId, req.user.userId]
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

        if (!name || !path || !method) {
            return res.status(400).json({ error: 'name, path, and method are required' });
        }

        // Verify project ownership
        const project = await turso.execute(
            'SELECT project_id FROM projects WHERE project_id = ? AND user_id = ?',
            [projectId, req.user.userId]
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

        const mockResult = await turso.execute(
            `SELECT m.* FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND p.user_id = ?`,
            [id, req.user.userId]
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

        // Verify ownership through project
        const existing = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND p.user_id = ?`,
            [id, req.user.userId]
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
        const existing = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND p.user_id = ?`,
            [id, req.user.userId]
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
        const { name, statusCode, headers, body, isDefault, weight } = req.body;

        // Verify mock exists and belongs to user
        const mockCheck = await turso.execute(
            `SELECT m.mock_id FROM mocks m
       INNER JOIN projects p ON m.project_id = p.project_id
       WHERE m.mock_id = ? AND p.user_id = ?`,
            [id, req.user.userId]
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

        await turso.execute(
            `INSERT INTO mock_responses (response_id, mock_id, name, status_code, headers, body, is_default, weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                responseId, id, name || 'Response',
                statusCode || 200,
                typeof headers === 'object' ? JSON.stringify(headers) : (headers || '{}'),
                body || '',
                isDefault ? 1 : 0,
                weight || 100,
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
        const { name, statusCode, headers, body, isDefault, weight } = req.body;

        // If setting new default, unset others
        if (isDefault) {
            await turso.execute(
                'UPDATE mock_responses SET is_default = 0 WHERE mock_id = ?',
                [id]
            );
        }

        await turso.execute(
            `UPDATE mock_responses SET
        name = COALESCE(?, name),
        status_code = COALESCE(?, status_code),
        headers = COALESCE(?, headers),
        body = COALESCE(?, body),
        is_default = COALESCE(?, is_default),
        weight = COALESCE(?, weight)
       WHERE response_id = ? AND mock_id = ?`,
            [
                name || null,
                statusCode !== undefined ? statusCode : null,
                headers !== undefined ? (typeof headers === 'object' ? JSON.stringify(headers) : headers) : null,
                body !== undefined ? body : null,
                isDefault !== undefined ? (isDefault ? 1 : 0) : null,
                weight !== undefined ? weight : null,
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

module.exports = router;
