'use strict';

/**
 * tests/integration/projects.test.js
 *
 * Integration tests for the /projects endpoints.
 * Schema and test user are created via testApp's ensureTestUser() which
 * runs in the same process and DB connection as the route handlers.
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
    // Clear data tables before each test for isolation
    await turso.execute('DELETE FROM mock_responses');
    await turso.execute('DELETE FROM mocks');
    await turso.execute('DELETE FROM projects');
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /projects', () => {
    test('creates a project and returns 201', async () => {
        const res = await request(app)
            .post('/projects')
            .send({ name: 'My API', description: 'Test project' });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            name: 'My API',
            description: 'Test project',
            user_id: TEST_USER_ID,
        });
        expect(res.body.data.project_id).toBeTruthy();
        expect(res.body.data.slug).toBeTruthy();
    });

    test('returns 400 when name is missing', async () => {
        const res = await request(app)
            .post('/projects')
            .send({ description: 'No name' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
    });

    test('auto-generates slug from name', async () => {
        const res = await request(app)
            .post('/projects')
            .send({ name: 'My Awesome API' });

        expect(res.status).toBe(201);
        expect(res.body.data.slug).toMatch(/my-awesome-api/i);
    });
});

describe('GET /projects', () => {
    test('returns empty list when no projects exist', async () => {
        const res = await request(app).get('/projects');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    test('returns projects for the current user', async () => {
        await request(app).post('/projects').send({ name: 'Alpha' });
        await request(app).post('/projects').send({ name: 'Beta' });

        const res = await request(app).get('/projects');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
    });
});

describe('GET /projects/:id', () => {
    test('returns project with mocks array', async () => {
        const create = await request(app)
            .post('/projects')
            .send({ name: 'Detail Test' });

        const projectId = create.body.data.project_id;
        const res = await request(app).get(`/projects/${projectId}`);

        expect(res.status).toBe(200);
        expect(res.body.data.project_id).toBe(projectId);
        expect(Array.isArray(res.body.data.mocks)).toBe(true);
    });

    test('returns 404 for unknown project', async () => {
        const res = await request(app).get('/projects/does-not-exist');
        expect(res.status).toBe(404);
    });
});

describe('PUT /projects/:id', () => {
    test('updates project name and description', async () => {
        const create = await request(app)
            .post('/projects').send({ name: 'Before' });
        const id = create.body.data.project_id;

        const res = await request(app)
            .put(`/projects/${id}`)
            .send({ name: 'After', description: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('After');
        expect(res.body.data.description).toBe('Updated');
    });
});

describe('DELETE /projects/:id', () => {
    test('deletes a project and returns 200', async () => {
        const create = await request(app)
            .post('/projects').send({ name: 'To Delete' });
        const id = create.body.data.project_id;

        const del = await request(app).delete(`/projects/${id}`);
        expect(del.status).toBe(200);

        const get = await request(app).get(`/projects/${id}`);
        expect(get.status).toBe(404);
    });
});

describe('POST /projects/:id/duplicate', () => {
    test('clones a project and returns 201', async () => {
        const create = await request(app)
            .post('/projects').send({ name: 'Original' });
        const id = create.body.data.project_id;

        await request(app)
            .post(`/projects/${id}/mocks`)
            .send({ name: 'My Mock', path: '/hello', method: 'GET' });

        const dup = await request(app).post(`/projects/${id}/duplicate`);
        expect(dup.status).toBe(201);
        expect(dup.body.data.name).toContain('Copy');
        expect(dup.body.data.project_id).not.toBe(id);
    });
});
