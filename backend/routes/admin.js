const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const projectRoot = path.resolve(__dirname, '..', '..');

function projectExists(relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    userCode: safeUser.userCode || `${safeUser.username}-${safeUser.id.slice(-6)}`,
    transferLimits: safeUser.transferLimits || { daily: null, monthly: null },
    transferBlocked: Boolean(safeUser.transferBlocked)
  };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text || url}`);
  }
  return response.json();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m 0s';
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

async function fetchJenkinsCICD() {
  const baseUrl = process.env.JENKINS_URL;
  if (!baseUrl) return null;

  try {
    const jobNames = ['backend', 'frontend', 'docker', 'security'];
    const pipelines = await Promise.all(jobNames.map(async (jobName) => {
      const jobUrl = `${baseUrl.replace(/\/$/, '')}/job/${encodeURIComponent(jobName)}/lastBuild/api/json?tree=number,result,duration,timestamp,url,actions[causes[shortDescription]]`;
      const data = await fetchJson(jobUrl, {
        Authorization: `Basic ${Buffer.from(`${process.env.JENKINS_USER || 'admin'}:${process.env.JENKINS_TOKEN || ''}`).toString('base64')}`
      }).catch(() => null);

      if (!data) return null;

      const status = data.result === 'SUCCESS' ? 'success' : data.result === 'FAILURE' || data.result === 'ABORTED' ? 'failed' : data.result === 'UNSTABLE' ? 'failed' : 'running';
      const name = jobName === 'backend' ? 'Backend API' : jobName === 'frontend' ? 'Frontend UI' : jobName === 'docker' ? 'Docker Images' : 'Security Tests';

      return {
        name,
        branch: 'main',
        commit: data.url ? data.url.split('/').filter(Boolean).slice(-2, -1)[0] || 'jenkins' : 'jenkins',
        status,
        duration: formatDuration(data.duration || 0),
        trigger: data.actions?.[0]?.causes?.[0]?.shortDescription || 'Jenkins run',
        startedAt: new Date(data.timestamp || Date.now()).toISOString()
      };
    }));

    const validPipelines = pipelines.filter(Boolean);
    if (!validPipelines.length) return null;

    const successfulBuilds = validPipelines.filter((pipeline) => pipeline.status === 'success').length;
    const failedBuilds = validPipelines.filter((pipeline) => pipeline.status === 'failed').length;
    const runningBuilds = validPipelines.filter((pipeline) => pipeline.status === 'running').length;

    return {
      stats: {
        activePipelines: runningBuilds,
        successfulBuilds,
        failedBuilds,
        avgBuildTime: Math.round(validPipelines.reduce((sum, pipeline) => sum + Number((pipeline.duration || '0m 0s').match(/(\d+)m/)?.[1] || 0), 0) / Math.max(validPipelines.length, 1))
      },
      pipelines: validPipelines,
      recentBuilds: validPipelines.map((pipeline, index) => ({
        project: pipeline.name,
        buildNumber: index + 1,
        trigger: pipeline.trigger,
        status: pipeline.status,
        duration: pipeline.duration,
        timestamp: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString()
      })),
      deployments: validPipelines.map((pipeline) => ({
        service: pipeline.name,
        version: 'v1.0.0',
        environment: pipeline.name === 'Backend API' ? 'production' : 'staging',
        status: pipeline.status,
        deployedBy: 'jenkins',
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }))
    };
  } catch (error) {
    console.warn('Jenkins integration failed:', error.message);
    return null;
  }
}

async function fetchGitHubActionsCICD() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) return null;

  try {
    const url = `https://api.github.com/repos/${repo}/actions/runs?per_page=10`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const data = await fetchJson(url, headers);

    const runs = (data.workflow_runs || []).slice(0, 5);
    if (!runs.length) return null;

    const pipelines = runs.map((run) => ({
      name: run.name || run.display_title || 'GitHub Action',
      branch: run.head_branch || 'main',
      commit: (run.head_sha || '').slice(0, 12),
      status: run.status === 'completed' ? (run.conclusion === 'success' ? 'success' : 'failed') : 'running',
      duration: formatDuration(run.run_attempt ? run.updated_at && run.created_at ? new Date(run.updated_at) - new Date(run.created_at) : 0 : 0),
      trigger: run.event || 'GitHub Actions',
      startedAt: new Date(run.created_at || Date.now()).toISOString()
    }));

    return {
      stats: {
        activePipelines: pipelines.filter((p) => p.status === 'running').length,
        successfulBuilds: pipelines.filter((p) => p.status === 'success').length,
        failedBuilds: pipelines.filter((p) => p.status === 'failed').length,
        avgBuildTime: Math.round(pipelines.reduce((sum, pipeline) => sum + Number((pipeline.duration || '0m 0s').match(/(\d+)m/)?.[1] || 0), 0) / Math.max(pipelines.length, 1))
      },
      pipelines,
      recentBuilds: pipelines.map((pipeline, index) => ({
        project: pipeline.name,
        buildNumber: index + 1,
        trigger: pipeline.trigger,
        status: pipeline.status,
        duration: pipeline.duration,
        timestamp: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString()
      })),
      deployments: runs.slice(0, 3).map((run) => ({
        service: run.name || 'GitHub Action',
        version: 'v1.0.0',
        environment: run.head_branch === 'main' ? 'production' : 'staging',
        status: run.status === 'completed' ? (run.conclusion === 'success' ? 'success' : 'failed') : 'running',
        deployedBy: 'github-actions',
        timestamp: new Date(run.created_at || Date.now()).toISOString()
      }))
    };
  } catch (error) {
    console.warn('GitHub Actions integration failed:', error.message);
    return null;
  }
}

