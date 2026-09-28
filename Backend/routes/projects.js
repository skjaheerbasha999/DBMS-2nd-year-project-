const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /api/projects - List all projects with statistics & creator details
router.get('/', async (req, res) => {
  try {
    const projects = await queryAll(`
      SELECT 
        p.project_id,
        p.project_name,
        p.description,
        p.start_date,
        p.deadline,
        p.status_id,
        p.created_by,
        u.name as creator_name,
        u.email as creator_email,
        (SELECT COUNT(*) FROM "ISSUE" i WHERE i.project_id = p.project_id) as total_issues,
        (SELECT COUNT(*) FROM "ISSUE" i WHERE i.project_id = p.project_id AND i.status_id = 3) as resolved_issues,
        (SELECT COUNT(*) FROM "PROJECT_MEMBER" pm WHERE pm.project_id = p.project_id) as total_members
      FROM "PROJECT" p
      LEFT JOIN "USER" u ON p.created_by = u.user_id
      ORDER BY p.project_id DESC
    `);

    res.json({ success: true, count: projects.length, data: projects });
  } catch (err) {
    console.error('[Get Projects Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/projects/:id - Get project detail with members and issues
router.get('/:id', async (req, res) => {
  try {
    const project = await queryOne(`
      SELECT p.*, u.name as creator_name 
      FROM "PROJECT" p 
      LEFT JOIN "USER" u ON p.created_by = u.user_id 
      WHERE p.project_id = ?
    `, [req.params.id]);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const members = await queryAll(`
      SELECT pm.user_id, u.name, u.email, u.role, pm.member_role, pm.joined_date
      FROM "PROJECT_MEMBER" pm
      JOIN "USER" u ON pm.user_id = u.user_id
      WHERE pm.project_id = ?
    `, [req.params.id]);

    const issues = await queryAll(`
      SELECT i.*, pri.priority_name, st.status_name, u_rep.name as reporter_name, u_ass.name as assignee_name
      FROM "ISSUE" i
      JOIN "PRIORITY" pri ON i.priority_id = pri.priority_id
      JOIN "STATUS" st ON i.status_id = st.status_id
      JOIN "USER" u_rep ON i.reported_by = u_rep.user_id
      LEFT JOIN "USER" u_ass ON i.assigned_to = u_ass.user_id
      WHERE i.project_id = ?
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        ...project,
        members,
        issues
      }
    });
  } catch (err) {
    console.error('[Get Project Detail Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects - Create a new project
router.post('/', async (req, res) => {
  try {
    const { project_name, description, start_date, deadline, status_id, created_by } = req.body;

    if (!project_name) {
      return res.status(400).json({ success: false, message: 'Project name is required' });
    }

    const result = await execute(
      'INSERT INTO "PROJECT" (project_name, description, start_date, deadline, status_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [project_name.trim(), description || '', start_date || null, deadline || null, status_id || 1, created_by || 1]
    );

    const newProjId = result.lastInsertRowid;

    if (created_by) {
      await execute(
        'INSERT INTO "PROJECT_MEMBER" (project_id, user_id, member_role, joined_date) VALUES (?, ?, ?, DATE("now"))',
        [newProjId, created_by, 'Project Lead']
      );
    }

    const createdProject = await queryOne('SELECT * FROM "PROJECT" WHERE project_id = ?', [newProjId]);
    res.status(201).json({ success: true, data: createdProject });
  } catch (err) {
    console.error('[Create Project Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', async (req, res) => {
  try {
    const { project_name, description, start_date, deadline, status_id } = req.body;
    const project = await queryOne('SELECT project_id FROM "PROJECT" WHERE project_id = ?', [req.params.id]);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    await execute(
      'UPDATE "PROJECT" SET project_name = COALESCE(?, project_name), description = COALESCE(?, description), start_date = COALESCE(?, start_date), deadline = COALESCE(?, deadline), status_id = COALESCE(?, status_id) WHERE project_id = ?',
      [project_name, description, start_date, deadline, status_id, req.params.id]
    );

    const updatedProject = await queryOne('SELECT * FROM "PROJECT" WHERE project_id = ?', [req.params.id]);
    res.json({ success: true, data: updatedProject });
  } catch (err) {
    console.error('[Update Project Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const project = await queryOne('SELECT project_id FROM "PROJECT" WHERE project_id = ?', [req.params.id]);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    await execute('DELETE FROM "PROJECT" WHERE project_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    console.error('[Delete Project Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:id/members - Add member to project
router.post('/:id/members', async (req, res) => {
  try {
    const { user_id, member_role } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    await execute(
      'INSERT OR REPLACE INTO PROJECT_MEMBER (project_id, user_id, member_role, joined_date) VALUES (?, ?, ?, DATE("now"))',
      [req.params.id, user_id, member_role || 'Developer']
    );

    res.status(201).json({ success: true, message: 'Member added to project successfully' });
  } catch (err) {
    console.error('[Add Member Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:id/members/:userId - Remove member from project
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    await execute('DELETE FROM "PROJECT_MEMBER" WHERE project_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
    res.json({ success: true, message: 'Member removed from project' });
  } catch (err) {
    console.error('[Remove Member Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
