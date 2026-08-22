const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.get('users')
      .find(u => u.username === username || u.email === username)
      .value();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is suspended. Contact admin.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    db.get('users').find({ id: user.id }).assign({ lastLogin: new Date().toISOString() }).write();

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        userCode: user.userCode,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        walletAddress: user.walletAddress,
        balance: user.balance,
        phone: user.phone,
        department: user.department,
        status: user.status,
        transferBlocked: Boolean(user.transferBlocked),
        transferLimits: user.transferLimits || { daily: null, monthly: null },
        createdAt: user.createdAt,
        lastLogin: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = db.get('users').find({ id: req.user.id }).value();
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.get('users').find({ id: req.user.id }).assign({ password: hashed }).write();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticateToken, (req, res) => {
  const { password, ...safeUser } = req.user;
  res.json(safeUser);
});

module.exports = router;
