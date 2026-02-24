'use strict';

/**
 * tests/unit/execution.test.js
 *
 * Unit tests for the pure functions in utils/execution.js:
 *  - matchPath
 *  - evaluateCondition
 *  - responseMatchesConditions
 *  - pickResponse
 *
 * These tests have zero external dependencies — no DB, no HTTP.
 */

const {
    matchPath,
    evaluateCondition,
    responseMatchesConditions,
    pickResponse,
} = require('../../utils/execution');

// ─── matchPath ────────────────────────────────────────────────────────────────

describe('matchPath', () => {
    test('matches exact static path', () => {
        const result = matchPath('/users', '/users');
        expect(result.isMatch).toBe(true);
        expect(result.params).toEqual({});
    });

    test('does not match different static paths', () => {
        const result = matchPath('/users', '/products');
        expect(result.isMatch).toBe(false);
    });

    test('extracts a single path parameter', () => {
        const result = matchPath('/users/{id}', '/users/123');
        expect(result.isMatch).toBe(true);
        expect(result.params).toEqual({ id: '123' });
    });

    test('extracts multiple path parameters', () => {
        const result = matchPath('/users/{id}/posts/{postId}', '/users/42/posts/99');
        expect(result.isMatch).toBe(true);
        expect(result.params).toEqual({ id: '42', postId: '99' });
    });

    test('does not match if segment count differs', () => {
        const result = matchPath('/users/{id}', '/users/42/extra');
        expect(result.isMatch).toBe(false);
    });

    test('handles paths with dot characters', () => {
        const result = matchPath('/v1.0/users', '/v1.0/users');
        expect(result.isMatch).toBe(true);
    });
});

// ─── evaluateCondition ────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
    const makeReq = ({ headers = {}, query = {}, body = {} } = {}) => ({
        headers, query, body,
    });

    // Header conditions
    describe('type: header', () => {
        test('equals — match', () => {
            const req = makeReq({ headers: { 'x-role': 'admin' } });
            expect(evaluateCondition({ type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }, req)).toBe(true);
        });

        test('equals — no match', () => {
            const req = makeReq({ headers: { 'x-role': 'user' } });
            expect(evaluateCondition({ type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }, req)).toBe(false);
        });

        test('equals — header missing', () => {
            const req = makeReq({ headers: {} });
            expect(evaluateCondition({ type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }, req)).toBe(false);
        });

        test('field lookup is case-insensitive', () => {
            // Headers stored lowercase by Express; field should still work if specified uppercase
            const req = makeReq({ headers: { 'authorization': 'Bearer token' } });
            expect(evaluateCondition({ type: 'header', field: 'Authorization', operator: 'contains', value: 'Bearer' }, req)).toBe(true);
        });

        test('contains — match', () => {
            const req = makeReq({ headers: { 'accept': 'application/json, text/html' } });
            expect(evaluateCondition({ type: 'header', field: 'accept', operator: 'contains', value: 'application/json' }, req)).toBe(true);
        });

        test('regex — match', () => {
            const req = makeReq({ headers: { 'user-agent': 'Mozilla/5.0' } });
            expect(evaluateCondition({ type: 'header', field: 'user-agent', operator: 'regex', value: '^Mozilla' }, req)).toBe(true);
        });

        test('regex — invalid pattern returns false (no throw)', () => {
            const req = makeReq({ headers: { 'x-test': 'hello' } });
            expect(evaluateCondition({ type: 'header', field: 'x-test', operator: 'regex', value: '[invalid' }, req)).toBe(false);
        });
    });

    // Query conditions
    describe('type: query', () => {
        test('equals — match', () => {
            const req = makeReq({ query: { status: 'active' } });
            expect(evaluateCondition({ type: 'query', field: 'status', operator: 'equals', value: 'active' }, req)).toBe(true);
        });

        test('equals — no match', () => {
            const req = makeReq({ query: { status: 'inactive' } });
            expect(evaluateCondition({ type: 'query', field: 'status', operator: 'equals', value: 'active' }, req)).toBe(false);
        });

        test('missing param returns false', () => {
            const req = makeReq({ query: {} });
            expect(evaluateCondition({ type: 'query', field: 'status', operator: 'equals', value: 'active' }, req)).toBe(false);
        });
    });

    // Body conditions
    describe('type: body', () => {
        test('equals — match on JSON body field', () => {
            const req = makeReq({ body: { action: 'delete' } });
            expect(evaluateCondition({ type: 'body', field: 'action', operator: 'equals', value: 'delete' }, req)).toBe(true);
        });

        test('returns false when body is not an object', () => {
            const req = { headers: {}, query: {}, body: 'plain string' };
            expect(evaluateCondition({ type: 'body', field: 'action', operator: 'equals', value: 'delete' }, req)).toBe(false);
        });
    });

    // Path conditions
    describe('type: path', () => {
        test('equals — match', () => {
            const req = makeReq();
            expect(evaluateCondition({ type: 'path', field: 'id', operator: 'equals', value: '42' }, req, { id: '42' })).toBe(true);
        });

        test('missing path param returns false', () => {
            const req = makeReq();
            expect(evaluateCondition({ type: 'path', field: 'id', operator: 'equals', value: '42' }, req, {})).toBe(false);
        });
    });

    // Unknown type
    test('unknown type returns false', () => {
        const req = makeReq();
        expect(evaluateCondition({ type: 'cookie', field: 'session', operator: 'equals', value: 'abc' }, req)).toBe(false);
    });

    // Unknown operator
    test('unknown operator returns false', () => {
        const req = makeReq({ headers: { 'x-a': 'b' } });
        expect(evaluateCondition({ type: 'header', field: 'x-a', operator: 'startsWith', value: 'b' }, req)).toBe(false);
    });
});

