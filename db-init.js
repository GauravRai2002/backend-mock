const turso = require('./db');

async function init() {
  console.log('🔧 Initializing database tables...');

  // Users (Clerk is the auth source — user_id is the Clerk userId, no password stored)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      subscription_tier TEXT DEFAULT 'free',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Projects — can be owned by a user OR a Clerk organization (org_id)
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      org_id TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);

  // Mocks (endpoints)
  await turso.execute(`
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
    )
  `);

  // Mock responses
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS mock_responses (
      response_id TEXT PRIMARY KEY,
      mock_id TEXT NOT NULL,
      name TEXT,
      status_code INTEGER DEFAULT 200,
      headers TEXT DEFAULT '{}',
      body TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      weight INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (mock_id) REFERENCES mocks(mock_id) ON DELETE CASCADE
    )
  `);

  // Request logs
  await turso.execute(`
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (mock_id) REFERENCES mocks(mock_id) ON DELETE SET NULL
    )
  `);

  console.log('✅ All tables created (or already exist).');

  // ── Migrations (safe to run multiple times) ──────────────────────────────

  // Add org_id to projects if it doesn't exist yet (added in Clerk migration)
  try {
    await turso.execute('ALTER TABLE projects ADD COLUMN org_id TEXT');
    console.log('🔄 Migration: added org_id column to projects');
  } catch (e) {
    // Column already exists — ignore
  }

  // Drop password_hash from users (removed when migrating to Clerk auth)
  try {
    await turso.execute('ALTER TABLE users DROP COLUMN password_hash');
    console.log('🔄 Migration: dropped password_hash from users');
  } catch (e) {
    // Column doesn't exist or already dropped — ignore
  }

  // Add conditions to mock_responses (response conditions logic)
  try {
    await turso.execute("ALTER TABLE mock_responses ADD COLUMN conditions TEXT DEFAULT '[]'");
    console.log('🔄 Migration: added conditions column to mock_responses');
  } catch (e) {
    // Column already exists — ignore
  }

  // Add response_headers and response_body to request_logs (logged by mock execution)
  try {
    await turso.execute("ALTER TABLE request_logs ADD COLUMN response_headers TEXT DEFAULT '{}'");
    console.log('🔄 Migration: added response_headers column to request_logs');
  } catch (e) {
    // Column already exists — ignore
  }
  try {
    await turso.execute("ALTER TABLE request_logs ADD COLUMN response_body TEXT DEFAULT ''");
    console.log('🔄 Migration: added response_body column to request_logs');
  } catch (e) {
    // Column already exists — ignore
  }

  // Add expected_body and expected_headers to mocks
  try {
    await turso.execute("ALTER TABLE mocks ADD COLUMN expected_body TEXT DEFAULT ''");
    console.log('🔄 Migration: added expected_body column to mocks');
  } catch (e) {
    // Column already exists — ignore
  }
  try {
    await turso.execute("ALTER TABLE mocks ADD COLUMN expected_headers TEXT DEFAULT '{}'");
    console.log('🔄 Migration: added expected_headers column to mocks');
  } catch (e) {
    // Column already exists — ignore
  }

  process.exit(0);
}

init().catch((err) => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});
