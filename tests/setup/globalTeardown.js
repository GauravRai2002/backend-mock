'use strict';

/**
 * tests/setup/globalTeardown.js
 *
 * Runs once after ALL test suites.
 * Deletes the test.db file created by globalSetup.
 */

const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, '..', '..', 'test.db');

async function globalTeardown() {
    try {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    } catch (e) {
        // Best-effort cleanup — ignore errors
    }
}

module.exports = globalTeardown;
