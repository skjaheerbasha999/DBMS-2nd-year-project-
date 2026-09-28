-- Seed initial Priority records
INSERT INTO "PRIORITY" (priority_id, priority_name, priority_level) VALUES
(1, 'Low', 1),
(2, 'Medium', 2),
(3, 'High', 3),
(4, 'Critical', 4)
ON CONFLICT DO NOTHING;

-- Seed initial Status records
INSERT INTO "STATUS" (status_id, status_name, status_type) VALUES
(1, 'Open', 'Issue'),
(2, 'In Progress', 'Issue'),
(3, 'Resolved', 'Issue'),
(4, 'Closed', 'Issue')
ON CONFLICT DO NOTHING;

-- Seed Users
INSERT INTO "USER" (user_id, name, email, password, phone, role) VALUES
(1, 'System Administrator', 'admin@trackflow.com', 'admin123', '+1 555-0192', 'ADMIN'),
(2, 'Priya Sharma', 'priya@trackflow.com', 'user123', '+91 98765-43210', 'USER'),
(3, 'Rahul Verma', 'rahul@trackflow.com', 'user123', '+91 98765-12345', 'USER'),
(4, 'Arjun Patel', 'arjun@trackflow.com', 'user123', '+91 98765-67890', 'USER')
ON CONFLICT DO NOTHING;

-- Seed Projects
INSERT INTO "PROJECT" (project_id, project_name, description, start_date, deadline, status_id, created_by) VALUES
(1, 'TrackFlow DBMS Core Engine', 'High-performance SQL query optimizer and relational engine module.', '2026-01-10', '2026-11-30', 2, 1),
(2, 'Cloud Storage Sync Gateway', 'Real-time distributed file synchronization system with blob storage.', '2026-02-01', '2026-12-15', 2, 1)
ON CONFLICT DO NOTHING;

-- Seed Issues
INSERT INTO "ISSUE" (issue_id, project_id, title, description, category, reported_by, assigned_to, priority_id, status_id, ai_status, ai_attempts, created_date, resolved_date) VALUES
(101, 1, 'Login API error', 'Authentication endpoint returns HTTP 500 error when receiving valid credentials from frontend.', 'Backend', 3, 1, 3, 1, 'Available', 1, '2026-09-20 10:00:00', NULL),
(102, 1, 'Database timeout under load', 'Foreign key query execution times out during peak read operations exceeding 500 QPS.', 'Database', 3, 2, 3, 2, 'Generated', 2, '2026-09-22 11:30:00', NULL),
(103, 2, 'UI alignment issue on mobile', 'Dashboard cards wrap incorrectly on mobile screens below 768px width.', 'Frontend', 2, 4, 1, 3, 'Solved', 1, '2026-09-25 14:15:00', '2026-09-26 09:00:00'),
(104, 2, 'OAuth2 token expiration error', 'Background file upload task abruptly fails due to expired access token.', 'Authentication', 4, 2, 2, 1, 'Not Requested', 0, '2026-09-27 16:45:00', NULL)
ON CONFLICT DO NOTHING;

-- Seed Issue History
INSERT INTO "ISSUE_HISTORY" (history_id, issue_id, event_type, description, created_at) VALUES
(1, 101, 'Issue Created', 'Issue reported by Rahul Verma', '2026-09-20 10:00:00'),
(2, 101, 'AI Analysis Generated', 'AI Problem Solver generated initial analysis', '2026-09-20 10:05:00'),
(3, 102, 'Issue Created', 'Issue reported by Rahul Verma', '2026-09-22 11:30:00'),
(4, 102, 'AI Analysis Generated', 'AI Problem Solver generated initial diagnostic', '2026-09-22 11:32:00'),
(5, 102, 'User Reported "Still Not Solved"', 'Rahul requested second AI pass with updated logs', '2026-09-23 15:10:00'),
(6, 102, 'AI Re-analysis', 'AI Problem Solver provided updated step-by-step fix', '2026-09-23 15:12:00'),
(7, 103, 'Issue Created', 'Issue reported by Priya Sharma', '2026-09-25 14:15:00'),
(8, 103, 'AI Analysis Generated', 'AI suggested flexbox CSS fix', '2026-09-25 14:20:00'),
(9, 103, 'Problem Solved', 'Priya Sharma verified and marked issue as solved', '2026-09-26 09:00:00'),
(10, 103, 'Issue Resolved', 'Status set to Resolved', '2026-09-26 09:00:00')
ON CONFLICT DO NOTHING;

-- Seed Comments
INSERT INTO "COMMENT" (comment_id, issue_id, user_id, comment_text, created_at) VALUES
(1, 101, 3, 'Observed in staging environment when testing POST /api/auth/login.', '2026-09-20 10:10:00'),
(2, 102, 3, 'Applied index modification but deadlock still occurs under 500 QPS.', '2026-09-23 15:05:00')
ON CONFLICT DO NOTHING;
