# Software Project & Issue Tracking System (TrackFlow)

A modern, high-performance, dark-themed SaaS web application designed for DBMS college capstone & mini projects.

---

## 🌟 Features Overview

- **Landing & Authentication Portal:**
  - 🌌 Interactive **Three.js** 3D Particle & Node Network Background with mouse parallax.
  - 🛡️ **Dual-Role Authentication:** ADMIN LOGIN & USER LOGIN tabs with dynamic highlight animations.
  - ⚡ Real-time form validation (Email pattern, minimum password length, inline alerts).
  - 👁️ Password visibility toggle.
  - 🚀 One-click demo test account filler chips.
  - 🔔 Animated Toast Notification feedback system.

- **Single-Table RBAC (Role-Based Access Control):**
  - Uses a single relational `USER` entity with `role = 'ADMIN' | 'USER'`.
  - Secure mock service abstraction (`src/services/authService.js`) ready to swap for `POST /api/auth/login`.

- **Admin Control Center (`/admin/dashboard`):**
  - KPI Statistics with animated counting numbers (`Total Users`, `Active Projects`, `Open Issues`, `Resolved Issues`).
  - Project milestone progress meters.
  - Issue distribution metrics by Status & Severity spectrum.
  - Live audit activity stream & system ticket table.

- **Developer / User Workspace (`/user/dashboard`):**
  - Developer-specific queues (`My Projects`, `Assigned Issues`, `Pending Action`, `Resolved by Me`).
  - Upcoming deadline urgency alerts.
  - Recent issue discussion comments feed.

- **Projects Management (`/admin/projects`, `/user/projects`):**
  - Grid view of all repositories with milestone completion percentages.
  - Project detail modal displaying team members and status metrics.
  - "New Project" modal form.

- **Issue & Bug Tracker (`/admin/issues`, `/user/issues`):**
  - Real-time search by Title, Description, and Assignee.
  - Multi-criteria filtering by Project, Priority (`Low`, `Medium`, `High`, `Critical`), and Status (`Open`, `In Progress`, `Resolved`, `Closed`).

- **Report Issue Form (`/user/report-issue`):**
  - Structured ticket logging form with relational foreign key mapping (`project_id`, `priority_id`, `assigned_to`, `due_date`).

- **DBMS Relational Reports (`/admin/reports`):**
  - Executive summary and audit export simulator (CSV & PDF).
  - Entity-aligned report document archives.

- **User & Project Member Entities (`/admin/users`, `/admin/members`):**
  - Live view and role management matching the `USER` and `PROJECT_MEMBER` schemas.

---

## 🗄️ Database Relational Schema Alignment

The frontend architecture directly mirrors the following MySQL relational schema:

```sql
-- 1. USER TABLE (Unified Authentication & RBAC)
CREATE TABLE USER (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROJECT TABLE
CREATE TABLE PROJECT (
  project_id INT AUTO_INCREMENT PRIMARY KEY,
  project_name VARCHAR(150) NOT NULL,
  description TEXT,
  start_date DATE,
  deadline DATE,
  status_id INT,
  created_by INT,
  FOREIGN KEY (created_by) REFERENCES USER(user_id)
);

-- 3. PROJECT_MEMBER TABLE
CREATE TABLE PROJECT_MEMBER (
  project_id INT,
  user_id INT,
  member_role VARCHAR(50),
  joined_date DATE,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id),
  FOREIGN KEY (user_id) REFERENCES USER(user_id)
);

-- 4. PRIORITY TABLE
CREATE TABLE PRIORITY (
  priority_id INT PRIMARY KEY,
  priority_name VARCHAR(20),
  priority_level INT
);

-- 5. STATUS TABLE
CREATE TABLE STATUS (
  status_id INT PRIMARY KEY,
  status_name VARCHAR(20),
  status_type VARCHAR(20)
);

-- 6. ISSUE TABLE
CREATE TABLE ISSUE (
  issue_id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  reported_by INT,
  assigned_to INT,
  priority_id INT,
  status_id INT,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date DATE,
  resolved_date TIMESTAMP NULL,
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id),
  FOREIGN KEY (reported_by) REFERENCES USER(user_id),
  FOREIGN KEY (assigned_to) REFERENCES USER(user_id),
  FOREIGN KEY (priority_id) REFERENCES PRIORITY(priority_id),
  FOREIGN KEY (status_id) REFERENCES STATUS(status_id)
);

-- 7. COMMENT TABLE
CREATE TABLE COMMENT (
  comment_id INT AUTO_INCREMENT PRIMARY KEY,
  issue_id INT,
  user_id INT,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES ISSUE(issue_id),
  FOREIGN KEY (user_id) REFERENCES USER(user_id)
);

-- 8. REPORT TABLE
CREATE TABLE REPORT (
  report_id VARCHAR(50) PRIMARY KEY,
  project_id INT,
  generated_by INT,
  report_type VARCHAR(50),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES PROJECT(project_id),
  FOREIGN KEY (generated_by) REFERENCES USER(user_id)
);
```

---

## 🚀 How to Run the Application

### 1. Prerequisites
Ensure you have **Node.js** (v18 or higher) installed on your computer.
If Node.js is not yet installed or PATH is not active, download the Windows installer from [https://nodejs.org/](https://nodejs.org/).

### 2. Install Dependencies
Open PowerShell or Command Prompt, navigate to the project directory, and install:

```powershell
cd C:\Users\kampa\Projects\issue-tracker
npm install
```

### 3. Start Development Server
```powershell
npm run dev
```
Open your browser and visit: `http://localhost:3000`

---

## 🔑 Demo Login Credentials

You can click the demo account chips directly on the login card to auto-fill these credentials:

| Role | Email | Password | Access Privileges |
|---|---|---|---|
| **Administrator** | `admin@trackflow.com` | `admin123` | Full access to users, projects, issues, members & audit reports |
| **Team Member / User** | `priya@trackflow.com` | `user123` | Access to assigned tickets, enrolled projects, and issue reporting |

---

## 🔌 Connecting to a Real Backend Later

All data queries and mutations are isolated inside `src/services/`:
- `src/services/authService.js` ➔ replace mock return with `fetch('/api/auth/login', ...)`
- `src/services/projectService.js` ➔ replace with `fetch('/api/projects', ...)`
- `src/services/issueService.js` ➔ replace with `fetch('/api/issues', ...)`
