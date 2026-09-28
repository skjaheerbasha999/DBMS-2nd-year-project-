const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

let dbType = 'sqlite';
let sqliteDb = null;
let pgPool = null;

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;
const dbPort = process.env.DB_PORT || 5432;
const databaseUrl = process.env.DATABASE_URL;

// Initialize Database connection (PostgreSQL on Render, SQLite fallback for local dev)
if (databaseUrl || (dbHost && dbUser && dbName && dbPassword)) {
  try {
    const connectionString = databaseUrl || `postgres://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword || '')}@${dbHost}:${dbPort}/${dbName}`;
    pgPool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'development' && !databaseUrl && !dbHost.includes('render.com') ? false : { rejectUnauthorized: false }
    });
    dbType = 'postgres';
    console.log(`[DB] Connected to PostgreSQL database at ${dbHost || 'DATABASE_URL'}`);
  } catch (err) {
    console.error('[DB] PostgreSQL pool initialization failed, falling back to SQLite:', err.message);
    dbType = 'sqlite';
  }
}

function initSqliteInstance() {
  if (!sqliteDb) {
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
}

if (dbType === 'sqlite' || !pgPool) {
  initSqliteInstance();
}

// Convert SQLite ? placeholders to PostgreSQL $1, $2...
function formatPgSql(sql) {
  let paramIndex = 1;
  let formatted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  
  // Replace SQLite specific DATE("now") with CURRENT_DATE or CURRENT_TIMESTAMP
  formatted = formatted.replace(/DATE\("now"\)/gi, 'CURRENT_DATE');
  formatted = formatted.replace(/DATETIME\('now'\)/gi, 'CURRENT_TIMESTAMP');
  
  // Quote USER table name in Postgres
  formatted = formatted.replace(/\bFROM USER\b/gi, 'FROM "USER"');
  formatted = formatted.replace(/\bJOIN USER\b/gi, 'JOIN "USER"');
  formatted = formatted.replace(/\bINTO USER\b/gi, 'INTO "USER"');
  formatted = formatted.replace(/\bUPDATE USER\b/gi, 'UPDATE "USER"');

  // Replace INSERT OR REPLACE with ON CONFLICT for Postgres
  if (formatted.includes('INSERT OR REPLACE INTO PROJECT_MEMBER')) {
    formatted = formatted.replace(
      /INSERT OR REPLACE INTO PROJECT_MEMBER \((.*?)\) VALUES \((.*?)\)/i,
      'INSERT INTO "PROJECT_MEMBER" ($1) VALUES ($2) ON CONFLICT (project_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role'
    );
  }
  if (formatted.includes('INSERT OR IGNORE INTO')) {
    formatted = formatted.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
  }

  return formatted;
}

// Universal query for array of records
async function queryAll(sql, params = []) {
  if (dbType === 'postgres' && pgPool) {
    const formattedSql = formatPgSql(sql);
    const res = await pgPool.query(formattedSql, params);
    return res.rows;
  } else if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.all(...params);
  }
  return [];
}

// Universal query for single record
async function queryOne(sql, params = []) {
  if (dbType === 'postgres' && pgPool) {
    const formattedSql = formatPgSql(sql);
    const res = await pgPool.query(formattedSql, params);
    return res.rows[0] || null;
  } else if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    return stmt.get(...params) || null;
  }
  return null;
}

// Universal execute for INSERT / UPDATE / DELETE
async function execute(sql, params = []) {
  if (dbType === 'postgres' && pgPool) {
    let formattedSql = formatPgSql(sql);

    // If INSERT statement without RETURNING clause, append RETURNING to get generated ID
    if (/^\s*INSERT\s+INTO/i.test(formattedSql) && !/RETURNING/i.test(formattedSql)) {
      if (formattedSql.includes('"USER"')) formattedSql += ' RETURNING user_id';
      else if (formattedSql.includes('"PROJECT"')) formattedSql += ' RETURNING project_id';
      else if (formattedSql.includes('"ISSUE"')) formattedSql += ' RETURNING issue_id';
      else if (formattedSql.includes('"COMMENT"')) formattedSql += ' RETURNING comment_id';
      else if (formattedSql.includes('"ISSUE_HISTORY"')) formattedSql += ' RETURNING history_id';
      else formattedSql += ' RETURNING *';
    }

    const res = await pgPool.query(formattedSql, params);
    const insertedRow = res.rows[0] || {};
    const lastId = insertedRow.user_id || insertedRow.project_id || insertedRow.issue_id || insertedRow.comment_id || insertedRow.history_id || Date.now();
    return { lastInsertRowid: lastId, rowCount: res.rowCount };
  } else if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    const result = stmt.run(...params);
    return { lastInsertRowid: result.lastInsertRowid };
  }
  return { lastInsertRowid: Date.now() };
}

function runSqliteInit(schemaSql, seedSql) {
  initSqliteInstance();
  if (schemaSql) {
    sqliteDb.exec(schemaSql);
  }
  try { sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN category TEXT DEFAULT 'Backend';`); } catch (e) {}
  try { sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_solution_json TEXT;`); } catch (e) {}
  try { sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_status TEXT DEFAULT 'Not Requested';`); } catch (e) {}
  try { sqliteDb.exec(`ALTER TABLE ISSUE ADD COLUMN ai_attempts INTEGER DEFAULT 0;`); } catch (e) {}

  if (seedSql) {
    sqliteDb.exec(seedSql);
  }
  console.log('[DB] SQLite Schema, Migrations & Seeds executed successfully.');
}

// Schema and Seed Initialization
async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath = path.join(__dirname, 'seed.sql');

  const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
  const seedSql = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf8') : '';

  if (dbType === 'postgres' && pgPool) {
    try {
      console.log('[DB] Testing PostgreSQL connection...');
      await pgPool.query('SELECT 1');

      console.log('[DB] Executing PostgreSQL Schema setup...');
      if (schemaSql) {
        await pgPool.query(schemaSql);
      }

      // Column migrations for PostgreSQL
      const alterQueries = [
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Backend';`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_solution_json TEXT;`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50) DEFAULT 'Not Requested';`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_attempts INT DEFAULT 0;`
      ];
      for (const q of alterQueries) {
        try { await pgPool.query(q); } catch (e) {}
      }

      console.log('[DB] Executing PostgreSQL Seed Data...');
      if (seedSql) {
        const statements = seedSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
          try {
            await pgPool.query(stmt);
          } catch (err) {
            // Ignore duplicate key / conflict warnings in seeding
          }
        }
      }
      console.log('[DB] PostgreSQL Schema, Migrations & Seeds initialized successfully.');
    } catch (err) {
      console.warn('[DB Warning] PostgreSQL connection failed, falling back to SQLite:', err.message);
      dbType = 'sqlite';
      runSqliteInit(schemaSql, seedSql);
    }
  } else {
    runSqliteInit(schemaSql, seedSql);
  }
}

module.exports = {
  dbType,
  initDb,
  queryAll,
  queryOne,
  execute
};
