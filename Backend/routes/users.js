const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /api/users - List all users with issue resolution stats
router.get('/', async (req, res) => {
  try {
    const users = await queryAll(`
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.created_at,
        COUNT(i.issue_id) as total_issues,
        SUM(CASE WHEN i.status_id = 1 OR i.status_id = 2 THEN 1 ELSE 0 END) as open_issues,
        SUM(CASE WHEN i.status_id = 3 THEN 1 ELSE 0 END) as resolved_issues
      FROM "USER" u
      LEFT JOIN "ISSUE" i ON u.user_id = i.reported_by
      GROUP BY u.user_id, u.name, u.email, u.phone, u.role, u.created_at
      ORDER BY u.user_id DESC
    `);
    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    console.error('[Get Users Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/:id - Get single user with assigned projects
router.get('/:id', async (req, res) => {
  try {
    const user = await queryOne(`
      SELECT 
        u.user_id, u.name, u.email, u.phone, u.role, u.created_at,
        COUNT(i.issue_id) as total_issues,
        SUM(CASE WHEN i.status_id = 1 OR i.status_id = 2 THEN 1 ELSE 0 END) as open_issues,
        SUM(CASE WHEN i.status_id = 3 THEN 1 ELSE 0 END) as resolved_issues
      FROM "USER" u
      LEFT JOIN "ISSUE" i ON u.user_id = i.reported_by
      WHERE u.user_id = ?
      GROUP BY u.user_id, u.name, u.email, u.phone, u.role, u.created_at
    `, [req.params.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const projects = await queryAll(
      `SELECT p.project_id, p.project_name, pm.member_role, pm.joined_date 
       FROM "PROJECT_MEMBER" pm 
       JOIN "PROJECT" p ON pm.project_id = p.project_id 
       WHERE pm.user_id = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...user, enrolled_projects: projects } });
  } catch (err) {
    console.error('[Get User Detail Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users - Create user (Admin privilege)
router.post('/', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existing = await queryOne('SELECT user_id FROM "USER" WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const result = await execute(
      'INSERT INTO "USER" (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), password, phone || null, role === 'ADMIN' ? 'ADMIN' : 'USER']
    );

    const newUser = await queryOne('SELECT user_id, name, email, phone, role, created_at FROM "USER" WHERE user_id = ?', [result.lastInsertRowid]);
    res.status(201).json({ success: true, data: newUser });
  } catch (err) {
    console.error('[Create User Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id - Update user details
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    const user = await queryOne('SELECT user_id FROM "USER" WHERE user_id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await execute(
      'UPDATE "USER" SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role) WHERE user_id = ?',
      [name, phone, role, req.params.id]
    );

    const updatedUser = await queryOne('SELECT user_id, name, email, phone, role, created_at FROM "USER" WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, data: updatedUser });
  } catch (err) {
    console.error('[Update User Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT user_id FROM "USER" WHERE user_id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await execute('DELETE FROM "USER" WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('[Delete User Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
