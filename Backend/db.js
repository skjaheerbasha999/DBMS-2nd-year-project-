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

// Determine environment & database mode
const isRender = process.env.RENDER === 'true';
const isProduction = process.env.NODE_ENV === 'production' || isRender;
const preferSqlite = process.env.DB_TYPE === 'sqlite';
const isPostgresConfigured = !preferSqlite && Boolean(databaseUrl || (dbHost && dbUser));

if ((isProduction || isPostgresConfigured) && !preferSqlite) {
  dbType = 'postgres';
  
  let poolConfig;
  if (databaseUrl) {
    poolConfig = {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    };
  } else {
    poolConfig = {
      host: dbHost,
      port: parseInt(dbPort, 10) || 5432,
      database: dbName || 'trackflow_db',
      user: dbUser || 'trackflow_db_user',
      password: dbPassword ? String(dbPassword) : '',
      ssl: { rejectUnauthorized: false }
    };
  }

  try {
    pgPool = new Pool(poolConfig);
    console.log(`[DB] PostgreSQL pool configured for host: ${dbHost || 'DATABASE_URL'}`);
  } catch (err) {
    console.error('[DB Error] Failed to create PostgreSQL pool:', err.message);
    if (isRender) {
      throw new Error(`[DB Fatal] Production requires PostgreSQL: ${err.message}`);
    }
  }
} else {
  // Local development fallback to SQLite
  initSqliteInstance();
}

function initSqliteInstance() {
  if (isRender) {
    throw new Error('[DB Fatal] Refusing to use SQLite in production environment.');
  }
  if (!sqliteDb) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = path.join(__dirname, 'database.sqlite');
      sqliteDb = new DatabaseSync(dbPath);
      dbType = 'sqlite';
      console.log(`[DB] Local development: Connected to SQLite database at ${dbPath}`);
    } catch (err) {
      console.error('[DB Error] SQLite initialization failed:', err.message);
    }
  }
}

