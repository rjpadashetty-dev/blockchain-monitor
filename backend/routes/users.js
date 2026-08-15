const express = require('express');
const db = require('../utils/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/users/profile ───────────────────────────────────────────────────
router.get('/profile', authenticateToken, (req, res) => {
  const user = db.get('users').find({ id: req.user.id }).value();
  const { password, ...safeUser } = user;
  res.json(safeUser);
});

// ─── PUT /api/users/profile ───────────────────────────────────────────────────
router.put('/profile', authenticateToken, (req, res) => {
  const { fullName, phone, department } = req.body;
  const updates = {};
  if (fullName) updates.fullName = fullName;
  if (phone !== undefined) updates.phone = phone;
  if (department !== undefined) updates.department = department;

  db.get('users').find({ id: req.user.id }).assign(updates).write();
  const updated = db.get('users').find({ id: req.user.id }).value();
  const { password, ...safeUser } = updated;
  res.json(safeUser);
});

// ─── GET /api/users/search/:query ────────────────────────────────────────────
// Search users by username or wallet address (for transfer recipient lookup)
router.get('/search/:query', authenticateToken, (req, res) => {
  const q = req.params.query.toLowerCase();
  const users = db.get('users')
    .filter(u =>
      u.id !== req.user.id &&
      u.role === 'user' &&
      u.status === 'active' &&
      (u.username.toLowerCase().includes(q) || u.walletAddress.toLowerCase().includes(q))
    )
    .value()
    .map(({ password, balance, ...safe }) => safe) // don't expose balance
    .slice(0, 10);

  res.json(users);
});

module.exports = router;
