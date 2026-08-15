const express = require('express');
const db = require('../utils/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/alerts (admin) ──────────────────────────────────────────────────
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const { resolved, severity } = req.query;
  let alerts = db.get('alerts').value();

  if (resolved === 'false') alerts = alerts.filter(a => !a.resolved);
  if (resolved === 'true') alerts = alerts.filter(a => a.resolved);
  if (severity) alerts = alerts.filter(a => a.severity === severity);

  alerts = alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Enrich with user info and transaction info
  const users = db.get('users').value();
  const transactions = db.get('transactions').value();

  const enriched = alerts.map(alert => {
    const user = users.find(u => u.id === alert.userId);
    const tx = transactions.find(t => t.id === alert.transactionId);
    return {
      ...alert,
      userName: user ? user.fullName : 'Unknown',
      username: user ? user.username : 'unknown',
      transactionAmount: tx ? tx.amount : null,
      suspicionScore: tx ? tx.suspicionScore : null
    };
  });

  res.json(enriched);
});

// ─── PUT /api/alerts/:id/resolve (admin) ─────────────────────────────────────
router.put('/:id/resolve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const alert = db.get('alerts').find({ id }).value();
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  db.get('alerts').find({ id }).assign({
    resolved: true,
    resolvedBy: req.user.username,
    resolvedAt: new Date().toISOString()
  }).write();

  res.json({ message: 'Alert resolved' });
});

module.exports = router;