// ─── responseMatchesConditions ────────────────────────────────────────────────

describe('responseMatchesConditions', () => {
    const req = {
        headers: { 'x-role': 'admin' },
        query: {},
        body: {},
    };

    test('empty conditions array always matches (hasConditions = false)', () => {
        const result = responseMatchesConditions({ conditions: '[]' }, req);
        expect(result).toEqual({ matches: true, hasConditions: false });
    });

    test('missing conditions always matches', () => {
        const result = responseMatchesConditions({}, req);
        expect(result).toEqual({ matches: true, hasConditions: false });
    });

    test('invalid JSON conditions treated as empty (always matches)', () => {
        const result = responseMatchesConditions({ conditions: 'NOT_JSON' }, req);
        expect(result).toEqual({ matches: true, hasConditions: false });
    });

    test('all conditions match → matches: true', () => {
        const conditions = JSON.stringify([
            { type: 'header', field: 'x-role', operator: 'equals', value: 'admin' },
        ]);
        const result = responseMatchesConditions({ conditions }, req);
        expect(result).toEqual({ matches: true, hasConditions: true });
    });

    test('one condition fails → matches: false', () => {
        const conditions = JSON.stringify([
            { type: 'header', field: 'x-role', operator: 'equals', value: 'admin' },
            { type: 'header', field: 'x-missing', operator: 'equals', value: 'something' },
        ]);
        const result = responseMatchesConditions({ conditions }, req);
        expect(result).toEqual({ matches: false, hasConditions: true });
    });
});

// ─── pickResponse ─────────────────────────────────────────────────────────────

describe('pickResponse', () => {
    const emptyReq = { headers: {}, query: {}, body: {} };

    test('returns null for empty array', () => {
        expect(pickResponse([], emptyReq)).toBeNull();
    });

    test('returns null for null/undefined', () => {
        expect(pickResponse(null, emptyReq)).toBeNull();
        expect(pickResponse(undefined, emptyReq)).toBeNull();
    });

    test('returns the only response when array has one item', () => {
        const resp = { response_id: '1', weight: 100, conditions: '[]' };
        expect(pickResponse([resp], emptyReq)).toBe(resp);
    });

    test('returns is_default response when all weights are 0', () => {
        const r1 = { response_id: '1', weight: 0, is_default: 0, conditions: '[]' };
        const r2 = { response_id: '2', weight: 0, is_default: 1, conditions: '[]' };
        expect(pickResponse([r1, r2], emptyReq)).toBe(r2);
    });

    test('returns first response when all weights are 0 and no default', () => {
        const r1 = { response_id: '1', weight: 0, is_default: 0, conditions: '[]' };
        const r2 = { response_id: '2', weight: 0, is_default: 0, conditions: '[]' };
        expect(pickResponse([r1, r2], emptyReq)).toBe(r1);
    });

    test('condition-matched responses are preferred over unconditioned', () => {
        const req = { headers: { 'x-role': 'admin' }, query: {}, body: {} };

        const unconditioned = { response_id: 'fallback', weight: 100, is_default: 1, conditions: '[]' };
        const conditional = {
            response_id: 'admin-response',
            weight: 100,
            is_default: 0,
            conditions: JSON.stringify([
                { type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }
            ]),
        };

        // Run 10 times — should always pick the conditional one
        for (let i = 0; i < 10; i++) {
            expect(pickResponse([unconditioned, conditional], req)).toBe(conditional);
        }
    });

    test('falls back to unconditioned when no condition matches', () => {
        const req = { headers: { 'x-role': 'guest' }, query: {}, body: {} };

        const unconditioned = { response_id: 'fallback', weight: 100, is_default: 1, conditions: '[]' };
        const conditional = {
            response_id: 'admin-response',
            weight: 100,
            is_default: 0,
            conditions: JSON.stringify([
                { type: 'header', field: 'x-role', operator: 'equals', value: 'admin' }
            ]),
        };

        // x-role is 'guest' so conditional should not match → always fallback
        for (let i = 0; i < 10; i++) {
            expect(pickResponse([unconditioned, conditional], req)).toBe(unconditioned);
        }
    });

    test('respects weighted distribution (statistical heuristic)', () => {
        // Weight 99 vs 1: first response should be selected ~99% of the time
        const heavy = { response_id: 'heavy', weight: 99, is_default: 0, conditions: '[]' };
        const light = { response_id: 'light', weight: 1, is_default: 0, conditions: '[]' };

        let heavyCount = 0;
        const iterations = 1000;
        for (let i = 0; i < iterations; i++) {
            if (pickResponse([heavy, light], emptyReq) === heavy) heavyCount++;
        }

        // Expect at least 90% heavy (should be ~99%)
        expect(heavyCount / iterations).toBeGreaterThan(0.90);
    });
});
