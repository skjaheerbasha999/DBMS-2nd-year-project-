# TrackFlow Backend API Server

A Node.js & Express REST API powered by SQLite database engine implementing the 8-table relational DBMS capstone project schema.

---

## 🗄️ Relational Database Schema (8 Entities)

The database engine (`db.js`) automatically initializes and seeds `database.sqlite` based on `schema.sql` and `seed.sql`:

1. **`USER`**: Stores system users with single-table Role-Based Access Control (`role = 'ADMIN' | 'USER'`).
2. **`PROJECT`**: Project records created by users with status tracking.
3. **`PROJECT_MEMBER`**: Composite key junction table (`project_id`, `user_id`) mapping team members to projects with assigned member roles.
4. **`PRIORITY`**: Priority reference lookup table (`Low`, `Medium`, `High`, `Critical`).
5. **`STATUS`**: Status reference lookup table (`Open`, `In Progress`, `Resolved`, `Closed`).
6. **`ISSUE`**: Central ticket table with relational FK mappings to `PROJECT`, `USER` (reported_by & assigned_to), `PRIORITY`, and `STATUS`.
7. **`COMMENT`**: Relational discussion thread for issue tickets.
8. **`REPORT`**: Audit report generation logs linked to projects and generating admins.

---

## 🚀 How to Run the Backend Server

### 1. Install Dependencies
```powershell
cd Backend
npm install
```

### 2. Start API Server
```powershell
npm start
```
The server will start on **`http://localhost:5000`**.

---

## 🔌 API Endpoints Reference

### 🔐 Authentication (`/api/auth`)
- `POST /api/auth/login` — Authenticate user and obtain token.
- `POST /api/auth/register` — Register a new user account.
- `GET /api/auth/me` — Fetch currently authenticated user profile.

### 👥 User Management (`/api/users`)
- `GET /api/users` — Get list of all registered users.
- `GET /api/users/:id` — Get single user profile with enrolled projects.
- `POST /api/users` — Create user profile (Admin).
- `PUT /api/users/:id` — Update user details.
- `DELETE /api/users/:id` — Remove user profile.

### 📁 Project Management (`/api/projects`)
- `GET /api/projects` — Get all projects with issue count metrics.
- `GET /api/projects/:id` — Get detailed project view with members and issues.
- `POST /api/projects` — Create a new project repository.
- `PUT /api/projects/:id` — Update project details.
- `DELETE /api/projects/:id` — Delete project.
- `POST /api/projects/:id/members` — Add member to project team.
- `DELETE /api/projects/:id/members/:userId` — Remove team member from project.

### 🐛 Issue & Ticket Tracker (`/api/issues`)
- `GET /api/issues` — Query & filter issues (supports `?project_id=`, `?status_id=`, `?priority_id=`, `?search=`).
- `GET /api/issues/:id` — Get detailed issue ticket with comments thread.
- `POST /api/issues` — Report new bug/feature ticket.
- `PUT /api/issues/:id` — Update status, priority, or assigned developer.
- `DELETE /api/issues/:id` — Remove ticket.
- `GET /api/issues/:id/comments` — Fetch ticket discussion comments.
- `POST /api/issues/:id/comments` — Add comment to ticket.

### 📊 Relational Audit Reports & Stats
- `GET /api/stats/summary` — Returns dashboard KPIs, issue resolution index %, and breakdown metrics.
- `GET /api/reports` — Fetch report audit history.
- `POST /api/reports` — Generate new DBMS audit document.
