'use strict';

const dotenv = require('dotenv');
dotenv.config();

const { createClient } = require('@libsql/client');
const path = require('path');

/**
 * db.js — shared database client.
 *
 * In test environments (NODE_ENV=test), we connect to a local `test.db` file
 * so that every require() of this module gets the same underlying database.
 * (:memory: would create isolated, empty databases per require() invocation.)
 */
const isTest = process.env.NODE_ENV === 'test';

const turso = createClient(
  isTest
    ? { url: `file:${path.join(__dirname, 'test.db')}` }
    : {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }
);

module.exports = turso;