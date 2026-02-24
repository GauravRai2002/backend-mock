'use strict';

/**
 * tests/setup/testApp.js
 *
 * Creates and exports a configured Express app for integration tests.
 *
 * Auth mocking is handled by Jest's __mocks__/@clerk/express.js
 * (automatic manual mock). This file only handles:
 *   1. Schema creation (ensureSchema)
 *   2. Test user seeding (ensureTestUser)
 *   3. App factory (buildTestApp)
 */

const turso = require('../../db');

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT,
    subscription_tier TEXT DEFAULT 'free',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    slug TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, org_id TEXT,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mocks (
    mock_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
    path TEXT NOT NULL, method TEXT DEFAULT 'GET', description TEXT,
    is_active INTEGER DEFAULT 1, response_type TEXT DEFAULT 'json',
    response_delay_ms INTEGER DEFAULT 0,
    expected_body TEXT DEFAULT '',
    expected_headers TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mock_responses (
    response_id TEXT PRIMARY KEY, mock_id TEXT NOT NULL, name TEXT,
    status_code INTEGER DEFAULT 200, headers TEXT DEFAULT '{}',
    body TEXT DEFAULT '', is_default INTEGER DEFAULT 0,
    weight INTEGER DEFAULT 100, conditions TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS request_logs (
    log_id TEXT PRIMARY KEY, mock_id TEXT, project_id TEXT,
    request_path TEXT, request_method TEXT, request_headers TEXT,
    request_body TEXT, request_query TEXT, response_status INTEGER,
    response_time_ms INTEGER, response_headers TEXT, response_body TEXT,
    ip_address TEXT, user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
`;

let _schemaReady = null;
async function ensureSchema() {
    if (!_schemaReady) {
        _schemaReady = turso.executeMultiple(SCHEMA_SQL);
    }
    return _schemaReady;
}

// ── Seed test user ──────────────────────────────────────────────────────────

async function ensureTestUser(userId = 'user_test_001') {
    await ensureSchema();
    await turso.execute(
        `INSERT OR IGNORE INTO users (user_id, email, name) VALUES (?, ?, ?)`,
        [userId, `${userId}@test.com`, 'Test User']
    );
}

// ── App factory ─────────────────────────────────────────────────────────────

function buildTestApp() {
    const express = require('express');
    const app = express();
    app.use(express.json());

    const projectsRouter = require('../../routes/projects');
    const mocksRouter = require('../../routes/mocks');
    const mRouter = require('../../routes/m');

    app.use('/projects', projectsRouter);
    app.use('/', mocksRouter);
    app.use('/m', mRouter);

    return app;
}

module.exports = { buildTestApp, ensureSchema, ensureTestUser };
