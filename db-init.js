const turso = require('./db');

async function init() {
  console.log('🔧 Initializing database tables...');

  // Users
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      subscription_tier TEXT DEFAULT 'free',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Projects
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
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
  process.exit(0);
}

init().catch((err) => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});
