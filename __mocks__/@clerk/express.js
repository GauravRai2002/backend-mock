'use strict';

/**
 * __mocks__/@clerk/express.js
 *
 * Jest automatic mock for @clerk/express.
 * When any file under test does require('@clerk/express'), Jest picks
 * up this file automatically (because it lives in <rootDir>/__mocks__/@clerk/).
 *
 * The mock provides the same named exports as the real package but with
 * no-op middleware and a controllable auth context.
 */

let _currentAuth = { userId: 'user_test_001', orgId: null };

function setAuthContext(ctx) { _currentAuth = ctx; }
function resetAuthContext() { _currentAuth = { userId: 'user_test_001', orgId: null }; }

module.exports = {
    clerkMiddleware: () => (_req, _res, next) => next(),
    requireAuth: () => (_req, _res, next) => next(),
    getAuth: (_req) => _currentAuth,
    clerkClient: { organizations: {} },

    // Test helpers — not part of the real @clerk/express API
    __setAuthContext: setAuthContext,
    __resetAuthContext: resetAuthContext,
};
