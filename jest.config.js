/**
 * jest.config.js
 *
 * Runs all tests in tests/ using Node environment.
 * --runInBand ensures all test files share the same process and therefore
 * the same file-based SQLite database opened by db.js.
 *
 * Schema init happens inside testApp.js (ensureSchema) so it runs in
 * the same process as the route handlers — no separate globalSetup needed.
 */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    testTimeout: 15000,
    verbose: true,
};
