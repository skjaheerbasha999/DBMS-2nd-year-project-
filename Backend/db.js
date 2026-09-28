const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbType = 'sqlite';
let sqliteDb = null;
let pgPool = null;

const renderDbHost = process.env.DB_HOST || 'dpg-dasg3s97lnhs7391jli0-a.oregon-postgres.render.com';
const databaseUrl = process.env.DATABASE_URL;

// Fallback to SQLite if PostgreSQL isn't active
if (dbType === 'sqlite' || !pgPool) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(__dirname, 'database.sqlite');
    sqliteDb = new DatabaseSync(dbPath);
    dbType = 'sqlite';
    console.log(`[DB] Connected to SQLite database at ${dbPath}`);
  } catch (err) {
    console.error('[DB] SQLite initialization failed:', err.message);
  }
}

function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath = path.join(__dirname, 'seed.sql');

  if (dbType === 'sqlite' && sqliteDb) {
    if (fs.existsSync(schemaPath)) {
      sqliteDb.exec(fs.readFileSync(schemaPath, 'utf8'));
    }

    // Migration helper for existing SQLite databases
    try {
      sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN category TEXT DEFAULT 'Backend';`);
    } catch (e) {}
    try {
      sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_solution_json TEXT;`);
    } catch (e) {}
    try {
      sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_status TEXT DEFAULT 'Not Requested';`);
    } catch (e) {}
    try {
      sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_attempts INTEGER DEFAULT 0;`);
    } catch (e) {}

    if (fs.existsSync(seedPath)) {
      sqliteDb.exec(fs.readFileSync(seedPath, 'utf8'));
    }
    console.log('[DB] SQLite Schema, Migrations & Seeds executed successfully.');
  }
}

function queryAll(sql, params = []) {
  if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params);
  }
  return [];
}

function queryOne(sql, params = []) {
  if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.get(...params);
  }
  return null;
}

function execute(sql, params = []) {
  if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.run(...params);
  }
  return { lastInsertRowid: Date.now() };
}

module.exports = {
  dbType,
  renderDbHost,
  initDb,
  queryAll,
  queryOne,
  execute
};
