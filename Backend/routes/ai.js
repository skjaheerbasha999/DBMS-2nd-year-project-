const express = require('express');
const router = express.Router();
const { queryOne, execute, queryAll } = require('../db');
require('dotenv').config();

// Helper to query Gemini model with fallbacks
async function callGeminiAPI(promptText, isJson = true) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_API_KEY environment variable is missing on backend.');
  }

  const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
  let lastErr = null;

  for (const model of models) {
    try {
      const bodyPayload = {
        contents: [{ parts: [{ text: promptText }] }]
      };
      if (isJson) {
        bodyPayload.generationConfig = {
          responseMimeType: 'application/json'
        };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return text;
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn(`[AI Route] Model ${model} responded with status ${response.status}:`, errJson?.error?.message || response.statusText);
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[AI Route] Error connecting to ${model}:`, err.message);
    }
  }

  throw lastErr || new Error('All Gemini model endpoints failed.');
}

// Contextual fallback generator supporting deep database and system diagnostics
function generateContextualSolution({ title, description, category, priority, status, commentsText, historyText, isReanalysis }) {
  const t = (title || '').toLowerCase();
  const d = (description || '').toLowerCase();
  const c = (commentsText || '').toLowerCase();
  const h = (historyText || '').toLowerCase();
  const combined = `${t} \n ${d} \n ${c} \n ${h}`;
  const cat = category || 'Backend';
  const prio = priority || 'Medium';

  let problemUnderstanding = '';
  let confirmedCause = null;
  let likelyCause = null;
  let recommendedSolution = '';
  let stepByStepFix = [];
  let exampleCodeFix = '';
  let verification = '';
  let prevention = '';
  let informationStillNeeded = null;

  // 1. SPECIFIC TRACKFLOW DEPLOYMENT PROBLEM
  // Backend is using SQLite fallback and ISSUE_HISTORY table is missing
  const hasSqliteIndicator = combined.includes('connected to sqlite') || combined.includes('database.sqlite') || combined.includes('sqlite');
  const hasMissingIssueHistory = combined.includes('no such table: issue_history') || combined.includes('table "issue_history" does not exist') || combined.includes('relation "issue_history" does not exist') || (combined.includes('issue_history') && combined.includes('no such table'));

  if (hasSqliteIndicator && hasMissingIssueHistory) {
    problemUnderstanding = 'The TrackFlow backend attempted to query or record events into the "ISSUE_HISTORY" table, but the table does not exist in the active SQLite database. This indicates that PostgreSQL connection failed on startup, causing the backend to fall back to local SQLite, where schema migrations failed to create the ISSUE_HISTORY relation prior to insert/query execution.';
    confirmedCause = 'The backend is actively running on SQLite instead of the configured PostgreSQL database, and the ISSUE_HISTORY table is missing from the SQLite database schema.';
    recommendedSolution = 'Migrate the backend database layer to PostgreSQL by configuring valid credentials in .env, and ensure the schema initialization creates the "ISSUE_HISTORY" table before seed data or runtime event logging executes.';
    stepByStepFix = [
      '1. Verify and configure your PostgreSQL environment variables in Backend/.env (or Render dashboard): DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT (5432) or DATABASE_URL.',
      '2. Ensure schema.sql defines the ISSUE_HISTORY relation: CREATE TABLE IF NOT EXISTS "ISSUE_HISTORY" (history_id SERIAL PRIMARY KEY, issue_id INT REFERENCES "ISSUE"(issue_id) ON DELETE CASCADE, event_type VARCHAR(100), description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
      '3. In Backend/db.js, ensure ISSUE_HISTORY table creation statements run during initDb() BEFORE any seed queries or sequence adjustments.',
      '4. If continuing to run SQLite locally, apply the SQLite schema migration: CREATE TABLE IF NOT EXISTS ISSUE_HISTORY (history_id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event_type TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);',
      '5. Restart the backend server (npm start) and verify the console log displays: "[DB] All PostgreSQL tables verified/created successfully (including ISSUE_HISTORY)".'
    ];
    exampleCodeFix = `-- 1. Schema DDL: Guarantee ISSUE_HISTORY exists in PostgreSQL / SQLite:
CREATE TABLE IF NOT EXISTS "ISSUE_HISTORY" (
  history_id SERIAL PRIMARY KEY,
  issue_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES "ISSUE"(issue_id) ON DELETE CASCADE
);

-- 2. Backend .env configuration to use PostgreSQL instead of SQLite:
-- DB_HOST=dpg-xxxx.oregon-postgres.render.com
-- DB_PORT=5432
-- DB_NAME=trackflow_db
-- DB_USER=trackflow_db_user
-- DB_PASSWORD=your_postgres_password`;
    verification = 'Restart the backend and inspect startup logs. Confirm "[DB] PostgreSQL connection verified successfully" and "[DB] All PostgreSQL tables verified/created successfully (including ISSUE_HISTORY)". Verify with: SELECT table_name FROM information_schema.tables WHERE table_name = \'ISSUE_HISTORY\';';
    prevention = 'In production deployment, set NODE_ENV=production so the backend refuses to silently fall back to SQLite when PostgreSQL is unconfigured or unavailable.';
  }

  // 2. COMMON POSTGRESQL / DATABASE ERRORS
  else if (combined.includes('password authentication failed') || combined.includes('authentication failed for user')) {
    problemUnderstanding = `PostgreSQL rejected the database connection attempt for "${title}". The database user credentials provided in the environment configuration are invalid or mismatched.`;
    confirmedCause = 'PostgreSQL rejected client authentication because DB_PASSWORD or DB_USER does not match the PostgreSQL cluster role.';
    recommendedSolution = 'Update DB_USER and DB_PASSWORD in Backend/.env (or the hosting platform environment variables) to match the database role credentials.';
    stepByStepFix = [
      '1. Open Backend/.env and check DB_USER and DB_PASSWORD values.',
      '2. Test logging into PostgreSQL directly using psql or pgAdmin: psql -h <host> -U <user> -d <database>.',
      '3. If password was reset or rotated, copy the exact connection string from Render / Supabase / Neon into DATABASE_URL or DB_PASSWORD.',
      '4. Restart backend server and confirm PostgreSQL pool connects without authentication error.'
    ];
    exampleCodeFix = `# Backend/.env credentials update:
DB_HOST=dpg-xxxx.oregon-postgres.render.com
DB_PORT=5432
DB_NAME=trackflow_db
DB_USER=trackflow_db_user
DB_PASSWORD=your_exact_render_postgres_password`;
    verification = 'Restart backend and verify log displays: "[DB] PostgreSQL connection verified successfully."';
    prevention = 'Use secret managers or verified environment variables; avoid hardcoding stale passwords in local .env files.';
  }
  else if (combined.includes('relation') && (combined.includes('does not exist') || combined.includes('no such table'))) {
    problemUnderstanding = `Database query execution failed because a specified table or relation does not exist in the current database schema for "${title}".`;
    confirmedCause = 'The database query referenced a table that has not been created by migrations, or identifier casing/quoting differs from the database catalog.';
    recommendedSolution = 'Run schema migrations to create the missing table and ensure uppercase table names like "USER", "ISSUE", "PROJECT" are quoted in SQL queries to prevent lowercase folding in PostgreSQL.';
    stepByStepFix = [
      '1. Review the failing SQL query to identify which table name is missing.',
      '2. Inspect Backend/schema.sql to verify the CREATE TABLE statement exists for that relation.',
      '3. Run schema creation or restart backend so initDb() runs table creation statements.',
      '4. If querying in PostgreSQL, ensure reserved keywords and table names are double-quoted (e.g. FROM "USER", FROM "ISSUE").'
    ];
    exampleCodeFix = `-- Ensure table exists and query with quoted identifier:
CREATE TABLE IF NOT EXISTS "ISSUE" (
  issue_id SERIAL PRIMARY KEY,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'Backend',
  status_id INT DEFAULT 1,
  priority_id INT DEFAULT 2,
  reported_by INT NOT NULL,
  assigned_to INT,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Query with quoted identifiers in Postgres:
SELECT * FROM "ISSUE" WHERE issue_id = $1;`;
    verification = 'Execute query: SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'; and verify table is listed.';
    prevention = 'Maintain versioned migrations and wrap all table names in quotes to avoid PostgreSQL lowercase identifier collisions.';
  }
  else if (combined.includes('connection refused') || combined.includes('econnrefused')) {
    problemUnderstanding = `TCP network connection to database host was refused on port 5432 for "${title}".`;
    confirmedCause = 'The PostgreSQL database server is not running, not listening on port 5432, or network firewalls are blocking inbound connections.';
    recommendedSolution = 'Verify that the PostgreSQL service is running, listening on all interfaces (0.0.0.0), and that firewall rules permit inbound traffic on port 5432.';
    stepByStepFix = [
      '1. Check PostgreSQL service status on database host: sudo systemctl status postgresql.',
      '2. In postgresql.conf, verify: listen_addresses = \'*\'.',
      '3. In pg_hba.conf, verify client IP or subnet is allowed to connect.',
      '4. Check if cloud database is sleeping or suspended (e.g. free-tier Render/Supabase instance) and wake it up.'
    ];
    exampleCodeFix = `# Test connectivity to host and port:
powershell -Command "Test-NetConnection -ComputerName <DB_HOST> -Port 5432"`;
    verification = 'Confirm Test-NetConnection returns "TcpTestSucceeded: True" and backend successfully logs "[DB] PostgreSQL connection verified".';
    prevention = 'Set up automated database health monitoring and configure connection retry exponential backoff.';
  }
  else if (combined.includes('foreign key') || combined.includes('foreignkey') || combined.includes('constraint')) {
    problemUnderstanding = `A relational constraint violation occurred during database write operation for "${title}".`;
    confirmedCause = 'The operation attempted to insert or delete a record that violates a foreign key constraint referencing another table.';
    recommendedSolution = 'Ensure parent entities exist before inserting child records, or configure ON DELETE CASCADE / ON DELETE SET NULL on foreign key definitions.';
    stepByStepFix = [
      '1. Identify the foreign key column (e.g. project_id, reported_by, assigned_to, issue_id).',
      '2. Query parent table to ensure the referenced ID exists before executing child INSERT.',
      '3. For DELETE operations where child records must be removed together, add ON DELETE CASCADE to table definition.',
      '4. For optional relations, use ON DELETE SET NULL and allow nullable foreign key columns.'
    ];
    exampleCodeFix = `-- Foreign key definition with cascading deletion:
ALTER TABLE "ISSUE" 
  ADD CONSTRAINT fk_project 
  FOREIGN KEY (project_id) REFERENCES "PROJECT"(project_id) ON DELETE CASCADE;`;
    verification = 'Run test insert with valid parent ID and confirm successful insert with HTTP 201 status.';
    prevention = 'Validate foreign key IDs in application controller before passing them to the database query.';
  }
  else if (combined.includes('duplicate key') || combined.includes('unique constraint') || combined.includes('already exists')) {
    problemUnderstanding = `Unique constraint violation encountered while inserting record for "${title}".`;
    confirmedCause = 'The INSERT statement attempted to insert a value that already exists in a PRIMARY KEY or UNIQUE indexed column.';
    recommendedSolution = 'Synchronize serial auto-increment sequences with the maximum existing ID, or use ON CONFLICT DO UPDATE / ON CONFLICT DO NOTHING.';
    stepByStepFix = [
      '1. Check whether sequence counter is lower than maximum ID in the table.',
      '2. Synchronize PostgreSQL sequence: SELECT setval(pg_get_serial_sequence(\'"ISSUE"\', \'issue_id\'), COALESCE((SELECT MAX(issue_id) FROM "ISSUE"), 1));',
      '3. For upsert operations, specify ON CONFLICT target column and resolution.'
    ];
    exampleCodeFix = `-- Synchronize sequence with current maximum ID:
SELECT setval(pg_get_serial_sequence('"ISSUE"', 'issue_id'), COALESCE((SELECT MAX(issue_id) FROM "ISSUE"), 1));

-- Upsert query example:
INSERT INTO "PROJECT_MEMBER" (project_id, user_id, member_role)
VALUES ($1, $2, $3)
ON CONFLICT (project_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role;`;
    verification = 'Run insert without specifying explicit primary key ID and confirm database assigns next sequential ID without error.';
    prevention = 'Always sync sequences after bulk data seeds or imports.';
  }

  // 3. POSTGRES CONNECTION TESTING & SCHEMA CREATION (GENERAL DATABASE ISSUES)
  else if (combined.includes('postgres') || combined.includes('postgresql') || cat === 'Database' || combined.includes('schema') || combined.includes('migration') || combined.includes('auto insert') || combined.includes('connection test')) {
    problemUnderstanding = `The issue relates to verifying PostgreSQL database connectivity, schema table initialization, and automated data insertion for "${title}".`;
    confirmedCause = null; // Do not hallucinate an exact cause when only testing/general description is provided
    likelyCause = 'PostgreSQL schema creation or automated insert verification typically encounters issues due to: (1) Missing or invalid connection parameters in .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT), (2) Cloud PostgreSQL requiring SSL mode (`ssl: { rejectUnauthorized: false }`), (3) Relational tables created out of dependency order (e.g. creating ISSUE before parent USER/PROJECT), or (4) Primary key sequences falling out of sync with initial seed data IDs.';
    recommendedSolution = 'Verify PostgreSQL environment variables and SSL pool options, execute DDL schema creation in strict dependency order with IF NOT EXISTS, synchronize sequence counters, and test with parameterized queries.';
    stepByStepFix = [
      '1. Verify database configuration in Backend/.env: ensure DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT (5432) or DATABASE_URL are set.',
      '2. In Backend/db.js, configure the pg.Pool with SSL rejection bypass for cloud databases: poolConfig.ssl = { rejectUnauthorized: false }.',
      '3. Verify table creation order in schema.sql: lookup and independent tables first ("USER", "PRIORITY", "STATUS"), then parent entities ("PROJECT"), followed by dependent tables ("PROJECT_MEMBER", "ISSUE", "COMMENT", "ISSUE_HISTORY").',
      '4. Synchronize PostgreSQL serial sequences to the maximum ID using: SELECT setval(pg_get_serial_sequence(\'"ISSUE"\', \'issue_id\'), COALESCE((SELECT MAX(issue_id) FROM "ISSUE"), 1));',
      '5. Run an automated test query using parameterized INSERT with RETURNING to verify roundtrip write performance.'
    ];
    exampleCodeFix = `// Complete PostgreSQL Verification & Insert Script:
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  ssl: { rejectUnauthorized: false }
});

async function verifyPostgresSetup() {
  const client = await pool.connect();
  try {
    // 1. Connection check
    const check = await client.query('SELECT current_database(), current_user, version()');
    console.log('Connected to:', check.rows[0]);

    // 2. Schema creation test
    await client.query(\`
      CREATE TABLE IF NOT EXISTS "SCHEMA_TEST" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    // 3. Automated insert test
    const insertRes = await client.query(
      'INSERT INTO "SCHEMA_TEST" (name) VALUES ($1) RETURNING *',
      ['Automated Test Run']
    );
    console.log('Inserted record:', insertRes.rows[0]);
  } finally {
    client.release();
  }
}
verifyPostgresSetup().catch(console.error);`;
    verification = 'Run node server.js and observe console output: confirm "[DB] PostgreSQL connection verified successfully" and "[DB] All PostgreSQL tables verified/created successfully". Query SELECT COUNT(*) FROM "PROJECT"; to confirm data availability.';
    prevention = 'Use automated migration scripts that execute idempotently (CREATE TABLE IF NOT EXISTS) and validate database connections before server starts accepting HTTP traffic.';
    informationStillNeeded = 'If you encountered a specific error message, exception stack trace, or terminal log output during the connection test, paste it here to confirm the exact root cause.';
  }

  // 4. BACKEND / CONTROLLER / API 500 ISSUES
  else if (cat === 'Backend' || combined.includes('api') || combined.includes('500') || combined.includes('crash')) {
    problemUnderstanding = `The backend application failed while handling request "${title}". The server returned an uncaught exception or HTTP 500 state.`;
    confirmedCause = null;
    likelyCause = 'Unhandled request parameter, missing environment variable, unhandled Promise rejection, or invalid payload validation before controller dispatch.';
    recommendedSolution = 'Wrap controller endpoint in try-catch blocks, validate incoming request body parameters, and return structured error messages.';
    stepByStepFix = [
      '1. Inspect backend server log stream for stack trace and line number.',
      '2. Add input validation check at the top of controller function.',
      '3. Wrap database or external network call in try/catch block.',
      '4. Restart node server process and re-test API endpoint.'
    ];
    exampleCodeFix = `// Suggested Express Controller Fix:
app.post('/api/endpoint', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID is required' });
    const data = await queryOne('SELECT * FROM "PROJECT" WHERE project_id = ?', [id]);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[API Error]', err);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
  }
});`;
    verification = 'Send POST request using curl or Postman and confirm clean HTTP 200/400 response without server crashing.';
    prevention = 'Implement centralized global error handling middleware in Express and validate request payloads with schemas.';
    informationStillNeeded = 'Paste the exact error stack trace from your backend server console to identify the exact failing line of code.';
  }

  // 5. FRONTEND / UI ISSUES
  else if (cat === 'Frontend' || combined.includes('ui') || combined.includes('css') || combined.includes('alignment') || combined.includes('render')) {
    problemUnderstanding = `Frontend UI rendering or layout glitch detected in "${title}".`;
    confirmedCause = null;
    likelyCause = 'CSS flexbox/grid container overflow, missing responsive breakpoint rules, or unhandled React component state re-rendering.';
    recommendedSolution = 'Use CSS flexbox/grid responsive rules with flex-wrap: wrap, appropriate min/max dimensions, and defensive state checks.';
    stepByStepFix = [
      '1. Inspect DOM element with Browser DevTools Inspector (F12).',
      '2. Verify wrapper flex-wrap, overflow, and box-sizing properties.',
      '3. Add responsive media query rule for viewports below 768px.'
    ];
    exampleCodeFix = `/* Responsive CSS Container Fix */
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
}`;
    verification = 'Resize browser viewport to mobile dimensions (375px) and verify layout does not horizontally overflow.';
    prevention = 'Adopt mobile-first CSS media queries and test responsive layouts across standard viewports.';
  }

  // 6. AUTHENTICATION / JWT ISSUES
  else if (cat === 'Authentication' || combined.includes('auth') || combined.includes('token') || combined.includes('login') || combined.includes('jwt')) {
    problemUnderstanding = `Authentication session or token authorization error for "${title}".`;
    confirmedCause = null;
    likelyCause = 'Expired session token, mismatch in signature secret, missing Authorization header, or incorrect credentials payload.';
    recommendedSolution = 'Implement clear token validation, check Authorization headers, and provide helpful login feedback messages.';
    stepByStepFix = [
      '1. Check client browser localStorage for valid user session token.',
      '2. Verify JWT secret matches between signing and verification middlewares.',
      '3. Ensure CORS headers permit Authorization header in preflight requests.'
    ];
    exampleCodeFix = `// Auth Header Interceptor Fix:
headers: {
  'Content-Type': 'application/json',
  'Authorization': \`Bearer \${localStorage.getItem('token') || ''}\`
}`;
    verification = 'Log out, log back in, and verify API call succeeds with authenticated session.';
    prevention = 'Set reasonable token expiration limits and handle session renewal gracefully.';
  }

  // 7. GENERAL SOFTWARE ISSUE
  else {
    problemUnderstanding = `Software issue "${title}" reported in category "${cat}".`;
    confirmedCause = null;
    likelyCause = 'System configuration mismatch, edge case input validation failure, or unhandled boundary condition in business logic.';
    recommendedSolution = 'Verify component input parameters, inspect execution logs, and trace variable lifecycle.';
    stepByStepFix = [
      '1. Inspect system execution logs around the time of failure.',
      '2. Verify dependencies and environment configuration values.',
      '3. Add defensive input validation check before processing.',
      '4. Re-run test case to verify expected behavior.'
    ];
    exampleCodeFix = `// Diagnostic Logger:
console.log('[Diagnostic Trace]', { title: "${title}", category: "${cat}", timestamp: new Date().toISOString() });`;
    verification = 'Run automated test suite and confirm issue does not reproduce.';
    prevention = 'Maintain unit test coverage and automated diagnostic logging for critical paths.';
    informationStillNeeded = 'Paste the exact error message, expected vs actual behavior, or reproduction steps to pinpoint the root cause.';
  }

  if (isReanalysis) {
    problemUnderstanding += ' (Updated based on additional user diagnostic notes)';
  }

  return {
    moreInfoRequired: false,
    problemUnderstanding,
    confirmedCause,
    likelyCause,
    possibleCause: confirmedCause || likelyCause || 'System configuration or logical edge case.',
    recommendedSolution,
    stepByStepFix,
    exampleCodeFix,
    verification,
    prevention,
    informationStillNeeded
  };
}

// MAIN AI SOLVE PROBLEM ENDPOINT
router.post('/solve-issue', async (req, res) => {
  const { issue_id, title, description, category, priority, status, comments, history } = req.body;

  let targetIssueId = issue_id;
  let issueRecord = null;

  if (targetIssueId) {
    issueRecord = await queryOne(`
      SELECT 
        i.*,
        COALESCE(p.project_name, 'TrackFlow Main') as project_name,
        COALESCE(pri.priority_name, 'Medium') as priority_name,
        COALESCE(st.status_name, 'Open') as status_name
      FROM "ISSUE" i
      LEFT JOIN "PROJECT" p ON i.project_id = p.project_id
      LEFT JOIN "PRIORITY" pri ON i.priority_id = pri.priority_id
      LEFT JOIN "STATUS" st ON i.status_id = st.status_id
      WHERE i.issue_id = ?
    `, [targetIssueId]);
  }

  const issueTitle = title || issueRecord?.title || '';
  const issueDesc = description || issueRecord?.description || '';
  const issueCat = category || issueRecord?.category || 'Backend';
  const issuePrio = priority || issueRecord?.priority_name || 'Medium';
  const issueStatus = status || issueRecord?.status_name || 'Open';

  let commentsList = comments;
  if ((!commentsList || commentsList.length === 0) && targetIssueId) {
    commentsList = await queryAll(`
      SELECT c.*, u.name as user_name 
      FROM "COMMENT" c 
      JOIN "USER" u ON c.user_id = u.user_id 
      WHERE c.issue_id = ? 
      ORDER BY c.comment_id ASC
    `, [targetIssueId]);
  }

  let historyList = history;
  if ((!historyList || historyList.length === 0) && targetIssueId) {
    historyList = await queryAll(`
      SELECT * FROM "ISSUE_HISTORY"
      WHERE issue_id = ?
      ORDER BY history_id ASC
    `, [targetIssueId]);
  }

  const commentsText = Array.isArray(commentsList) && commentsList.length > 0
    ? commentsList.map(c => `- ${c.user_name || c.userName || 'User'}: ${c.comment_text || c.commentText || c}`).join('\n')
    : 'No additional comments.';

  const historyText = Array.isArray(historyList) && historyList.length > 0
    ? historyList.map(h => `- [${h.event_type || 'Event'}]: ${h.description || ''}`).join('\n')
    : 'No prior history recorded.';

  const isReanalysis = (issueRecord?.ai_attempts || 0) > 0;

  const promptText = `
You are TrackFlow AI Problem Solver, an expert software engineering and relational database debugging assistant.
Analyze this issue and return structured JSON ONLY.

Issue Details:
- Title: "${issueTitle}"
- Description: "${issueDesc}"
- Category: "${issueCat}"
- Priority: "${issuePrio}"
- Current Status: "${issueStatus}"
- Discussion Comments / Diagnostic Logs:
${commentsText}
- Issue History Timeline:
${historyText}

ANALYSIS AND TROUBLESHOOTING RULES:
1. Examine all details: title, description, category, priority, current status, and any error logs or stack traces.
2. Clearly distinguish between:
   - "confirmedCause": If and ONLY if an exact error log, exception trace, or definitive failure symptom is explicitly present in the input that proves the root cause, explain the confirmed cause here. If the cause is not 100% confirmed by explicit error evidence, set "confirmedCause": null.
   - "likelyCause": When evidence is incomplete or no error log is given, identify the most probable root cause(s) based ONLY on the available information, the technology stack (Node.js, Express, PostgreSQL / SQLite), and context. Do NOT hallucinate an exact cause when evidence is insufficient.
   - "informationStillNeeded": Ask for additional error logs, config details, or steps ONLY if genuinely necessary to diagnose an ambiguous issue. If the issue is already clear or actionable, set "informationStillNeeded": null.
3. NEVER refuse to provide a solution or return an empty "more info needed" message. Even for brief or high-level issues like "Postgres Connection Test" / "Testing PostgreSQL schema creation and auto insert", ALWAYS provide:
   - technical problem understanding and why errors occur in such tests
   - likely causes based on the tech stack
   - practical step-by-step solution
   - corrected code or SQL
   - verification steps
   - prevention recommendation
4. FOR DATABASE / POSTGRESQL ISSUES: Demonstrate deep domain knowledge of common relational database errors:
   - relation/table does not exist
   - authentication failed
   - connection refused / ECONNREFUSED
   - timeout / query timeout
   - database does not exist
   - permission denied
   - duplicate key / unique constraint violation
   - foreign key violation
   - syntax errors
   - missing columns
   - schema initialization errors
5. SPECIFIC TRACKFLOW DEPLOYMENT RULE:
   If the issue text, logs, or history contain:
   "[DB] Connected to SQLite database" (or SQLite database fallback)
   AND
   "Error: no such table: ISSUE_HISTORY" (or "no such table: ISSUE_HISTORY"):
   - Set "confirmedCause" to explain that the backend is still using SQLite instead of the configured PostgreSQL database, and that the ISSUE_HISTORY table is missing from the SQLite database.
   - Explain why this occurs (PostgreSQL connection failed or credentials missing, leading to silent SQLite fallback where schema initialization missed creating ISSUE_HISTORY prior to inserts).
   - Recommend migrating the backend database layer to PostgreSQL by providing valid credentials (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, or DATABASE_URL) and ensuring the schema creates ISSUE_HISTORY before seed data is inserted.
   - Provide the exact corrected SQL and environment configuration.
6. Do NOT hardcode a fake solution. Do NOT claim the issue is solved unless the user confirms it.
7. Return raw JSON matching this structure:
{
  "problemUnderstanding": "Clear technical explanation of what is happening or what the user is attempting.",
  "confirmedCause": "Confirmed root cause if explicit error evidence is present; otherwise null.",
  "likelyCause": "Likely causes based on available context when exact evidence is incomplete.",
  "possibleCause": "Summary of root cause (matches confirmedCause or likelyCause for backward compatibility).",
  "recommendedSolution": "Practical, actionable recommendation to fix the issue.",
  "stepByStepFix": [
    "1. Step one",
    "2. Step two",
    "3. Step three"
  ],
  "exampleCodeFix": "// Corrected code, configuration, or SQL statements",
  "verification": "Clear steps to test and verify whether the solution worked.",
  "prevention": "Short recommendation for avoiding the same problem.",
  "informationStillNeeded": "Additional logs/info needed ONLY if genuinely required; otherwise null."
}
`;

  let solutionObj = null;

  try {
    const rawText = await callGeminiAPI(promptText, true);
    let jsonStr = rawText.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
    }
    solutionObj = JSON.parse(jsonStr);
  } catch (err) {
    console.warn('[AI Solve Issue] Using contextual fallback AI solver:', err.message);
    solutionObj = generateContextualSolution({
      title: issueTitle,
      description: issueDesc,
      category: issueCat,
      priority: issuePrio,
      status: issueStatus,
      commentsText,
      historyText,
      isReanalysis
    });
  }

  // Ensure compatibility fields for both index.html and preview.html
  if (solutionObj) {
    solutionObj.category = solutionObj.category || issueCat;
    solutionObj.suggestedPriority = solutionObj.suggestedPriority || issuePrio;
    solutionObj.rootCauseAnalysis = solutionObj.confirmedCause || solutionObj.likelyCause || solutionObj.possibleCause;
    solutionObj.troubleshootingSteps = solutionObj.stepByStepFix;
    solutionObj.possibleCause = solutionObj.confirmedCause || solutionObj.likelyCause || solutionObj.possibleCause;
    solutionObj.moreInfoRequired = false; // Never block UI with blank warning
  }

  // Update Database if issue_id is present
  if (targetIssueId && issueRecord) {
    const newAttempts = (issueRecord.ai_attempts || 0) + 1;
    const solutionJson = JSON.stringify(solutionObj);

    await execute(`
      UPDATE "ISSUE"
      SET ai_solution_json = ?, ai_status = 'Generated', ai_attempts = ?
      WHERE issue_id = ?
    `, [solutionJson, newAttempts, targetIssueId]);

    const eventTitle = isReanalysis ? 'AI Re-analysis' : 'AI Analysis Generated';
    await execute(`
      INSERT INTO "ISSUE_HISTORY" (issue_id, event_type, description)
      VALUES (?, ?, ?)
    `, [targetIssueId, eventTitle, `AI Problem Solver generated solution attempt #${newAttempts}`]);

    await execute(`
      INSERT INTO "ISSUE_HISTORY" (issue_id, event_type, description)
      VALUES (?, 'Solution Suggested', ?)
    `, [targetIssueId, `AI suggested fix for ${issueCat} issue`]);
  }

  return res.json({
    success: true,
    aiSolution: solutionObj,
    analysis: solutionObj, // For preview.html compatibility
    attempts: (issueRecord?.ai_attempts || 0) + 1
  });
});

router.post('/analyze-issue', async (req, res) => {
  req.url = '/solve-issue';
  return router.handle(req, res);
});

router.post('/summarize-issue', async (req, res) => {
  const { title, description, comments } = req.body;
  const issueTitle = title || 'Software Issue';
  const issueDesc = description || '';

  const commentsText = Array.isArray(comments) && comments.length > 0
    ? comments.map(c => `- ${c.userName || c.user_name || 'User'}: ${c.commentText || c.comment_text || c}`).join('\n')
    : '';

  const prompt = `You are a software engineering technical lead. Provide a concise, clear 2-3 sentence executive summary of this issue, its severity, and its impact:
- Title: "${issueTitle}"
- Description: "${issueDesc}"
${commentsText ? `- Discussion:\n${commentsText}` : ''}

Keep the summary clear, professional, and actionable. Return ONLY the plain text summary without quotes or markdown formatting.`;

  try {
    const summaryText = await callGeminiAPI(prompt, false);
    const cleaned = summaryText.replace(/```/g, '').trim();
    if (cleaned) {
      return res.json({ success: true, summary: cleaned });
    }
  } catch (err) {
    console.warn('[AI Summarize Issue] Falling back to local summary:', err.message);
  }

  const fallback = `Issue "${issueTitle}": ${issueDesc ? issueDesc.slice(0, 160) + (issueDesc.length > 160 ? '...' : '') : 'Currently active in project tracking queue.'} Recommended action: Review reproduction steps and assign to a module owner.`;
  return res.json({ success: true, summary: fallback });
});

router.post('/summarize-project', async (req, res) => {
  const { projectName, description, status, totalIssues, openIssues, resolvedIssues, highPriorityIssues, issues } = req.body;
  const pName = projectName || 'TrackFlow Project';
  const pDesc = description || '';
  const tot = totalIssues !== undefined ? totalIssues : (Array.isArray(issues) ? issues.length : 0);
  const opn = openIssues !== undefined ? openIssues : 0;
  const resld = resolvedIssues !== undefined ? resolvedIssues : 0;
  const hiPri = highPriorityIssues !== undefined ? highPriorityIssues : 0;

  const prompt = `You are an agile engineering manager. Provide a concise, insightful 3-4 sentence project health summary:
- Project Name: "${pName}"
- Description: "${pDesc}"
- Status: "${status || 'Active'}"
- Metrics: ${tot} total issues, ${opn} open, ${resld} resolved, ${hiPri} high/critical priority.

Highlight overall project velocity, high priority blockers, and a practical next step for the team. Return ONLY the plain text summary without quotes or markdown formatting.`;

  try {
    const summaryText = await callGeminiAPI(prompt, false);
    const cleaned = summaryText.replace(/```/g, '').trim();
    if (cleaned) {
      return res.json({ success: true, summary: cleaned });
    }
  } catch (err) {
    console.warn('[AI Summarize Project] Falling back to local summary:', err.message);
  }

  const completionRate = tot > 0 ? Math.round((resld / tot) * 100) : 100;
  const fallback = `Project "${pName}" is currently in ${status || 'Active'} status with a resolution rate of ${completionRate}% (${resld} of ${tot} issues resolved). There are currently ${opn} active issues, including ${hiPri} flagged as high priority. The team should focus on unblocking high-priority items to maintain project velocity.`;
  return res.json({ success: true, summary: fallback });
});

module.exports = router;