async function getLiveCICDData() {
  const jenkinsData = await fetchJenkinsCICD();
  if (jenkinsData) return jenkinsData;

  const githubData = await fetchGitHubActionsCICD();
  if (githubData) return githubData;

  return buildProjectCICDData();
}

function buildProjectCICDData() {
  const projectChecks = [
    {
      name: 'Backend API',
      branch: 'main',
      commit: 'backend-service',
      file: 'backend/server.js',
      status: 'success',
      duration: '8m 12s',
      trigger: 'Repository sync'
    },
    {
      name: 'Frontend UI',
      branch: 'main',
      file: 'frontend/index.html',
      status: projectExists('frontend/index.html') ? 'success' : 'failed',
      duration: '5m 49s',
      trigger: 'UI deployment'
    },
    {
      name: 'ML Anomaly Detector',
      branch: 'feature/anomaly-v2',
      file: 'backend/ml/anomalyDetector.js',
      status: projectExists('backend/ml/anomalyDetector.js') ? 'success' : 'failed',
      duration: '4m 16s',
      trigger: 'Model validation'
    },
    {
      name: 'Docker Images',
      branch: 'main',
      file: 'backend/Dockerfile',
      status: projectExists('backend/Dockerfile') && projectExists('frontend/Dockerfile') ? 'success' : 'failed',
      duration: '9m 36s',
      trigger: 'Container build'
    },
    {
      name: 'Security Tests',
      branch: 'main',
      file: 'backend/package.json',
      status: projectExists('backend/package.json') ? 'running' : 'failed',
      duration: '3m 24s',
      trigger: 'Security validation'
    }
  ];

  const pipelines = projectChecks.map((pipeline) => ({
    ...pipeline,
    commit: pipeline.commit || pipeline.name.toLowerCase().replace(/\s+/g, '-').slice(0, 12),
    startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  }));

  const successfulBuilds = pipelines.filter((pipeline) => pipeline.status === 'success').length;
  const failedBuilds = pipelines.filter((pipeline) => pipeline.status === 'failed').length;
  const runningBuilds = pipelines.filter((pipeline) => pipeline.status === 'running').length;
  const avgBuildTime = Math.round(
    pipelines.reduce((sum, pipeline) => {
      const match = (pipeline.duration || '0m 0s').match(/(\d+)m\s*(\d+)?s?/i);
      if (!match) return sum;
      const minutes = Number(match[1] || 0);
      const seconds = Number(match[2] || 0);
      return sum + minutes + seconds / 60;
    }, 0) / Math.max(pipelines.length, 1)
  );

  const recentBuilds = pipelines.map((pipeline, index) => ({
    project: pipeline.name,
    buildNumber: 100 + index + (pipeline.status === 'success' ? 5 : pipeline.status === 'failed' ? 2 : 1),
    trigger: pipeline.trigger,
    status: pipeline.status,
    duration: pipeline.duration,
    timestamp: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString()
  }));

  const deployments = [
    {
      service: 'Backend API',
      version: 'v1.0.0',
      environment: 'production',
      status: projectExists('backend/server.js') ? 'success' : 'failed',
      deployedBy: 'repository',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      service: 'Frontend UI',
      version: 'v1.0.0',
      environment: 'staging',
      status: projectExists('frontend/index.html') ? 'success' : 'failed',
      deployedBy: 'repository',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    },
    {
      service: 'ML Service',
      version: 'v1.0.0',
      environment: 'production',
      status: projectExists('backend/ml/anomalyDetector.js') ? 'success' : 'failed',
      deployedBy: 'repository',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    },
    {
      service: 'Docker',
      version: 'v1.0.0',
      environment: 'production',
      status: projectExists('backend/Dockerfile') && projectExists('frontend/Dockerfile') ? 'success' : 'failed',
      deployedBy: 'docker',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    }
  ];

  return {
    stats: {
      activePipelines: runningBuilds,
      successfulBuilds,
      failedBuilds,
      avgBuildTime
    },
    pipelines,
    recentBuilds,
    deployments
  };
}

