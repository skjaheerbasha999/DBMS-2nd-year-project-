-- ============================================================
-- TrackFlow DBMS Relational Database Schema (Universal PostgreSQL & SQLite)
-- ============================================================

-- 1. USER TABLE
CREATE TABLE IF NOT EXISTS "USER" (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(50) NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROJECT TABLE
CREATE TABLE IF NOT EXISTS "PROJECT" (
  project_id SERIAL PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date VARCHAR(50),
  deadline VARCHAR(50),
  status_id INT DEFAULT 1,
  created_by INT REFERENCES "USER"(user_id) ON DELETE SET NULL
);

-- 3. PROJECT_MEMBER TABLE
CREATE TABLE IF NOT EXISTS "PROJECT_MEMBER" (
  project_id INT REFERENCES "PROJECT"(project_id) ON DELETE CASCADE,
  user_id INT REFERENCES "USER"(user_id) ON DELETE CASCADE,
  member_role VARCHAR(100) DEFAULT 'Developer',
  joined_date VARCHAR(50),
  PRIMARY KEY (project_id, user_id)
);

-- 4. PRIORITY TABLE
CREATE TABLE IF NOT EXISTS "PRIORITY" (
  priority_id INT PRIMARY KEY,
  priority_name VARCHAR(50) NOT NULL,
  priority_level INT NOT NULL
);

-- 5. STATUS TABLE
CREATE TABLE IF NOT EXISTS "STATUS" (
  status_id INT PRIMARY KEY,
  status_name VARCHAR(50) NOT NULL,
  status_type VARCHAR(50) NOT NULL
);

-- 6. ISSUE TABLE
CREATE TABLE IF NOT EXISTS "ISSUE" (
  issue_id SERIAL PRIMARY KEY,
  project_id INT NOT NULL DEFAULT 1 REFERENCES "PROJECT"(project_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'Backend',
  reported_by INT NOT NULL REFERENCES "USER"(user_id) ON DELETE RESTRICT,
  assigned_to INT REFERENCES "USER"(user_id) ON DELETE SET NULL,
  priority_id INT NOT NULL DEFAULT 2 REFERENCES "PRIORITY"(priority_id),
  status_id INT NOT NULL DEFAULT 1 REFERENCES "STATUS"(status_id),
  ai_solution_json TEXT,
  ai_status VARCHAR(50) DEFAULT 'Not Requested',
  ai_attempts INT DEFAULT 0,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date VARCHAR(50),
  resolved_date TIMESTAMP
);

-- 7. COMMENT TABLE
CREATE TABLE IF NOT EXISTS "COMMENT" (
  comment_id SERIAL PRIMARY KEY,
  issue_id INT NOT NULL REFERENCES "ISSUE"(issue_id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES "USER"(user_id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. ISSUE_HISTORY TABLE
CREATE TABLE IF NOT EXISTS "ISSUE_HISTORY" (
  history_id SERIAL PRIMARY KEY,
  issue_id INT NOT NULL REFERENCES "ISSUE"(issue_id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. REPORT TABLE
CREATE TABLE IF NOT EXISTS "REPORT" (
  report_id VARCHAR(100) PRIMARY KEY,
  project_id INT REFERENCES "PROJECT"(project_id) ON DELETE SET NULL,
  generated_by INT NOT NULL REFERENCES "USER"(user_id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
