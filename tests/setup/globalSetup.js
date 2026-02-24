'use strict';

/**
 * tests/setup/globalSetup.js
 *
 * Runs once before ALL test suites.
 * Creates a fresh test.db SQLite file and initialises the schema.
 * The same file path is used by db.js (when NODE_ENV=test), so all
 * modules in the test process share one database.
 */

process.env.NODE_ENV = 'test';

const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', '..', 'test.db');

async function globalSetup() {
    // Remove stale test.db from previous run
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }

    const db = createClient({ url: `file:${TEST_DB_PATH}` });

    await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            subscription_tier TEXT DEFAULT 'free',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS projects (
            project_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            slug TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            org_id TEXT,
            is_public INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mocks (
            mock_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            method TEXT DEFAULT 'GET',
            description TEXT,
            is_active INTEGER DEFAULT 1,
            response_type TEXT DEFAULT 'json',
            response_delay_ms INTEGER DEFAULT 0,
            expected_body TEXT DEFAULT '',
            expected_headers TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mock_responses (
            response_id TEXT PRIMARY KEY,
            mock_id TEXT NOT NULL,
            name TEXT,
            status_code INTEGER DEFAULT 200,
            headers TEXT DEFAULT '{}',
            body TEXT DEFAULT '',
            is_default INTEGER DEFAULT 0,
            weight INTEGER DEFAULT 100,
            conditions TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS request_logs (
            log_id TEXT PRIMARY KEY,
            mock_id TEXT,
            project_id TEXT,
            request_path TEXT,
            request_method TEXT,
            request_headers TEXT,
            request_body TEXT,
            request_query TEXT,
            response_status INTEGER,
            response_time_ms INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    await db.close();
}

module.exports = globalSetup;