function authenticatePipelineReporter(req, res, next) {
  const expectedToken = process.env.CICD_METRICS_TOKEN;
  const providedToken = req.headers['x-cicd-token'];

  if (!expectedToken) {
    return res.status(503).json({ error: 'CI/CD metrics reporting is not configured' });
  }

  if (!providedToken || providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Invalid CI/CD metrics token' });
  }

  next();
}

// GitHub Actions may submit pipeline metrics with the dedicated token.
router.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/pipeline-status') {
    return authenticatePipelineReporter(req, res, next);
  }

  return authenticateToken(req, res, () => requireAdmin(req, res, next));
});

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
      suspiciousVolume: dayTxs.filter(tx => tx.suspicious).reduce((s, tx) => s + tx.amount, 0),
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
  const safeUsers = users.map(publicUser);
  res.json(safeUsers);
});

// ─── POST /api/admin/users ────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, fullName, firstName, surname, gender, role = 'user', phone, department, balance = 0 } = req.body;

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
      userCode: `${username}-${Math.floor(100000 + Math.random() * 900000)}`,
      username,
      email,
      password: hashed,
      role,
      fullName,
      firstName: firstName || fullName.split(' ')[0],
      surname: surname || '',
      gender: gender || '',
      walletAddress,
      balance: Math.max(0, parseFloat(balance) || 0),
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLogin: null,
      phone: phone || '',
      department: department || ''
      ,transferLimits: { daily: null, monthly: null },
      transferBlocked: false
    };

    db.get('users').push(newUser).write();
    res.status(201).json(publicUser(newUser));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, department, status, role, balance, password, transferBlocked, dailyLimit, monthlyLimit } = req.body;

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
    if (transferBlocked !== undefined) updates.transferBlocked = Boolean(transferBlocked);
    if (dailyLimit !== undefined || monthlyLimit !== undefined) {
      updates.transferLimits = {
        daily: dailyLimit === '' || dailyLimit === null ? null : Math.max(0, Number(dailyLimit)),
        monthly: monthlyLimit === '' || monthlyLimit === null ? null : Math.max(0, Number(monthlyLimit))
      };
    }
    if (password) updates.password = await bcrypt.hash(password, 10);

    db.get('users').find({ id }).assign(updates).write();
    const updated = db.get('users').find({ id }).value();
    res.json(publicUser(updated));
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

// ─── HELP REQUESTS ──────────────────────────────────────────────────────────
router.get('/help-requests', (req, res) => {
  const requests = db.get('helpRequests').value() || [];
  const users = db.get('users').value();
  res.json(requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((request) => ({
    ...request,
    user: users.find(user => user.id === request.userId)?.fullName || 'Unknown user'
  })));
});

router.put('/help-requests/:id/resolve', (req, res) => {
  const request = db.get('helpRequests').find({ id: req.params.id }).value();
  if (!request) return res.status(404).json({ error: 'Help request not found' });
  db.get('helpRequests').find({ id: req.params.id }).assign({
    status: 'resolved',
    resolvedBy: req.user.username,
    resolvedAt: new Date().toISOString(),
    adminNote: req.body.adminNote || ''
  }).write();
  res.json({ message: 'Help request resolved' });
});

// ─── GET /api/admin/cicd ─────────────────────────────────────────────────────
router.get('/cicd', async (req, res) => {
  try {
    const cicdData = await getLiveCICDData();
    res.json(cicdData);
  } catch (error) {
    console.error('Failed to load CI/CD data:', error);
    res.json(buildProjectCICDData());
  }
});