// Convert SQLite ? placeholders to PostgreSQL $1, $2... and quote reserved words
function formatPgSql(sql) {
  let paramIndex = 1;
  let formatted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  
  // Replace SQLite specific DATE("now") with CURRENT_DATE or CURRENT_TIMESTAMP
  formatted = formatted.replace(/DATE\("now"\)/gi, 'CURRENT_DATE');
  formatted = formatted.replace(/DATE\('now'\)/gi, 'CURRENT_DATE');
  formatted = formatted.replace(/DATETIME\('now'\)/gi, 'CURRENT_TIMESTAMP');
  formatted = formatted.replace(/DATETIME\("now"\)/gi, 'CURRENT_TIMESTAMP');
  
  // Quote table names in Postgres to handle reserved keywords and casing
  formatted = formatted.replace(/\bFROM USER\b/gi, 'FROM "USER"');
  formatted = formatted.replace(/\bJOIN USER\b/gi, 'JOIN "USER"');
  formatted = formatted.replace(/\bINTO USER\b/gi, 'INTO "USER"');
  formatted = formatted.replace(/\bUPDATE USER\b/gi, 'UPDATE "USER"');

  formatted = formatted.replace(/\bFROM ISSUE\b/gi, 'FROM "ISSUE"');
  formatted = formatted.replace(/\bJOIN ISSUE\b/gi, 'JOIN "ISSUE"');
  formatted = formatted.replace(/\bINTO ISSUE\b/gi, 'INTO "ISSUE"');
  formatted = formatted.replace(/\bUPDATE ISSUE\b/gi, 'UPDATE "ISSUE"');

  formatted = formatted.replace(/\bFROM PROJECT\b/gi, 'FROM "PROJECT"');
  formatted = formatted.replace(/\bJOIN PROJECT\b/gi, 'JOIN "PROJECT"');
  formatted = formatted.replace(/\bINTO PROJECT\b/gi, 'INTO "PROJECT"');
  formatted = formatted.replace(/\bUPDATE PROJECT\b/gi, 'UPDATE "PROJECT"');

  formatted = formatted.replace(/\bFROM PROJECT_MEMBER\b/gi, 'FROM "PROJECT_MEMBER"');
  formatted = formatted.replace(/\bJOIN PROJECT_MEMBER\b/gi, 'JOIN "PROJECT_MEMBER"');
  formatted = formatted.replace(/\bINTO PROJECT_MEMBER\b/gi, 'INTO "PROJECT_MEMBER"');
  formatted = formatted.replace(/\bDELETE FROM PROJECT_MEMBER\b/gi, 'DELETE FROM "PROJECT_MEMBER"');

  formatted = formatted.replace(/\bFROM COMMENT\b/gi, 'FROM "COMMENT"');
  formatted = formatted.replace(/\bJOIN COMMENT\b/gi, 'JOIN "COMMENT"');
  formatted = formatted.replace(/\bINTO COMMENT\b/gi, 'INTO "COMMENT"');

  formatted = formatted.replace(/\bFROM ISSUE_HISTORY\b/gi, 'FROM "ISSUE_HISTORY"');
  formatted = formatted.replace(/\bINTO ISSUE_HISTORY\b/gi, 'INTO "ISSUE_HISTORY"');

  formatted = formatted.replace(/\bFROM REPORT\b/gi, 'FROM "REPORT"');
  formatted = formatted.replace(/\bINTO REPORT\b/gi, 'INTO "REPORT"');

  formatted = formatted.replace(/\bFROM PRIORITY\b/gi, 'FROM "PRIORITY"');
  formatted = formatted.replace(/\bJOIN PRIORITY\b/gi, 'JOIN "PRIORITY"');

  formatted = formatted.replace(/\bFROM STATUS\b/gi, 'FROM "STATUS"');
  formatted = formatted.replace(/\bJOIN STATUS\b/gi, 'JOIN "STATUS"');

  // Replace INSERT OR REPLACE with ON CONFLICT for Postgres
  if (formatted.includes('INSERT OR REPLACE INTO PROJECT_MEMBER') || formatted.includes('INSERT OR REPLACE INTO "PROJECT_MEMBER"')) {
    formatted = formatted.replace(
      /INSERT OR REPLACE INTO "?PROJECT_MEMBER"? \((.*?)\) VALUES \((.*?)\)/i,
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
      else if (formattedSql.includes('"PROJECT_MEMBER"')) formattedSql += ' RETURNING project_id, user_id';
      else if (formattedSql.includes('"PROJECT"')) formattedSql += ' RETURNING project_id';
      else if (formattedSql.includes('"ISSUE_HISTORY"')) formattedSql += ' RETURNING history_id';
      else if (formattedSql.includes('"ISSUE"')) formattedSql += ' RETURNING issue_id';
      else if (formattedSql.includes('"COMMENT"')) formattedSql += ' RETURNING comment_id';
      else formattedSql += ' RETURNING *';
    }

    const res = await pgPool.query(formattedSql, params);
    const insertedRow = res.rows[0] || {};
    const lastId = insertedRow.user_id || insertedRow.project_id || insertedRow.issue_id || insertedRow.comment_id || insertedRow.history_id || Date.now();
    return { lastInsertRowid: lastId, rowCount: res.rowCount };
  } else if (dbType === 'sqlite' && sqliteDb) {
    const stmt = sqliteDb.prepare(sql);
    const result = stmt.run(...params);
    return { lastInsertRowid: result.lastInsertRowid, rowCount: result.changes, changes: result.changes };
  }
  return { lastInsertRowid: Date.now(), rowCount: 0 };
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
      console.log('[DB] PostgreSQL connection verified successfully.');

      console.log('[DB] Creating PostgreSQL tables if not exist...');
      // Strip SQL line comments first so statements are not skipped
      const cleanSchemaSql = schemaSql.replace(/--.*$/gm, '').trim();
      const tableStatements = cleanSchemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of tableStatements) {
        await pgPool.query(stmt);
      }
      console.log('[DB] All PostgreSQL tables verified/created successfully (including ISSUE_HISTORY).');

      // Column migrations for PostgreSQL
      const alterQueries = [
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Backend'`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_solution_json TEXT`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50) DEFAULT 'Not Requested'`,
        `ALTER TABLE "ISSUE" ADD COLUMN IF NOT EXISTS ai_attempts INT DEFAULT 0`
      ];
      for (const q of alterQueries) {
        try { await pgPool.query(q); } catch (e) {}
      }

      // Execute seed data
      if (seedSql) {
        console.log('[DB] Inserting initial seed data into PostgreSQL...');
        const cleanSeedSql = seedSql.replace(/--.*$/gm, '').trim();
        const seedStatements = cleanSeedSql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const stmt of seedStatements) {
          try {
            await pgPool.query(stmt);
          } catch (err) {
            // Ignore conflicts or existing rows during seed
          }
        }
        console.log('[DB] Seed data insertion complete.');
      }

      // Synchronize PostgreSQL sequences with maximum IDs
      const seqQueries = [
        `SELECT setval(pg_get_serial_sequence('"USER"', 'user_id'), COALESCE((SELECT MAX(user_id) FROM "USER"), 1))`,
        `SELECT setval(pg_get_serial_sequence('"PROJECT"', 'project_id'), COALESCE((SELECT MAX(project_id) FROM "PROJECT"), 1))`,
        `SELECT setval(pg_get_serial_sequence('"ISSUE"', 'issue_id'), COALESCE((SELECT MAX(issue_id) FROM "ISSUE"), 1))`,
        `SELECT setval(pg_get_serial_sequence('"COMMENT"', 'comment_id'), COALESCE((SELECT MAX(comment_id) FROM "COMMENT"), 1))`,
        `SELECT setval(pg_get_serial_sequence('"ISSUE_HISTORY"', 'history_id'), COALESCE((SELECT MAX(history_id) FROM "ISSUE_HISTORY"), 1))`
      ];
      for (const sq of seqQueries) {
        try { await pgPool.query(sq); } catch (e) {}
      }
      console.log('[DB] PostgreSQL sequences synchronized successfully.');
      console.log('[DB] PostgreSQL database initialization completed successfully.');
    } catch (err) {
      console.error('[DB Error] PostgreSQL initialization failed:', err.message);
      if (isRender) {
        console.error('[DB Fatal] Running in production on Render. Refusing to fall back to SQLite.');
        console.error('[DB Fatal] Please verify your Render environment variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT (or DATABASE_URL).');
        throw new Error(`[DB Fatal] PostgreSQL connection failed in production: ${err.message}`);
      } else {
        console.warn('[DB Warning] PostgreSQL connection failed, falling back to SQLite for local development:', err.message);
        try { if (pgPool) await pgPool.end(); } catch (e) {}
        pgPool = null;
        dbType = 'sqlite';
        runSqliteInit(schemaSql, seedSql);
      }
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
