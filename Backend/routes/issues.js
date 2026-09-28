const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// Helper to map priority strings to priority_id
function getPriorityId(priorityStr) {
  if (!priorityStr) return 2;
  const p = priorityStr.toString().toLowerCase();
  if (p === 'low' || p === '1') return 1;
  if (p === 'high' || p === '3') return 3;
  if (p === 'critical' || p === '4') return 4;
  return 2; // Medium
}

// GET /api/issues - Search and filter issues
router.get('/', (req, res) => {
  const { project_id, status_id, priority_id, reported_by, assigned_to, category, search } = req.query;

  let sql = `
    SELECT 
      i.*,
      COALESCE(p.project_name, 'TrackFlow Main') as project_name,
      COALESCE(pri.priority_name, 'Medium') as priority_name,
      COALESCE(pri.priority_level, 2) as priority_level,
      COALESCE(st.status_name, 'Open') as status_name,
      u_rep.name as reporter_name,
      u_rep.email as reporter_email,
      u_ass.name as assignee_name,
      u_ass.email as assignee_email
    FROM ISSUE i
    LEFT JOIN PROJECT p ON i.project_id = p.project_id
    LEFT JOIN PRIORITY pri ON i.priority_id = pri.priority_id
    LEFT JOIN STATUS st ON i.status_id = st.status_id
    LEFT JOIN USER u_rep ON i.reported_by = u_rep.user_id
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
  if (reported_by) {
    sql += ' AND i.reported_by = ?';
    params.push(reported_by);
  }
  if (assigned_to) {
    sql += ' AND i.assigned_to = ?';
    params.push(assigned_to);
  }
  if (category) {
    sql += ' AND i.category = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (i.title LIKE ? OR i.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY i.issue_id DESC';

  const issues = queryAll(sql, params);
  res.json({ success: true, count: issues.length, data: issues });
});

// GET /api/issues/:id - Get issue detail with discussion comments & history
router.get('/:id', (req, res) => {
  const issue = queryOne(`
    SELECT 
      i.*,
      COALESCE(p.project_name, 'TrackFlow Main') as project_name,
      COALESCE(pri.priority_name, 'Medium') as priority_name,
      COALESCE(st.status_name, 'Open') as status_name,
      u_rep.name as reporter_name,
      u_rep.email as reporter_email,
      u_ass.name as assignee_name
    FROM ISSUE i
    LEFT JOIN PROJECT p ON i.project_id = p.project_id
    LEFT JOIN PRIORITY pri ON i.priority_id = pri.priority_id
    LEFT JOIN STATUS st ON i.status_id = st.status_id
    LEFT JOIN USER u_rep ON i.reported_by = u_rep.user_id
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

  const history = queryAll(`
    SELECT * FROM ISSUE_HISTORY
    WHERE issue_id = ?
    ORDER BY history_id ASC
  `, [req.params.id]);

  res.json({ success: true, data: { ...issue, comments, history } });
});

// POST /api/issues - Report new issue
router.post('/', (req, res) => {
  const { project_id, title, description, category, reported_by, assigned_to, priority, priority_id, status_id, due_date } = req.body;

  if (!title || !reported_by) {
    return res.status(400).json({ success: false, message: 'title and reported_by are required' });
  }

  const pId = priority_id || getPriorityId(priority);
  const projId = project_id || 1;
  const cat = category || 'Backend';

  const result = execute(`
    INSERT INTO ISSUE (project_id, title, description, category, reported_by, assigned_to, priority_id, status_id, due_date, ai_status, ai_attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', 0)
  `, [
    projId,
    title.trim(),
    description || '',
    cat,
    reported_by,
    assigned_to || null,
    pId,
    status_id || 1, // Default Open
    due_date || null
  ]);

  const newIssueId = result.lastInsertRowid;

  // Log History Event: Issue Created
  execute(`
    INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
    VALUES (?, 'Issue Created', ?)
  `, [newIssueId, `Issue reported in category "${cat}"`]);

  const newIssue = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [newIssueId]);
  res.status(201).json({ success: true, data: newIssue });
});

// POST /api/issues/:id/confirm-solution - User Solution Confirmation
router.post('/:id/confirm-solution', (req, res) => {
  const { solved, additional_info, user_id } = req.body;
  const issueId = req.params.id;

  const existing = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [issueId]);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Issue not found' });
  }

  if (solved) {
    // User confirms problem solved
    const nowIso = new Date().toISOString();
    execute(`
      UPDATE ISSUE
      SET status_id = 3, ai_status = 'Solved', resolved_date = ?
      WHERE issue_id = ?
    `, [nowIso, issueId]);

    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, 'Problem Solved', 'User verified AI solution and marked problem as solved')
    `, [issueId]);

    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, 'Issue Resolved', 'Issue status updated to Resolved')
    `, [issueId]);

    const updated = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [issueId]);
    return res.json({ success: true, message: 'Issue resolved successfully!', data: updated });
  } else {
    // User reports still not solved
    execute(`
      UPDATE ISSUE
      SET status_id = 2, ai_status = 'Attempt Failed'
      WHERE issue_id = ?
    `, [issueId]);

    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, 'User Tried Solution', 'User reported solution did not resolve the problem')
    `, [issueId]);

    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, 'Still Not Solved', 'Issue remains In Progress for further troubleshooting')
    `, [issueId]);

    if (additional_info && additional_info.trim()) {
      execute(`
        INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
        VALUES (?, 'Additional Information Added', ?)
      `, [issueId, `Added info: "${additional_info.trim()}"`]);

      if (user_id) {
        execute(
          'INSERT INTO COMMENT (issue_id, user_id, comment_text) VALUES (?, ?, ?)',
          [issueId, user_id, `[Additional Diagnostic Details]: ${additional_info.trim()}`]
        );
      }
    }

    const updated = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [issueId]);
    return res.json({ success: true, message: 'Issue updated. You can request another AI analysis.', data: updated });
  }
});

// PUT /api/issues/:id - Update issue status / priority / assignment
router.put('/:id', (req, res) => {
  const { title, description, category, assigned_to, priority_id, status_id, due_date } = req.body;
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
      category = COALESCE(?, category),
      assigned_to = COALESCE(?, assigned_to),
      priority_id = COALESCE(?, priority_id),
      status_id = COALESCE(?, status_id),
      due_date = COALESCE(?, due_date),
      resolved_date = ?
    WHERE issue_id = ?
  `, [
    title, description, category, assigned_to, priority_id, status_id, due_date, resolved_date, req.params.id
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

// GET /api/issues/:id/comments - Get comments
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

// POST /api/issues/:id/comments - Add comment
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
