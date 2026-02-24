const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');
const { getAuth } = require('@clerk/express');

function getScope(auth) {
    if (auth.orgId) {
        return { scopeWhere: 'org_id = ?', scopeValues: [auth.orgId] };
    }
    return { scopeWhere: 'user_id = ? AND org_id IS NULL', scopeValues: [auth.userId] };
}

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

// Predefined API Templates
const TEMPLATES = [
    {
        id: 'ecommerce',
        name: 'E-commerce API',
        description: 'Standard product catalog, cart, and checkout endpoints',
        mocks: [
            {
                name: 'List Products', path: '/products', method: 'GET', description: 'Returns a list of all products in the catalog',
                responses: [
                    { name: 'Success', statusCode: 200, isDefault: true, body: JSON.stringify([{ id: 1, name: 'Wireless Headphones', price: 99.99, stock: 45 }, { id: 2, name: 'Mechanical Keyboard', price: 129.99, stock: 12 }]) }
                ]
            },
            {
                name: 'Get Product Details', path: '/products/{id}', method: 'GET', description: 'Get details for a single product',
                responses: [
                    { name: 'Found', statusCode: 200, isDefault: true, body: JSON.stringify({ id: 1, name: 'Wireless Headphones', price: 99.99, stock: 45, specs: ['Bluetooth 5.0', 'ANC'] }) },
                    { name: 'Not Found', statusCode: 404, conditions: [{ type: 'path', field: 'id', operator: 'equals', value: '999' }], body: JSON.stringify({ error: 'Product not found' }) }
                ]
            },
            {
                name: 'Add to Cart', path: '/cart', method: 'POST', description: 'Add a product to the shopping cart',
                responses: [
                    { name: 'Added', statusCode: 201, isDefault: true, body: JSON.stringify({ message: 'Added to cart', cartTotal: 99.99 }) },
                    { name: 'Out of Stock', statusCode: 400, conditions: [{ type: 'body', field: 'quantity', operator: 'regex', value: '^[1-9][0-9]{2,}$' }], body: JSON.stringify({ error: 'Requested quantity exceeds available stock' }) }
                ]
            },
            {
                name: 'Checkout', path: '/checkout', method: 'POST', description: 'Process payment and complete order',
                responses: [
                    { name: 'Success', statusCode: 200, isDefault: true, body: JSON.stringify({ orderId: 'ORD-8X9Y2Z', status: 'Payment successful', estimatedDelivery: '3-5 business days' }) },
                    { name: 'Payment Failed', statusCode: 402, conditions: [{ type: 'header', field: 'authorization', operator: 'equals', value: 'Bearer declinethis' }], body: JSON.stringify({ error: 'Card declined by issuing bank' }) }
                ]
            }
        ]
    },
    {
        id: 'auth',
        name: 'Authentication API',
        description: 'Registration, login, and token refresh endpoints',
        mocks: [
            {
                name: 'Register', path: '/auth/register', method: 'POST', description: 'Create a new user account',
                responses: [
                    { name: 'Created', statusCode: 201, isDefault: true, body: JSON.stringify({ userId: 'us_123', email: 'test@example.com', token: 'jwt_mock_token_abc123' }) },
                    { name: 'Email Taken', statusCode: 409, conditions: [{ type: 'body', field: 'email', operator: 'equals', value: 'admin@example.com' }], body: JSON.stringify({ error: 'Email already in use' }) }
                ]
            },
            {
                name: 'Login', path: '/auth/login', method: 'POST', description: 'Authenticate user and return token',
                responses: [
                    { name: 'Success', statusCode: 200, isDefault: true, body: JSON.stringify({ token: 'jwt_mock_token_abc123', user: { id: 'us_123', role: 'user' } }) },
                    { name: 'Invalid Credentials', statusCode: 401, conditions: [{ type: 'body', field: 'password', operator: 'equals', value: 'wrongpassword' }], body: JSON.stringify({ error: 'Invalid email or password' }) }
                ]
            },
            {
                name: 'Get Current User', path: '/auth/me', method: 'GET', description: 'Get profile of logged in user',
                responses: [
                    { name: 'Success', statusCode: 200, isDefault: true, body: JSON.stringify({ id: 'us_123', email: 'test@example.com', role: 'user', verified: true }) },
                    { name: 'Unauthorized', statusCode: 401, conditions: [{ type: 'header', field: 'authorization', operator: 'equals', value: 'Bearer expired_token' }], body: JSON.stringify({ error: 'Token expired or invalid' }) }
                ]
            }
        ]
    },
    {
        id: 'todos',
        name: 'To-Do List API',
        description: 'Simple CRUD API for managing tasks',
        mocks: [
            {
                name: 'List Tasks', path: '/todos', method: 'GET', description: 'Get all tasks',
                responses: [
                    { name: 'Success', statusCode: 200, isDefault: true, body: JSON.stringify([{ id: 1, title: 'Buy groceries', completed: false }, { id: 2, title: 'Finish MockBird Launch', completed: true }]) }
                ]
            },
            {
                name: 'Create Task', path: '/todos', method: 'POST', description: 'Create a new task',
                responses: [
                    { name: 'Created', statusCode: 201, isDefault: true, body: JSON.stringify({ id: 3, title: 'New Task', completed: false }) }
                ]
            },
            {
                name: 'Update Task', path: '/todos/{id}', method: 'PUT', description: 'Update an existing task',
                responses: [
                    { name: 'Updated', statusCode: 200, isDefault: true, body: JSON.stringify({ id: 3, title: 'Updated Task', completed: true }) }
                ]
            },
            {
                name: 'Delete Task', path: '/todos/{id}', method: 'DELETE', description: 'Delete a task',
                responses: [
                    { name: 'Deleted', statusCode: 200, isDefault: true, body: JSON.stringify({ message: 'Task deleted successfully' }) }
                ]
            }
        ]
    }
];

