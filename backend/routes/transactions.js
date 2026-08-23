const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { analyzeTransaction } = require('../ml/anomalyDetector');
const database = require('../utils/database');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../utils/realtime');

const router = express.Router();

function getTransferUsage(userId, start) {
  return db.get('transactions').value()
    .filter(tx => tx.fromUserId === userId && new Date(tx.timestamp) >= start)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

function validateTransferPolicy(sender, recipient, amount) {
  if (sender.transferBlocked) return 'Your transfer access is blocked by an administrator.';
  if (recipient.transferBlocked) return 'This recipient cannot currently send or receive funds.';

  const limits = sender.transferLimits || {};
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (limits.daily !== null && limits.daily !== undefined && getTransferUsage(sender.id, dayStart) + amount > Number(limits.daily)) {
    return `Daily transfer limit of ₹${Number(limits.daily).toFixed(2)} would be exceeded.`;
  }
  if (limits.monthly !== null && limits.monthly !== undefined && getTransferUsage(sender.id, monthStart) + amount > Number(limits.monthly)) {
    return `Monthly transfer limit of ₹${Number(limits.monthly).toFixed(2)} would be exceeded.`;
  }
  return null;
}

// ─── GET /api/transactions/my ─────────────────────────────────────────────────
// Get current user's transactions
router.get('/my', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20 } = req.query;

  const all = db.get('transactions')
    .filter(tx => tx.fromUserId === userId || tx.toUserId === userId)
    .orderBy('timestamp', 'desc')
    .value();

  const start = (page - 1) * limit;
  const paginated = all.slice(start, start + parseInt(limit));

  // Enrich with user names
  const users = db.get('users').value();
  const enriched = paginated.map(tx => enrichTransaction(tx, users));

  res.json({
    transactions: enriched,
    total: all.length,
    page: parseInt(page),
    pages: Math.ceil(all.length / limit)
  });
});

// ─── POST /api/transactions/transfer ─────────────────────────────────────────
// User sends money to another user
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { toUsername, amount, note } = req.body;

    if (!toUsername || !amount) {
      return res.status(400).json({ error: 'Recipient username and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (amt < 0.01) {
      return res.status(400).json({ error: 'Minimum transfer amount is $0.01' });
    }

    const sender = db.get('users').find({ id: req.user.id }).value();
    const recipient = db.get('users').find(u =>
      u.username === toUsername || u.userCode === toUsername || u.email === toUsername || u.walletAddress === toUsername
    ).value();

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    if (recipient.id === sender.id) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    if (sender.balance < amt) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const policyError = validateTransferPolicy(sender, recipient, amt);
    if (policyError) return res.status(403).json({ error: policyError });

    const fee = parseFloat((amt * 0.001).toFixed(4)); // 0.1% fee
    const totalDeducted = amt + fee;

    if (sender.balance < totalDeducted) {
      return res.status(400).json({ error: 'Insufficient balance (including fee)' });
    }

    // ── Run anomaly detection ──────────────────────────────────────────────────
    const analysis = analyzeTransaction({
      fromUserId: sender.id,
      toUserId: recipient.id,
      amount: amt,
      timestamp: new Date().toISOString()
    });

    // ── Generate fake blockchain tx hash ──────────────────────────────────────
    const txHash = '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const blockNumber = 18450000 + Math.floor(Math.random() * 100000);

    const transaction = {
      id: 'tx-' + uuidv4().slice(0, 8),
      txHash,
      fromUserId: sender.id,
      toUserId: recipient.id,
      fromAddress: sender.walletAddress,
      toAddress: recipient.walletAddress,
      amount: amt,
      fee,
      status: analysis.suspicious ? 'flagged' : 'confirmed',
      blockNumber,
      timestamp: new Date().toISOString(),
      note: note || '',
      ...analysis
    };

    // ── Update balances ───────────────────────────────────────────────────────
    db.get('users').find({ id: sender.id })
      .assign({ balance: parseFloat((sender.balance - totalDeducted).toFixed(4)) })
      .write();

    db.get('users').find({ id: recipient.id })
      .assign({ balance: parseFloat((recipient.balance + amt).toFixed(4)) })
      .write();

    db.get('transactions').push(transaction).write();

    // ── Create alert if suspicious ────────────────────────────────────────────
    if (analysis.suspicious) {
      const alert = {
        id: 'alert-' + uuidv4().slice(0, 8),
        type: 'suspicious_transaction',
        severity: analysis.severity,
        transactionId: transaction.id,
        userId: sender.id,
        message: `Suspicious transaction detected: ${analysis.suspicionReasons.join(', ')}`,
        timestamp: new Date().toISOString(),
        resolved: false,
        resolvedBy: null,
        resolvedAt: null
      };
      db.get('alerts').push(alert).write();
      notify('security:high-risk-transaction', { transaction, alert });
    }

    await recordAudit({ actor: sender, action: 'transaction.transfer', entityType: 'transaction', entityId: transaction.id, metadata: { amount: amt, recipient: recipient.username }, req });

    res.json({
      success: true,
      transaction,
      newBalance: db.get('users').find({ id: sender.id }).value().balance,
      warning: analysis.suspicious
        ? `⚠️ This transaction has been flagged for review: ${analysis.suspicionReasons.join(', ')}`
        : null
    });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Transfer failed' });
  }
});