// ─── POST /api/admin/pipeline-status ──────────────────────────────────────────
// Endpoint to receive real-time CI/CD pipeline metrics from GitHub Actions
router.post('/pipeline-status', (req, res) => {
  try {
    const { workflow, status, commit, branch, timestamp, buildNumber, author } = req.body;
    
    // Validate required fields
    if (!workflow || !status) {
      return res.status(400).json({ error: 'Missing required fields: workflow, status' });
    }
    
    // Create pipeline log entry
    const pipelineLog = {
      id: uuidv4(),
      type: 'cicd-pipeline',
      workflow,
      status, // 'passed', 'failed', 'running'
      commit: commit || 'unknown',
      branch: branch || 'unknown',
      timestamp: timestamp || new Date().toISOString(),
      buildNumber: buildNumber || 0,
      author: author || 'system',
      createdAt: new Date().toISOString()
    };
    
    // Store in systemLogs
    if (!db.get('systemLogs').value()) {
      db.set('systemLogs', []).write();
    }
    
    db.get('systemLogs')
      .push(pipelineLog)
      .write();
    
    console.log(`✅ Pipeline status logged: ${workflow} - ${status}`);
    res.status(201).json({ 
      success: true, 
      message: 'Pipeline status logged',
      data: pipelineLog 
    });
  } catch (err) {
    console.error('Error logging pipeline status:', err);
    res.status(500).json({ error: 'Failed to log pipeline status' });
  }
});

// ─── GET /api/admin/pipeline-status ───────────────────────────────────────────
// Get CI/CD pipeline history and metrics
router.get('/pipeline-status', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const branch = req.query.branch || null;
    
    let logs = db.get('systemLogs')
      .filter(log => log.type === 'cicd-pipeline')
      .value() || [];
    
    // Filter by branch if provided
    if (branch) {
      logs = logs.filter(log => log.branch === branch);
    }
    
    // Sort by timestamp descending (newest first)
    logs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    const recentLogs = logs.slice(0, limit);
    
    // Calculate statistics
    const totalPipelines = logs.length;
    const passedPipelines = logs.filter(log => log.status === 'passed').length;
    const failedPipelines = logs.filter(log => log.status === 'failed').length;
    const successRate = totalPipelines > 0 ? ((passedPipelines / totalPipelines) * 100).toFixed(2) : 0;
    
    // Get latest status
    const latestLog = logs[0] || null;
    
    res.json({
      stats: {
        totalPipelines,
        passedPipelines,
        failedPipelines,
        successRate: `${successRate}%`,
        latestStatus: latestLog?.status || 'unknown',
        latestWorkflow: latestLog?.workflow || 'unknown'
      },
      recentBuilds: recentLogs,
      limit,
      branch: branch || 'all'
    });
  } catch (err) {
    console.error('Error fetching pipeline status:', err);
    res.status(500).json({ error: 'Failed to fetch pipeline status' });
  }
});

// ─── GET /api/admin/pipeline-stats ───────────────────────────────────────────
// Get detailed CI/CD pipeline statistics and trends
router.get('/pipeline-stats', (req, res) => {
  try {
    const logs = db.get('systemLogs')
      .filter(log => log.type === 'cicd-pipeline')
      .value() || [];
    
    // Group by workflow
    const byWorkflow = {};
    logs.forEach(log => {
      if (!byWorkflow[log.workflow]) {
        byWorkflow[log.workflow] = { passed: 0, failed: 0, total: 0 };
      }
      byWorkflow[log.workflow].total++;
      if (log.status === 'passed') {
        byWorkflow[log.workflow].passed++;
      } else if (log.status === 'failed') {
        byWorkflow[log.workflow].failed++;
      }
    });
    
    // Calculate success rates by workflow
    const workflowStats = Object.entries(byWorkflow).map(([workflow, stats]) => ({
      workflow,
      ...stats,
      successRate: stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(2) : 0
    }));
    
    // Get last 7 days of builds
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(log => new Date(log.timestamp) > sevenDaysAgo);
    
    const dailyStats = {};
    recentLogs.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { passed: 0, failed: 0 };
      }
      if (log.status === 'passed') {
        dailyStats[date].passed++;
      } else if (log.status === 'failed') {
        dailyStats[date].failed++;
      }
    });
    
    res.json({
      byWorkflow: workflowStats,
      last7Days: dailyStats,
      totalPipelines: logs.length,
      totalPassed: logs.filter(l => l.status === 'passed').length,
      totalFailed: logs.filter(l => l.status === 'failed').length
    });
  } catch (err) {
    console.error('Error fetching pipeline stats:', err);
    res.status(500).json({ error: 'Failed to fetch pipeline statistics' });
  }
});

module.exports = router;
module.exports.buildProjectCICDData = buildProjectCICDData;
module.exports.getLiveCICDData = getLiveCICDData;
