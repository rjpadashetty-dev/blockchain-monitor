const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// ─── GET /api/admin/overview ──────────────────────────────────────────────────
router.get('/overview', (req, res) => {
  const users = db.get('users').value();
  const transactions = db.get('transactions').value();
  const alerts = db.get('alerts').value();

  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const suspiciousTxs = transactions.filter(tx => tx.suspicious);
  const unresolvedAlerts = alerts.filter(a => !a.resolved);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentTxs = transactions.filter(tx => new Date(tx.timestamp) >= thirtyDaysAgo);

  // Transaction volume by day (last 7 days)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayTxs = transactions.filter(tx => tx.timestamp.startsWith(dateStr));
    last7Days.push({
      date: dateStr,
      count: dayTxs.length,
      volume: dayTxs.reduce((s, tx) => s + tx.amount, 0),
      suspicious: dayTxs.filter(tx => tx.suspicious).length
    });
  }

  res.json({
    stats: {
      totalUsers: users.filter(u => u.role === 'user').length,
      activeUsers: users.filter(u => u.role === 'user' && u.status === 'active').length,
      suspendedUsers: users.filter(u => u.status !== 'active').length,
      totalTransactions: transactions.length,
      totalVolume: parseFloat(totalVolume.toFixed(2)),
      suspiciousTransactions: suspiciousTxs.length,
      unresolvedAlerts: unresolvedAlerts.length,
      recentTransactions: recentTxs.length,
      confirmedTxs: transactions.filter(tx => tx.status === 'confirmed').length,
      flaggedTxs: transactions.filter(tx => tx.status === 'flagged').length
    },
    chartData: last7Days,
    recentAlerts: alerts
      .filter(a => !a.resolved)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5),
    recentTransactions: transactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5)
  });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const { search, status, role } = req.query;
  let users = db.get('users').value();

  if (search) {
    const s = search.toLowerCase();
    users = users.filter(u =>
      u.username.toLowerCase().includes(s) ||
      u.fullName.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s)
    );
  }
  if (status) users = users.filter(u => u.status === status);
  if (role) users = users.filter(u => u.role === role);

  // Remove password from response
  const safeUsers = users.map(({ password, ...u }) => u);
  res.json(safeUsers);
});

// ─── POST /api/admin/users ────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, fullName, role = 'user', phone, department, balance = 0 } = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ error: 'Username, email, password and fullName are required' });
    }

    const existing = db.get('users').find(u => u.username === username || u.email === email).value();
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const walletAddress = '0x' + Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const newUser = {
      id: `user-${uuidv4().slice(0, 8)}`,
      username,
      email,
      password: hashed,
      role,
      fullName,
      walletAddress,
      balance: Math.max(0, parseFloat(balance) || 0),
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLogin: null,
      phone: phone || '',
      department: department || ''
    };

    db.get('users').push(newUser).write();
    const { password: _, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, department, status, role, balance, password } = req.body;

    const user = db.get('users').find({ id }).value();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (department !== undefined) updates.department = department;
    if (status !== undefined) updates.status = status;
    if (role !== undefined) updates.role = role;
    if (balance !== undefined) updates.balance = parseFloat(balance);
    if (password) updates.password = await bcrypt.hash(password, 10);

    db.get('users').find({ id }).assign(updates).write();
    const updated = db.get('users').find({ id }).value();
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  if (id === 'admin-001') {
    return res.status(403).json({ error: 'Cannot delete the primary admin account' });
  }
  const user = db.get('users').find({ id }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.get('users').remove({ id }).write();
  res.json({ message: 'User deleted successfully' });
});

// ─── GET /api/admin/cicd ─────────────────────────────────────────────────────
router.get('/cicd', (req, res) => {
  // Mock CI/CD data - in production, this would integrate with Jenkins/GitHub Actions APIs
  const cicdData = {
    stats: {
      activePipelines: 3,
      successfulBuilds: 24,
      failedBuilds: 2,
      avgBuildTime: 12
    },
    pipelines: [
      {
        name: 'Backend API',
        branch: 'main',
        commit: 'a1b2c3d4e5f6',
        status: 'running',
        duration: '8m 32s',
        startedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString()
      },
      {
        name: 'Frontend UI',
        branch: 'develop',
        commit: 'f6e5d4c3b2a1',
        status: 'success',
        duration: '12m 15s',
        startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
      },
      {
        name: 'ML Anomaly Detector',
        branch: 'feature/anomaly-v2',
        commit: '9h8g7f6e5d4',
        status: 'failed',
        duration: '5m 48s',
        startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      }
    ],
    recentBuilds: [
      {
        project: 'Backend API',
        buildNumber: 145,
        trigger: 'Push to main',
        status: 'success',
        duration: '11m 23s',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        project: 'Frontend UI',
        buildNumber: 89,
        trigger: 'Pull Request',
        status: 'success',
        duration: '8m 45s',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      },
      {
        project: 'ML Anomaly Detector',
        buildNumber: 67,
        trigger: 'Push to feature',
        status: 'failed',
        duration: '5m 48s',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      },
      {
        project: 'Docker Images',
        buildNumber: 234,
        trigger: 'Scheduled',
        status: 'success',
        duration: '15m 12s',
        timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
      },
      {
        project: 'Security Tests',
        buildNumber: 156,
        trigger: 'Manual',
        status: 'running',
        duration: '3m 27s',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      }
    ],
    deployments: [
      {
        service: 'Backend API',
        version: 'v1.2.3',
        environment: 'production',
        status: 'success',
        deployedBy: 'jenkins-ci',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        service: 'Frontend UI',
        version: 'v2.1.0',
        environment: 'staging',
        status: 'success',
        deployedBy: 'github-actions',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      },
      {
        service: 'ML Service',
        version: 'v1.0.8',
        environment: 'production',
        status: 'failed',
        deployedBy: 'jenkins-ci',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      },
      {
        service: 'Database',
        version: 'v3.4.1',
        environment: 'production',
        status: 'success',
        deployedBy: 'terraform',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
      },
      {
        service: 'Monitoring',
        version: 'v1.5.2',
        environment: 'staging',
        status: 'running',
        deployedBy: 'github-actions',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      }
    ]
  };

  res.json(cicdData);
});

module.exports = router;