// GET /templates
// Returns the list of all available templates (without the heavy responses data)
router.get('/', (req, res) => {
    const list = TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        endpointCount: t.mocks.length
    }));
    res.status(200).json({ data: list });
});

// GET /templates/:id
// Returns full template details including mocks and responses for preview/overview
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const template = TEMPLATES.find(t => t.id === id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    res.status(200).json({ data: template });
});

// POST /templates/:id/apply
// Applies a template. Can either apply to an existing project (provide projectId)
// or create a new project (provide projectName).
// Body: { projectId?: "uuid", projectName?: "string" }
router.post('/:id/apply', async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, projectName } = req.body;

        if (!projectId && !projectName) {
            return res.status(400).json({ error: 'Either projectId or projectName must be provided' });
        }

        const template = TEMPLATES.find(t => t.id === id);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        const auth = getAuth(req);
        let targetProjectId = projectId;
        const now = new Date().toISOString();

        if (projectId) {
            // Validate existing project ownership
            const { scopeWhere, scopeValues } = getScope(auth);
            const projectCheck = await turso.execute(
                `SELECT project_id FROM projects WHERE project_id = ? AND (${scopeWhere})`,
                [projectId, ...scopeValues]
            );
            if (projectCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Project not found or you do not have permission' });
            }
        } else if (projectName) {
            // Create a new project
            targetProjectId = uuidv4();
            const slug = await uniqueSlug(generateSlug(projectName));

            await turso.execute(
                `INSERT INTO projects (project_id, name, description, slug, user_id, org_id, is_public, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    targetProjectId,
                    projectName,
                    `Created from '${template.name}' template`,
                    slug,
                    auth.userId,
                    auth.orgId || null,
                    0,
                    now,
                    now
                ]
            );
        }
        const createdMocks = [];

        // Insert Mocks & Responses
        // Doing this sequentially is safer for SQLite/Turso than a massive multi-statement batch when UUIDs are generated in JS
        for (const mockData of template.mocks) {
            const mockId = uuidv4();
            await turso.execute(
                `INSERT INTO mocks (mock_id, project_id, name, path, method, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [mockId, targetProjectId, mockData.name, mockData.path, mockData.method, mockData.description || '', now, now]
            );

            for (const respData of mockData.responses) {
                const responseId = uuidv4();
                const conditionsStr = respData.conditions ? JSON.stringify(respData.conditions) : '[]';
                await turso.execute(
                    `INSERT INTO mock_responses (response_id, mock_id, name, status_code, body, is_default, conditions, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [responseId, mockId, respData.name, respData.statusCode, respData.body || '', respData.isDefault ? 1 : 0, conditionsStr, now]
                );
            }

            createdMocks.push({ id: mockId, name: mockData.name, path: mockData.path });
        }

        res.status(201).json({
            message: `Template '${template.name}' applied successfully`,
            projectId: targetProjectId,
            appliedMocks: createdMocks.length
        });
    } catch (error) {
        console.error('Apply template error:', error);
        res.status(500).json({ error: 'Failed to apply template' });
    }
});

module.exports = router;
