const express = require('express');
const router = express.Router();
const { queryOne, execute } = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    const user = await queryOne('SELECT * FROM "USER" WHERE email = ?', [cleanEmail]);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const { password: _, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      message: 'Login successful',
      token: `mock-jwt-token-user-${user.user_id}`,
      user: userWithoutPassword
    });
  } catch (err) {
    console.error('[Auth Error]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const cleanEmail = (email || '').toLowerCase().trim();
    const existing = await queryOne('SELECT user_id FROM "USER" WHERE email = ?', [cleanEmail]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
    }

    // Public registration ALWAYS defaults to USER role
    const userRole = 'USER';
    const result = await execute(
      'INSERT INTO "USER" (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), cleanEmail, password, phone || null, userRole]
    );

    const newUser = await queryOne('SELECT user_id, name, email, phone, role, created_at FROM "USER" WHERE user_id = ?', [result.lastInsertRowid]);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token: `mock-jwt-token-user-${newUser.user_id}`,
      user: newUser
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No authorization header provided.' });
    }

    const match = authHeader.match(/user-(\d+)/);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const userId = parseInt(match[1]);
    const user = await queryOne('SELECT user_id, name, email, phone, role, created_at FROM "USER" WHERE user_id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error('[Me Error]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
