-- ============================================================
-- TrackFlow DBMS Relational Database Schema (8 Tables)
-- ============================================================

-- 1. USER TABLE (Unified Authentication & RBAC)
CREATE TABLE IF NOT EXISTS USER (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'USER', -- 'ADMIN' or 'USER'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROJECT TABLE
CREATE TABLE IF NOT EXISTS PROJECT (
  project_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  deadline TEXT,
  status_id INTEGER DEFAULT 1,
  created_by INTEGER,
  FOREIGN KEY (created_by) REFERENCES USER(user_id) ON DELETE SET NULL
);

-- 3. PROJECT_MEMBER TABLE
CREATE TABLE IF NOT EXISTS PROJECT_MEMBER (
  project_id INTEGER,
  user_id INTEGER,
  member_role TEXT DEFAULT 'Developer',
  joined_date TEXT,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);

-- 4. PRIORITY TABLE
CREATE TABLE IF NOT EXISTS PRIORITY (
  priority_id INTEGER PRIMARY KEY,
  priority_name TEXT NOT NULL,
  priority_level INTEGER NOT NULL
);

-- 5. STATUS TABLE
CREATE TABLE IF NOT EXISTS STATUS (
  status_id INTEGER PRIMARY KEY,
  status_name TEXT NOT NULL,
  status_type TEXT NOT NULL
);

-- 6. ISSUE TABLE
CREATE TABLE IF NOT EXISTS ISSUE (
  issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reported_by INTEGER NOT NULL,
  assigned_to INTEGER,
  priority_id INTEGER NOT NULL,
  status_id INTEGER NOT NULL DEFAULT 1,
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  due_date TEXT,
  resolved_date DATETIME,
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id) ON DELETE CASCADE,
  FOREIGN KEY (reported_by) REFERENCES USER(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_to) REFERENCES USER(user_id) ON DELETE SET NULL,
  FOREIGN KEY (priority_id) REFERENCES PRIORITY(priority_id),
  FOREIGN KEY (status_id) REFERENCES STATUS(status_id)
);

-- 7. COMMENT TABLE
CREATE TABLE IF NOT EXISTS COMMENT (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  comment_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES ISSUE(issue_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);

-- 8. REPORT TABLE
CREATE TABLE IF NOT EXISTS REPORT (
  report_id TEXT PRIMARY KEY,
  project_id INTEGER,
  generated_by INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id) ON DELETE SET NULL,
  FOREIGN KEY (generated_by) REFERENCES USER(user_id) ON DELETE CASCADE
);
