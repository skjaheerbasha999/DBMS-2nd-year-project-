const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /api/users - List all users
router.get('/', (req, res) => {
  const users = queryAll('SELECT user_id, name, email, phone, role, created_at FROM USER ORDER BY user_id DESC');
  res.json({ success: true, count: users.length, data: users });
});

// GET /api/users/:id - Get single user with assigned projects
router.get('/:id', (req, res) => {
  const user = queryOne('SELECT user_id, name, email, phone, role, created_at FROM USER WHERE user_id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const projects = queryAll(
    `SELECT p.project_id, p.project_name, pm.member_role, pm.joined_date 
     FROM PROJECT_MEMBER pm 
     JOIN PROJECT p ON pm.project_id = p.project_id 
     WHERE pm.user_id = ?`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...user, enrolled_projects: projects } });
});

// POST /api/users - Create user (Admin privilege)
router.post('/', (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  }

  const existing = queryOne('SELECT user_id FROM USER WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already exists' });
  }

  const result = execute(
    'INSERT INTO USER (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), email.toLowerCase().trim(), password, phone || null, role === 'ADMIN' ? 'ADMIN' : 'USER']
  );

  const newUser = queryOne('SELECT user_id, name, email, phone, role, created_at FROM USER WHERE user_id = ?', [result.lastInsertRowid]);
  res.status(201).json({ success: true, data: newUser });
});

// PUT /api/users/:id - Update user details
router.put('/:id', (req, res) => {
  const { name, phone, role } = req.body;
  const user = queryOne('SELECT user_id FROM USER WHERE user_id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  execute(
    'UPDATE USER SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role) WHERE user_id = ?',
    [name, phone, role, req.params.id]
  );

  const updatedUser = queryOne('SELECT user_id, name, email, phone, role, created_at FROM USER WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, data: updatedUser });
});

// DELETE /api/users/:id
router.delete('/:id', (req, res) => {
  const user = queryOne('SELECT user_id FROM USER WHERE user_id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  execute('DELETE FROM USER WHERE user_id = ?', [req.params.id]);
  res.json({ success: true, message: 'User deleted successfully' });
});

module.exports = router;
