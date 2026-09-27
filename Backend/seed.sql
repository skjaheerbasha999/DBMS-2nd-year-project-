-- Seed initial Priority records
INSERT OR IGNORE INTO PRIORITY (priority_id, priority_name, priority_level) VALUES
(1, 'Low', 1),
(2, 'Medium', 2),
(3, 'High', 3),
(4, 'Critical', 4);

-- Seed initial Status records
INSERT OR IGNORE INTO STATUS (status_id, status_name, status_type) VALUES
(1, 'Open', 'Issue'),
(2, 'In Progress', 'Issue'),
(3, 'Resolved', 'Issue'),
(4, 'Closed', 'Issue');

-- Seed Users (Password 'admin123' and 'user123' hashed / plaintext compatible for demo)
INSERT OR IGNORE INTO USER (user_id, name, email, password, phone, role) VALUES
(1, 'System Administrator', 'admin@trackflow.com', 'admin123', '+1 555-0192', 'ADMIN'),
(2, 'Priya Sharma', 'priya@trackflow.com', 'user123', '+91 98765-43210', 'USER'),
(3, 'Rahul Verma', 'rahul@trackflow.com', 'user123', '+91 98765-12345', 'USER'),
(4, 'Anita Rao', 'anita@trackflow.com', 'user123', '+91 98765-67890', 'USER');

-- Seed Projects
INSERT OR IGNORE INTO PROJECT (project_id, project_name, description, start_date, deadline, status_id, created_by) VALUES
(1, 'DBMS Core Engine v2.0', 'High-performance SQL query optimizer and relational engine module.', '2026-01-10', '2026-11-30', 2, 1),
(2, 'Cloud Storage Sync Gateway', 'Real-time distributed file synchronization system with blob storage.', '2026-02-01', '2026-12-15', 2, 1),
(3, 'Payment Gateway API', 'Stripe & PayPal payment abstraction layer with webhook integration.', '2026-03-15', '2026-09-30', 1, 1),
(4, 'Mobile Client App', 'Cross-platform React Native iOS and Android application.', '2026-04-01', '2026-10-20', 1, 1);

-- Seed Project Members
INSERT OR IGNORE INTO PROJECT_MEMBER (project_id, user_id, member_role, joined_date) VALUES
(1, 1, 'Lead Architect', '2026-01-10'),
(1, 2, 'Senior Backend Engineer', '2026-01-12'),
(1, 3, 'Database Engineer', '2026-01-15'),
(2, 2, 'Lead Developer', '2026-02-01'),
(2, 4, 'Frontend Engineer', '2026-02-05'),
(3, 3, 'Backend Specialist', '2026-03-15');

-- Seed Issues
INSERT OR IGNORE INTO ISSUE (issue_id, project_id, title, description, reported_by, assigned_to, priority_id, status_id, due_date) VALUES
(101, 1, 'Memory leak in B-Tree index node allocation', 'High RAM usage observed under concurrent SELECT query workloads exceeding 500 QPS.', 2, 3, 4, 2, '2026-10-05'),
(102, 1, 'FK constraint cascade delete failure on orphan child records', 'Deleting parent user record throws uncaught FOREIGN KEY violation in SQLite driver.', 3, 2, 3, 1, '2026-10-12'),
(103, 2, 'OAuth2 Refresh Token expiration race condition', 'Users are abruptly logged out during background file upload tasks exceeding 10 minutes.', 4, 2, 2, 3, '2026-09-28'),
(104, 3, 'Stripe webhook signature validation failing on staging', 'HMAC SHA-256 calculation mismatch between header payload and computed hash.', 1, 3, 3, 1, '2026-10-01');

-- Seed Comments
INSERT OR IGNORE INTO COMMENT (comment_id, issue_id, user_id, comment_text) VALUES
(1, 101, 3, 'I reproduced the memory leak using Valgrind. Free statement missing on node split buffer.'),
(2, 101, 2, 'Thanks Rahul! Working on releasing a patch in main branch today.'),
(3, 103, 4, 'Updated token refresh window from 5m to 15m. Issue verified and resolved.');

-- Seed Reports
INSERT OR IGNORE INTO REPORT (report_id, project_id, generated_by, report_type) VALUES
('RPT-2026-001', 1, 1, 'Project Progress Audit'),
('RPT-2026-002', 2, 1, 'Issue Resolution Metrics');
