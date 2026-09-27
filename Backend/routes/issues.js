const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /api/issues - Search and filter issues
router.get('/', (req, res) => {
  const { project_id, status_id, priority_id, assigned_to, search } = req.query;

  let sql = `
    SELECT 
      i.*,
      p.project_name,
      pri.priority_name,
      pri.priority_level,
      st.status_name,
      u_rep.name as reporter_name,
      u_rep.email as reporter_email,
      u_ass.name as assignee_name,
      u_ass.email as assignee_email
    FROM ISSUE i
    JOIN PROJECT p ON i.project_id = p.project_id
    JOIN PRIORITY pri ON i.priority_id = pri.priority_id
    JOIN STATUS st ON i.status_id = st.status_id
    JOIN USER u_rep ON i.reported_by = u_rep.user_id
    LEFT JOIN USER u_ass ON i.assigned_to = u_ass.user_id
    WHERE 1=1
  `;
  const params = [];

  if (project_id) {
    sql += ' AND i.project_id = ?';
    params.push(project_id);
  }
  if (status_id) {
    sql += ' AND i.status_id = ?';
    params.push(status_id);
  }
  if (priority_id) {
    sql += ' AND i.priority_id = ?';
    params.push(priority_id);
  }
  if (assigned_to) {
    sql += ' AND i.assigned_to = ?';
    params.push(assigned_to);
  }
  if (search) {
    sql += ' AND (i.title LIKE ? OR i.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY i.issue_id DESC';

  const issues = queryAll(sql, params);
  res.json({ success: true, count: issues.length, data: issues });
});

// GET /api/issues/:id - Get issue detail with discussion comments
router.get('/:id', (req, res) => {
  const issue = queryOne(`
    SELECT 
      i.*,
      p.project_name,
      pri.priority_name,
      st.status_name,
      u_rep.name as reporter_name,
      u_ass.name as assignee_name
    FROM ISSUE i
    JOIN PROJECT p ON i.project_id = p.project_id
    JOIN PRIORITY pri ON i.priority_id = pri.priority_id
    JOIN STATUS st ON i.status_id = st.status_id
    JOIN USER u_rep ON i.reported_by = u_rep.user_id
    LEFT JOIN USER u_ass ON i.assigned_to = u_ass.user_id
    WHERE i.issue_id = ?
  `, [req.params.id]);

  if (!issue) {
    return res.status(404).json({ success: false, message: 'Issue not found' });
  }

  const comments = queryAll(`
    SELECT c.*, u.name as user_name, u.role as user_role
    FROM COMMENT c
    JOIN USER u ON c.user_id = u.user_id
    WHERE c.issue_id = ?
    ORDER BY c.comment_id ASC
  `, [req.params.id]);

  res.json({ success: true, data: { ...issue, comments } });
});

// POST /api/issues - Report new issue
router.post('/', (req, res) => {
  const { project_id, title, description, reported_by, assigned_to, priority_id, status_id, due_date } = req.body;

  if (!project_id || !title || !reported_by || !priority_id) {
    return res.status(400).json({ success: false, message: 'project_id, title, reported_by, and priority_id are required' });
  }

  const result = execute(`
    INSERT INTO ISSUE (project_id, title, description, reported_by, assigned_to, priority_id, status_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    project_id,
    title.trim(),
    description || '',
    reported_by,
    assigned_to || null,
    priority_id,
    status_id || 1, // Default Open
    due_date || null
  ]);

  const newIssue = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [result.lastInsertRowid]);
  res.status(201).json({ success: true, data: newIssue });
});

// PUT /api/issues/:id - Update issue status / priority / assignment
router.put('/:id', (req, res) => {
  const { title, description, assigned_to, priority_id, status_id, due_date } = req.body;
  const existing = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Issue not found' });
  }

  let resolved_date = existing.resolved_date;
  if (status_id && parseInt(status_id) === 3 && existing.status_id !== 3) {
    resolved_date = new Date().toISOString();
  }

  execute(`
    UPDATE ISSUE 
    SET 
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      assigned_to = COALESCE(?, assigned_to),
      priority_id = COALESCE(?, priority_id),
      status_id = COALESCE(?, status_id),
      due_date = COALESCE(?, due_date),
      resolved_date = ?
    WHERE issue_id = ?
  `, [
    title, description, assigned_to, priority_id, status_id, due_date, resolved_date, req.params.id
  ]);

  const updated = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [req.params.id]);
  res.json({ success: true, data: updated });
});

// DELETE /api/issues/:id
router.delete('/:id', (req, res) => {
  const existing = queryOne('SELECT issue_id FROM ISSUE WHERE issue_id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Issue not found' });
  }

  execute('DELETE FROM ISSUE WHERE issue_id = ?', [req.params.id]);
  res.json({ success: true, message: 'Issue deleted successfully' });
});

// GET /api/issues/:id/comments - Get comments for an issue
router.get('/:id/comments', (req, res) => {
  const comments = queryAll(`
    SELECT c.*, u.name as user_name, u.role as user_role
    FROM COMMENT c
    JOIN USER u ON c.user_id = u.user_id
    WHERE c.issue_id = ?
    ORDER BY c.comment_id ASC
  `, [req.params.id]);

  res.json({ success: true, count: comments.length, data: comments });
});

// POST /api/issues/:id/comments - Add comment to an issue
router.post('/:id/comments', (req, res) => {
  const { user_id, comment_text } = req.body;
  if (!user_id || !comment_text) {
    return res.status(400).json({ success: false, message: 'user_id and comment_text are required' });
  }

  const result = execute(
    'INSERT INTO COMMENT (issue_id, user_id, comment_text) VALUES (?, ?, ?)',
    [req.params.id, user_id, comment_text.trim()]
  );

  const newComment = queryOne(`
    SELECT c.*, u.name as user_name, u.role as user_role 
    FROM COMMENT c 
    JOIN USER u ON c.user_id = u.user_id 
    WHERE c.comment_id = ?
  `, [result.lastInsertRowid]);

  res.status(201).json({ success: true, data: newComment });
});

module.exports = router;
