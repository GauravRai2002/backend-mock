'use strict';

/**
 * tests/integration/execution.test.js
 *
 * Integration tests for the public mock execution engine: ANY /m/:slug/*path
 *
 * IMPORTANT: The POST /projects route auto-generates slugs from the name.
 * We must read the returned slug from the response body and use that in
 * our /m/:slug/* requests.
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const turso = require('../../db');
const { buildTestApp, ensureTestUser } = require('../setup/testApp');

let app;

beforeAll(async () => {
    await ensureTestUser();
    app = buildTestApp();
});

beforeEach(async () => {
    await turso.execute('DELETE FROM request_logs');
    await turso.execute('DELETE FROM mock_responses');
    await turso.execute('DELETE FROM mocks');
    await turso.execute('DELETE FROM projects');
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Creates a project and returns { project_id, slug, ... } */
async function createProject(name) {
    const res = await request(app).post('/projects').send({ name });
    expect(res.status).toBe(201); // fail fast if project creation breaks
    return res.body.data;
}

async function createMock(projectId, path, method = 'GET') {
    const res = await request(app)
        .post(`/projects/${projectId}/mocks`)
        .send({ name: `Mock ${path}`, path, method });
    expect(res.status).toBe(201);
    return res.body.data;
}

async function createResponse(mockId, body, statusCode = 200, options = {}) {
    const res = await request(app)
        .post(`/mocks/${mockId}/responses`)
        .send({ name: 'Response', body, statusCode, ...options });
    expect(res.status).toBe(201);
    return res.body.data;
}

// ─── Basic routing ────────────────────────────────────────────────────────────

describe('Mock Execution — basic routing', () => {
    test('returns 200 and the defined body for a matching GET request', async () => {
        const p = await createProject('exec-basic');
        const m = await createMock(p.project_id, '/hello');
        await createResponse(m.mock_id, '{"msg":"hello"}', 200, { isDefault: true });

        const res = await request(app).get(`/m/${p.slug}/hello`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ msg: 'hello' });
    });

    test('returns correct non-200 status code', async () => {
        const p = await createProject('exec-status');
        const m = await createMock(p.project_id, '/not-found');
        await createResponse(m.mock_id, '{"error":"not found"}', 404, { isDefault: true });

        const res = await request(app).get(`/m/${p.slug}/not-found`);
        expect(res.status).toBe(404);
    });

    test('sets custom response headers', async () => {
        const p = await createProject('exec-headers');
        const m = await createMock(p.project_id, '/with-headers');
        await createResponse(m.mock_id, '{}', 200, {
            isDefault: true,
            headers: { 'X-Custom-Header': 'mockbird' },
        });

        const res = await request(app).get(`/m/${p.slug}/with-headers`);
        expect(res.headers['x-custom-header']).toBe('mockbird');
    });

    test('includes CORS Access-Control-Allow-Origin on every response', async () => {
        const p = await createProject('exec-cors');
        const m = await createMock(p.project_id, '/data');
        await createResponse(m.mock_id, '{}', 200, { isDefault: true });

        const res = await request(app).get(`/m/${p.slug}/data`);
        expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    test('handles OPTIONS preflight', async () => {
        const p = await createProject('exec-options');
        const res = await request(app).options(`/m/${p.slug}/anything`);
        expect([200, 204]).toContain(res.status);
    });
});

// ─── 404 Error cases ─────────────────────────────────────────────────────────

describe('Mock Execution — 404 error cases', () => {
    test('returns PROJECT_NOT_FOUND for unknown slug', async () => {
        const res = await request(app).get('/m/this-slug-never-exists/users');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('PROJECT_NOT_FOUND');
    });

    test('returns MOCK_NOT_FOUND when no mock matches', async () => {
        const p = await createProject('exec-empty');

        const res = await request(app).get(`/m/${p.slug}/does-not-exist`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('MOCK_NOT_FOUND');
    });

    test('returns NO_RESPONSE_DEFINED when mock has no responses', async () => {
        const p = await createProject('exec-bare');
        await createMock(p.project_id, '/bare');

        const res = await request(app).get(`/m/${p.slug}/bare`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('NO_RESPONSE_DEFINED');
    });
});

// ─── Path parameter matching ──────────────────────────────────────────────────

describe('Mock Execution — path parameter matching', () => {
    test('matches a parameterized path and returns the response', async () => {
        const p = await createProject('exec-params');
        const m = await createMock(p.project_id, '/users/{id}');
        await createResponse(m.mock_id, '{"matched":true}', 200, { isDefault: true });

        const res = await request(app).get(`/m/${p.slug}/users/42`);
        expect(res.status).toBe(200);
        expect(res.body.matched).toBe(true);
    });

    test('does not match when segment count differs', async () => {
        const p = await createProject('exec-params2');
        await createMock(p.project_id, '/users/{id}');

        const res = await request(app).get(`/m/${p.slug}/users`);
        expect(res.status).toBe(404);
    });
});

// ─── Conditional responses ────────────────────────────────────────────────────

describe('Mock Execution — conditional responses', () => {
    test('returns conditional response when header matches', async () => {
        const p = await createProject('exec-cond');
        const m = await createMock(p.project_id, '/conditional');

        await createResponse(m.mock_id, '{"role":"guest"}', 200, { isDefault: true, weight: 100 });
        await createResponse(m.mock_id, '{"role":"admin"}', 200, {
            isDefault: false, weight: 100,
            conditions: [{ type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }],
        });

        const res = await request(app)
            .get(`/m/${p.slug}/conditional`)
            .set('x-role', 'admin');
        expect(res.body.role).toBe('admin');
    });

    test('returns default when condition does not match', async () => {
        const p = await createProject('exec-cond2');
        const m = await createMock(p.project_id, '/conditional');

        await createResponse(m.mock_id, '{"role":"guest"}', 200, { isDefault: true, weight: 100 });
        await createResponse(m.mock_id, '{"role":"admin"}', 200, {
            conditions: [{ type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }],
        });

        const res = await request(app).get(`/m/${p.slug}/conditional`);
        expect(res.body.role).toBe('guest');
    });

    test('conditions on query parameters work correctly', async () => {
        const p = await createProject('exec-querycond');
        const m = await createMock(p.project_id, '/items');

        await createResponse(m.mock_id, '{"mode":"default"}', 200, { isDefault: true });
        await createResponse(m.mock_id, '{"mode":"debug"}', 200, {
            conditions: [{ type: 'query', field: 'debug', operator: 'equals', value: 'true' }],
        });

        const debugRes = await request(app).get(`/m/${p.slug}/items?debug=true`);
        expect(debugRes.body.mode).toBe('debug');

        const normalRes = await request(app).get(`/m/${p.slug}/items`);
        expect(normalRes.body.mode).toBe('default');
    });
});

// ─── Request logging ──────────────────────────────────────────────────────────

describe('Mock Execution — request logging', () => {
    test('creates a request log entry after execution', async () => {
        const p = await createProject('exec-log');
        const m = await createMock(p.project_id, '/logged');
        await createResponse(m.mock_id, '{"ok":true}', 200, { isDefault: true });

        await request(app).get(`/m/${p.slug}/logged`);

        // Give the async log a moment to flush
        await new Promise((r) => setTimeout(r, 200));

        const logs = await turso.execute(
            'SELECT * FROM request_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
            [p.project_id]
        );

        expect(logs.rows.length).toBe(1);
        expect(logs.rows[0].request_path).toContain('/logged');
        expect(logs.rows[0].response_status).toBe(200);
    });
});
