const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');

// Helper: generate a URL-safe slug from a name
function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 50);
}

// Ensure slug is unique by appending a short random suffix if needed
async function uniqueSlug(base) {
    const existing = await turso.execute('SELECT slug FROM projects WHERE slug = ?', [base]);
    if (existing.rows.length === 0) return base;
    const suffix = uuidv4().substring(0, 6);
    return `${base}-${suffix}`;
}

// GET /projects — list all projects for the current user
router.get('/', async (req, res) => {
    try {
        const result = await turso.execute(
            `SELECT p.*, 
        (SELECT COUNT(*) FROM mocks m WHERE m.project_id = p.project_id) as mock_count
       FROM projects p 
       WHERE p.user_id = ? 
       ORDER BY p.updated_at DESC`,
            [req.user.userId]
        );
        res.status(200).json({ data: result.rows });
    } catch (error) {
        console.error('List projects error:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// POST /projects — create a new project
router.post('/', async (req, res) => {
    try {
        const { name, description, isPublic } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'name is required' });
        }

        const projectId = uuidv4();
        const baseSlug = generateSlug(name);
        const slug = await uniqueSlug(baseSlug);
        const now = new Date().toISOString();

        await turso.execute(
            `INSERT INTO projects (project_id, name, description, slug, user_id, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, name, description || '', slug, req.user.userId, isPublic ? 1 : 0, now, now]
        );

        const result = await turso.execute(
            'SELECT * FROM projects WHERE project_id = ?',
            [projectId]
        );

        res.status(201).json({ data: result.rows[0] });
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// GET /projects/:id — get a single project with its mocks
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await turso.execute(
            'SELECT * FROM projects WHERE project_id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        const project = result.rows[0];
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Get mocks count
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

// PUT /projects/:id — update a project
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isPublic } = req.body;

        // Verify ownership
        const existing = await turso.execute(
            'SELECT * FROM projects WHERE project_id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const now = new Date().toISOString();
        await turso.execute(
            `UPDATE projects SET 
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        is_public = COALESCE(?, is_public),
        updated_at = ?
       WHERE project_id = ? AND user_id = ?`,
            [name || null, description || null, isPublic !== undefined ? (isPublic ? 1 : 0) : null, now, id, req.user.userId]
        );

        const updated = await turso.execute(
            'SELECT * FROM projects WHERE project_id = ?',
            [id]
        );
        res.status(200).json({ data: updated.rows[0] });
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// DELETE /projects/:id — delete a project
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await turso.execute(
            'SELECT project_id FROM projects WHERE project_id = ? AND user_id = ?',
            [id, req.user.userId]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Cascade deletes handled by FK constraints; delete project
        await turso.execute('DELETE FROM projects WHERE project_id = ?', [id]);
        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

module.exports = router;
