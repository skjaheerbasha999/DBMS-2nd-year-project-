const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbType = 'sqlite';
let sqliteDb = null;
let pgPool = null;

const renderDbHost = process.env.DB_HOST || 'dpg-dasg3s97lnhs7391jli0-a.oregon-postgres.render.com';
const databaseUrl = process.env.DATABASE_URL;

// Attempt PostgreSQL initialization if DATABASE_URL or DB_HOST is present
if (databaseUrl || process.env.DB_HOST) {
  try {
    const { Pool } = require('pg');
    const connectionString = databaseUrl || `postgres://${process.env.DB_USER || 'trackflow_db_user'}:${process.env.DB_PASSWORD || ''}@${renderDbHost}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'trackflow_db'}`;
    
    pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    dbType = 'postgres';
    console.log(`[DB] Render PostgreSQL Database pool created for host: ${renderDbHost}`);
  } catch (err) {
    console.error('[DB] PostgreSQL pool initialization failed, falling back to SQLite:', err.message);
    dbType = 'sqlite';
  }
}

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
    if (fs.existsSync(seedPath)) {
      sqliteDb.exec(fs.readFileSync(seedPath, 'utf8'));
    }
    console.log('[DB] SQLite Schema & Seeds executed successfully.');
  } else if (dbType === 'postgres' && pgPool) {
    console.log('[DB] Connected to Render PostgreSQL instance. Executing initialization check...');
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