// ─── POST /api/transactions/admin-transfer (admin only) ───────────────────────
router.post('/admin-transfer', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { fromUsername, toUsername, amount, note } = req.body;

    if (!fromUsername || !toUsername || !amount) {
      return res.status(400).json({ error: 'From username, to username, and amount are required' });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const sender = db.get('users').find(u => u.username === fromUsername || u.userCode === fromUsername).value();
    const recipient = db.get('users').find(u => u.username === toUsername || u.userCode === toUsername).value();

    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    if (sender.id === recipient.id) {
      return res.status(400).json({ error: 'Cannot transfer to the same user' });
    }
    if (sender.balance < amt) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const policyError = validateTransferPolicy(sender, recipient, amt);
    if (policyError) return res.status(403).json({ error: policyError });

    const fee = parseFloat((amt * 0.001).toFixed(4)); // 0.1% fee
    const totalDeducted = amt + fee;

    if (sender.balance < totalDeducted) {
      return res.status(400).json({ error: 'Insufficient balance (including fee)' });
    }

    // ── Run anomaly detection ──────────────────────────────────────────────────
    const analysis = analyzeTransaction({
      fromUserId: sender.id,
      toUserId: recipient.id,
      amount: amt,
      timestamp: new Date().toISOString()
    });

    // ── Generate fake blockchain tx hash ──────────────────────────────────────
    const txHash = '0x' + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const blockNumber = 18450000 + Math.floor(Math.random() * 100000);

    const transaction = {
      id: 'tx-' + uuidv4().slice(0, 8),
      txHash,
      fromUserId: sender.id,
      toUserId: recipient.id,
      fromAddress: sender.walletAddress,
      toAddress: recipient.walletAddress,
      amount: amt,
      fee,
      status: analysis.suspicious ? 'flagged' : 'confirmed',
      blockNumber,
      timestamp: new Date().toISOString(),
      note: `[ADMIN] ${note || 'Administrative transfer'}`,
      ...analysis
    };

    // ── Update balances ───────────────────────────────────────────────────────
    db.get('users').find({ id: sender.id })
      .assign({ balance: parseFloat((sender.balance - totalDeducted).toFixed(4)) })
      .write();

    db.get('users').find({ id: recipient.id })
      .assign({ balance: parseFloat((recipient.balance + amt).toFixed(4)) })
      .write();

    db.get('transactions').push(transaction).write();

    // ── Create alert if suspicious ────────────────────────────────────────────
    if (analysis.suspicious) {
      const alert = {
        id: 'alert-' + uuidv4().slice(0, 8),
        type: 'suspicious_transaction',
        severity: analysis.severity,
        transactionId: transaction.id,
        userId: sender.id,
        message: `[ADMIN INITIATED] Suspicious transaction detected: ${analysis.suspicionReasons.join(', ')}`,
        timestamp: new Date().toISOString(),
        resolved: false,
        resolvedBy: null,
        resolvedAt: null
      };
      db.get('alerts').push(alert).write();
    }

    res.json({
      success: true,
      transaction,
      newBalance: db.get('users').find({ id: sender.id }).value().balance,
      warning: analysis.suspicious
        ? `⚠️ This transaction has been flagged for review: ${analysis.suspicionReasons.join(', ')}`
        : null
    });
  } catch (err) {
    console.error('Admin transfer error:', err);
    res.status(500).json({ error: 'Transfer failed' });
  }
});

