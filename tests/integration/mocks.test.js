'use strict';

/**
 * tests/integration/mocks.test.js
 *
 * Integration tests for /projects/:projectId/mocks and /mocks/:id routes,
 * including response CRUD and the conditions field.
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const turso = require('../../db');
const { buildTestApp, ensureTestUser } = require('../setup/testApp');

let app;
const TEST_USER_ID = 'user_test_001';

beforeAll(async () => {
    await ensureTestUser(TEST_USER_ID);
    app = buildTestApp();
});

beforeEach(async () => {
    await turso.execute('DELETE FROM mock_responses');
    await turso.execute('DELETE FROM mocks');
    await turso.execute('DELETE FROM projects');
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createProject(name = 'Test Project') {
    const res = await request(app).post('/projects').send({ name });
    return res.body.data;
}

async function createMock(projectId, overrides = {}) {
    const res = await request(app)
        .post(`/projects/${projectId}/mocks`)
        .send({ name: 'Test Mock', path: '/test', method: 'GET', ...overrides });
    return res.body.data;
}

// ─── Mock CRUD ────────────────────────────────────────────────────────────────

describe('POST /projects/:projectId/mocks', () => {
    test('creates a mock and returns 201', async () => {
        const project = await createProject();
        const res = await request(app)
            .post(`/projects/${project.project_id}/mocks`)
            .send({ name: 'Get Users', path: '/users', method: 'GET' });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ name: 'Get Users', path: '/users', method: 'GET' });
    });

    test('returns 400 when path is missing', async () => {
        const project = await createProject();
        const res = await request(app)
            .post(`/projects/${project.project_id}/mocks`)
            .send({ name: 'Missing path' });

        expect(res.status).toBe(400);
    });

    test('returns 404 for unknown project', async () => {
        const res = await request(app)
            .post('/projects/does-not-exist/mocks')
            .send({ name: 'X', path: '/x', method: 'GET' });

        expect(res.status).toBe(404);
    });
});

describe('GET /projects/:projectId/mocks', () => {
    test('lists mocks with response_count', async () => {
        const project = await createProject();
        await createMock(project.project_id, { path: '/a', name: 'A' });
        await createMock(project.project_id, { path: '/b', name: 'B' });

        const res = await request(app).get(`/projects/${project.project_id}/mocks`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0]).toHaveProperty('response_count');
    });
});

describe('GET /mocks/:id', () => {
    test('returns mock with responses array', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const res = await request(app).get(`/mocks/${mock.mock_id}`);
        expect(res.status).toBe(200);
        expect(res.body.data.mock_id).toBe(mock.mock_id);
        expect(Array.isArray(res.body.data.responses)).toBe(true);
    });

    test('returns 404 for unknown mock', async () => {
        const res = await request(app).get('/mocks/does-not-exist');
        expect(res.status).toBe(404);
    });
});

describe('PUT /mocks/:id', () => {
    test('updates mock name', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const res = await request(app)
            .put(`/mocks/${mock.mock_id}`)
            .send({ name: 'Updated Name', path: '/updated' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated Name');
    });
});

describe('DELETE /mocks/:id', () => {
    test('deletes mock and returns 200', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const del = await request(app).delete(`/mocks/${mock.mock_id}`);
        expect(del.status).toBe(200);

        const get = await request(app).get(`/mocks/${mock.mock_id}`);
        expect(get.status).toBe(404);
    });
});

// ─── Response CRUD ────────────────────────────────────────────────────────────

describe('POST /mocks/:id/responses', () => {
    test('creates a response with status 201', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const res = await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'Success', statusCode: 200, body: '{"ok":true}', isDefault: true });

        expect(res.status).toBe(201);
        expect(res.body.data.status_code).toBe(200);
        expect(res.body.data.is_default).toBe(1);
    });

    test('stores conditions JSON correctly', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);
        const conditions = [
            { type: 'header', field: 'x-role', operator: 'equals', value: 'admin' },
        ];

        const res = await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'Admin Only', statusCode: 200, body: '{}', conditions });

        expect(res.status).toBe(201);
        expect(JSON.parse(res.body.data.conditions)).toEqual(conditions);
    });

    test('setting isDefault auto-unsets previous default', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'Old Default', isDefault: true });

        await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'New Default', isDefault: true });

        const all = await request(app).get(`/mocks/${mock.mock_id}`);
        const defaults = all.body.data.responses.filter((r) => r.is_default === 1);
        expect(defaults.length).toBe(1);
        expect(defaults[0].name).toBe('New Default');
    });
});

describe('PUT /mocks/:id/responses/:responseId', () => {
    test('updates response fields including conditions', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const createRes = await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'Before', statusCode: 200, body: 'old' });

        const responseId = createRes.body.data.response_id;
        const conditions = [{ type: 'query', field: 'env', operator: 'equals', value: 'prod' }];

        const updateRes = await request(app)
            .put(`/mocks/${mock.mock_id}/responses/${responseId}`)
            .send({ name: 'After', conditions });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.name).toBe('After');
        expect(JSON.parse(updateRes.body.data.conditions)).toEqual(conditions);
    });
});

describe('DELETE /mocks/:id/responses/:responseId', () => {
    test('deletes a response', async () => {
        const project = await createProject();
        const mock = await createMock(project.project_id);

        const createRes = await request(app)
            .post(`/mocks/${mock.mock_id}/responses`)
            .send({ name: 'To Delete' });

        const responseId = createRes.body.data.response_id;

        const del = await request(app)
            .delete(`/mocks/${mock.mock_id}/responses/${responseId}`);
        expect(del.status).toBe(200);

        const all = await request(app).get(`/mocks/${mock.mock_id}`);
        const found = all.body.data.responses.find((r) => r.response_id === responseId);
        expect(found).toBeUndefined();
    });
});
