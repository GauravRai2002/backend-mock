const dotenv = require("dotenv");
dotenv.config();
const { createClient } = require("@libsql/client");

/**
 * Turso database client configuration
 * Creates and exports a configured database client for LibSQL/Turso
 */
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

module.exports = turso; 