router.post('/admin-wallet-operation', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, amount, operation, note } = req.body;
    const numericAmount = Number(amount);
    if (!username || !Number.isFinite(numericAmount) || numericAmount <= 0 || !['deposit', 'withdrawal'].includes(operation)) return res.status(400).json({ error: 'User, valid amount and operation are required' });
    const user = db.get('users').find(u => u.username === username || u.userCode === username).value();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (operation === 'withdrawal' && user.balance < numericAmount) return res.status(400).json({ error: 'Insufficient balance' });
    const analysis = analyzeTransaction({ fromUserId: user.id, toUserId: user.id, amount: numericAmount, timestamp: new Date().toISOString() });
    const transaction = { id: `tx-${uuidv4().slice(0, 8)}`, txHash: `internal-${uuidv4()}`, fromUserId: user.id, toUserId: user.id, fromAddress: user.walletAddress, toAddress: user.walletAddress, amount: numericAmount, fee: 0, status: analysis.suspicious ? 'flagged' : 'confirmed', blockNumber: null, timestamp: new Date().toISOString(), note: `[ADMIN ${operation.toUpperCase()}] ${note || ''}`.trim(), transactionType: operation, ...analysis };
    db.get('users').find({ id: user.id }).assign({ balance: parseFloat((user.balance + (operation === 'deposit' ? numericAmount : -numericAmount)).toFixed(4)) }).write();
    db.get('transactions').push(transaction).write();
    if (analysis.suspicious) db.get('alerts').push({ id: `alert-${uuidv4().slice(0, 8)}`, type: `${operation}_review`, severity: analysis.severity, transactionId: transaction.id, userId: user.id, message: `Suspicious ${operation} detected: ${analysis.suspicionReasons.join(', ')}`, timestamp: new Date().toISOString(), resolved: false, resolvedBy: null, resolvedAt: null }).write();
    res.json({ success: true, transaction, newBalance: db.get('users').find({ id: user.id }).value().balance, warning: analysis.suspicious ? `${operation} flagged for review` : null });
  } catch (error) { console.error('Wallet operation error:', error); res.status(500).json({ error: 'Wallet operation failed' }); }
});

// ─── GET /api/transactions/all (admin) ───────────────────────────────────────
router.get('/all', authenticateToken, requireAdmin, (req, res) => {
  const { page = 1, limit = 25, suspicious, userId, transactionType } = req.query;

  let query = db.get('transactions');

  if (suspicious === 'true') query = query.filter({ suspicious: true });
  if (userId) query = query.filter(tx => tx.fromUserId === userId || tx.toUserId === userId);
  if (transactionType) query = query.filter(tx => (tx.transactionType || 'transfer') === transactionType);

  const all = query.orderBy('timestamp', 'desc').value();
  const start = (page - 1) * limit;
  const paginated = all.slice(start, start + parseInt(limit));

  const users = db.get('users').value();
  const enriched = paginated.map(tx => enrichTransaction(tx, users));

  res.json({
    transactions: enriched,
    total: all.length,
    page: parseInt(page),
    pages: Math.ceil(all.length / limit)
  });
});

// Helper: enrich transaction with user names
function enrichTransaction(tx, users) {
  const from = users.find(u => u.id === tx.fromUserId);
  const to = users.find(u => u.id === tx.toUserId);
  return {
    ...tx,
    fromName: from ? from.fullName : 'Unknown',
    fromUsername: from ? from.username : 'unknown',
    toName: to ? to.fullName : 'Unknown',
    toUsername: to ? to.username : 'unknown'
  };
}

module.exports = router;
