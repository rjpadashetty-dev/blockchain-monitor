const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticateToken, (req, res) => {
  const { category, message } = req.body;
  const allowed = ['id_blocked', 'transaction_failure', 'unidentified_transaction', 'other'];
  if (!allowed.includes(category) || !message || !message.trim()) {
    return res.status(400).json({ error: 'Choose a valid problem and enter a message' });
  }
  const request = {
    id: `help-${uuidv4().slice(0, 8)}`,
    userId: req.user.id,
    category,
    message: message.trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedBy: null,
    resolvedAt: null,
    adminNote: ''
  };
  db.get('helpRequests').push(request).write();
  res.status(201).json(request);
});

router.get('/my', authenticateToken, (req, res) => {
  res.json((db.get('helpRequests').value() || []).filter(request => request.userId === req.user.id));
});

module.exports = router;