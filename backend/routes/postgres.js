const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const database = require('../utils/database');
const { generateToken } = require('../middleware/auth');
const { analyzeTransaction } = require('../ml/anomalyDetector');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../utils/realtime');
const { sendNativeTransfer } = require('../utils/blockchain');

const router = express.Router();

async function requireUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'blockchain-monitor-secret-key-change-in-production');
    const result = await database.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
    if (result.rows[0].status !== 'active') return res.status(403).json({ error: 'Account is suspended' });
    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function safeUser(user) {
  return {
    id: user.id, userCode: user.user_code, username: user.username, email: user.email, fullName: user.full_name,
    role: user.role, walletAddress: user.wallet_address, balance: Number(user.balance), phone: user.phone,
    department: user.department, firstName: user.first_name || '', surname: user.surname || '', gender: user.gender || '', status: user.status, createdAt: user.created_at, lastLogin: user.last_login,
    transferBlocked: user.transfer_blocked, transferLimits: { daily: user.daily_limit === null ? null : Number(user.daily_limit), monthly: user.monthly_limit === null ? null : Number(user.monthly_limit) }
  };
}

function safeTransaction(row) {
  return { ...row, amount: Number(row.amount), fee: Number(row.fee), suspicionScore: Number(row.suspicion_score || 0),
    txHash: row.tx_hash, fromUserId: row.from_user_id, toUserId: row.to_user_id, fromAddress: row.from_address,
    toAddress: row.to_address, blockNumber: row.block_number, timestamp: row.timestamp, suspicionReasons: row.suspicion_reasons || [],
    transactionType: row.transaction_type || 'transfer' };
}

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const result = await database.query('SELECT * FROM users WHERE username = $1 OR email = $1 OR user_code = $1', [username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account is suspended. Contact admin.' });
  await database.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  await recordAudit({ actor: user, action: 'auth.login', entityType: 'user', entityId: user.id, req });
  res.json({ token: generateToken({ id: user.id, username: user.username, role: user.role }), user: safeUser(user) });
});

router.get('/auth/me', requireUser, (req, res) => res.json(safeUser(req.user)));

router.post('/auth/change-password', requireUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Valid current and new passwords are required' });
  if (!(await bcrypt.compare(currentPassword, req.user.password))) return res.status(401).json({ error: 'Current password is incorrect' });
  await database.query('UPDATE users SET password=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 10), req.user.id]);
  await recordAudit({ actor: req.user, action: 'auth.password.change', entityType: 'user', entityId: req.user.id, req });
  res.json({ message: 'Password changed successfully' });
});

router.put('/users/profile', requireUser, async (req, res) => {
  const { fullName, phone, department } = req.body;
  const result = await database.query('UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), department = COALESCE($3, department) WHERE id = $4 RETURNING *', [fullName, phone, department, req.user.id]);
  await recordAudit({ actor: req.user, action: 'user.profile.update', entityType: 'user', entityId: req.user.id, req });
  res.json(safeUser(result.rows[0]));
});

router.get('/users/search/:query', requireUser, async (req, res) => {
  const q = `%${req.params.query.toLowerCase()}%`;
  const result = await database.query(`SELECT id,user_code,username,full_name,phone,wallet_address FROM users
    WHERE id <> $1 AND role = 'user' AND status = 'active' AND (LOWER(user_code) LIKE $2 OR LOWER(username) LIKE $2 OR LOWER(full_name) LIKE $2 OR LOWER(phone) LIKE $2 OR LOWER(wallet_address) LIKE $2) LIMIT 10`, [req.user.id, q]);
  res.json(result.rows.map(user => ({ id: user.id, userCode: user.user_code, username: user.username, fullName: user.full_name, phone: user.phone, walletAddress: user.wallet_address })));
});

router.get('/admin/users', requireUser, requireAdmin, async (req, res) => {
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
  const result = await database.query(`SELECT * FROM users WHERE ($1::text IS NULL OR LOWER(username) LIKE $1 OR LOWER(full_name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(user_code) LIKE $1) ORDER BY created_at DESC`, [search]);
  res.json(result.rows.map(safeUser));
});

router.post('/admin/users', requireUser, requireAdmin, async (req, res) => {
  const { username, email, password, fullName, firstName, surname, gender, role = 'user', phone = '', department = '', balance = 0 } = req.body;
  if (!username || !email || !password || !fullName) return res.status(400).json({ error: 'Required fields missing' });
  const id = `user-${uuidv4().slice(0,8)}`;
  const userCode = `${username}-${Math.floor(100000 + Math.random() * 900000)}`;
  const walletAddress = '0x' + uuidv4().replace(/-/g, '').padEnd(40, '0').slice(0, 40);
  const hashed = await bcrypt.hash(password, 10);
  try {
    const result = await database.query(`INSERT INTO users (id,username,email,password,role,full_name,first_name,surname,gender,wallet_address,user_code,balance,phone,department)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [id, username, email, hashed, role, fullName, firstName || fullName.split(' ')[0], surname || '', gender || '', walletAddress, userCode, Math.max(0, Number(balance) || 0), phone, department]);
    await recordAudit({ actor: req.user, action: 'user.create', entityType: 'user', entityId: id, metadata: { username, role }, req });
    res.status(201).json(safeUser(result.rows[0]));
  } catch (error) { res.status(409).json({ error: 'Username or email already exists' }); }
});

router.put('/admin/users/:id', requireUser, requireAdmin, async (req, res) => {
  const { fullName, email, phone, department, status, role, balance, password, transferBlocked, dailyLimit, monthlyLimit } = req.body;
  const values = [fullName, email, phone, department, status, role, balance === undefined ? null : Number(balance), transferBlocked, dailyLimit === '' ? null : dailyLimit, monthlyLimit === '' ? null : monthlyLimit, req.params.id];
  const result = await database.query(`UPDATE users SET full_name=COALESCE($1,full_name),email=COALESCE($2,email),phone=COALESCE($3,phone),department=COALESCE($4,department),status=COALESCE($5,status),role=COALESCE($6,role),balance=COALESCE($7,balance),transfer_blocked=COALESCE($8,transfer_blocked),daily_limit=$9,monthly_limit=$10 WHERE id=$11 RETURNING *`, values);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  if (password) await database.query('UPDATE users SET password=$1 WHERE id=$2', [await bcrypt.hash(password, 10), req.params.id]);
  await recordAudit({ actor: req.user, action: 'user.update', entityType: 'user', entityId: req.params.id, metadata: { transferBlocked, dailyLimit, monthlyLimit }, req });
  res.json(safeUser(result.rows[0]));
});

router.delete('/admin/users/:id', requireUser, requireAdmin, async (req, res) => {
  if (req.params.id === 'admin-001') return res.status(403).json({ error: 'Cannot delete the primary admin account' });
  await database.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  await recordAudit({ actor: req.user, action: 'user.delete', entityType: 'user', entityId: req.params.id, req });
  res.json({ message: 'User deleted successfully' });
});

router.get('/admin/audit-logs', requireUser, requireAdmin, async (req, res) => {
  const result = await database.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [Math.min(Number(req.query.limit) || 100, 500)]);
  res.json(result.rows);
});

router.get('/admin/watched-addresses', requireUser, requireAdmin, async (req, res) => {
  const result = await database.query('SELECT * FROM watched_addresses ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post('/admin/watched-addresses', requireUser, requireAdmin, async (req, res) => {
  const { address, label = '', riskLevel = 'high', reason = '' } = req.body;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || '')) return res.status(400).json({ error: 'Valid blockchain address required' });
  const result = await database.query('INSERT INTO watched_addresses (address,label,risk_level,reason,created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (address) DO UPDATE SET label=$2,risk_level=$3,reason=$4 RETURNING *', [address.toLowerCase(), label, riskLevel, reason, req.user.username]);
  await recordAudit({ actor: req.user, action: 'address.watch', entityType: 'watched_address', entityId: address.toLowerCase(), req });
  res.status(201).json(result.rows[0]);
});

router.delete('/admin/watched-addresses/:address', requireUser, requireAdmin, async (req, res) => {
  await database.query('DELETE FROM watched_addresses WHERE address=$1', [req.params.address.toLowerCase()]);
  res.json({ message: 'Address removed from watchlist' });
});

router.get('/admin/overview', requireUser, requireAdmin, async (req, res) => {
  const [users, txs, alerts, recentAlerts, recentTransactions] = await Promise.all([
    database.query(`SELECT COUNT(*) FILTER (WHERE role='user')::int AS total, COUNT(*) FILTER (WHERE role='user' AND status='active')::int AS active FROM users`),
    database.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount),0) AS volume,
      COUNT(*) FILTER (WHERE suspicious)::int AS suspicious,
      COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
      COUNT(*) FILTER (WHERE status='flagged')::int AS flagged FROM transactions`),
    database.query('SELECT COUNT(*) FILTER (WHERE NOT resolved)::int AS unresolved FROM alerts'),
    database.query(`SELECT a.*, u.username, u.full_name AS "userName", t.amount AS "transactionAmount", t.suspicion_score AS "suspicionScore"
      FROM alerts a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN transactions t ON t.id=a.transaction_id
      WHERE NOT a.resolved ORDER BY a.timestamp DESC LIMIT 5`),
    database.query(`SELECT t.*, fu.username AS "fromUsername", fu.full_name AS "fromName", tu.username AS "toUsername", tu.full_name AS "toName"
      FROM transactions t JOIN users fu ON fu.id=t.from_user_id JOIN users tu ON tu.id=t.to_user_id ORDER BY t.timestamp DESC LIMIT 5`)
  ]);
  const chartResult = await database.query(`SELECT TO_CHAR(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
    COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS volume, COALESCE(SUM(amount) FILTER (WHERE suspicious),0) AS "suspiciousVolume", COUNT(*) FILTER (WHERE suspicious)::int AS suspicious
    FROM transactions WHERE timestamp >= NOW() - INTERVAL '7 days' GROUP BY 1 ORDER BY 1`);
  res.json({
    stats: { totalUsers: users.rows[0].total, activeUsers: users.rows[0].active, totalTransactions: txs.rows[0].total,
      totalVolume: Number(txs.rows[0].volume), suspiciousTransactions: txs.rows[0].suspicious,
      confirmedTxs: txs.rows[0].confirmed, flaggedTxs: txs.rows[0].flagged, unresolvedAlerts: alerts.rows[0].unresolved },
    chartData: chartResult.rows.map(row => ({ ...row, volume: Number(row.volume), suspiciousVolume: Number(row.suspiciousVolume) })),
    recentAlerts: recentAlerts.rows,
    recentTransactions: recentTransactions.rows.map(safeTransaction)
  });
});

router.post('/admin/pipeline-status', async (req, res) => {
  const { workflow, status, commit, branch, timestamp, buildNumber, author } = req.body;
  if (!workflow || !status) return res.status(400).json({ error: 'Missing required fields' });
  const log = { workflow, status, commit, branch, timestamp, buildNumber, author };
  await database.query('INSERT INTO system_logs (id,type,workflow,status,branch,commit_hash,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), 'cicd-pipeline', workflow, status, branch || 'unknown', commit || 'unknown', log]);
  if (status === 'failed') notify('cicd:pipeline-failed', log);
  res.status(201).json({ success: true, data: log });
});

router.get('/admin/pipeline-status', requireUser, requireAdmin, async (req, res) => {
  const result = await database.query('SELECT workflow,status,branch,commit_hash AS commit,payload,created_at AS timestamp FROM system_logs WHERE type=$1 ORDER BY created_at DESC LIMIT 50', ['cicd-pipeline']);
  const logs = result.rows.map(row => ({ ...row, ...(row.payload || {}) }));
  res.json({ stats: { totalPipelines: logs.length, passedPipelines: logs.filter(row => row.status === 'passed').length, failedPipelines: logs.filter(row => row.status === 'failed').length, successRate: `${logs.length ? ((logs.filter(row => row.status === 'passed').length / logs.length) * 100).toFixed(2) : 0}%` }, recentBuilds: logs });
});

router.get('/transactions/my', requireUser, async (req, res) => {
  const result = await database.query(`SELECT t.*, fu.username AS "fromUsername", fu.full_name AS "fromName", tu.username AS "toUsername", tu.full_name AS "toName"
    FROM transactions t JOIN users fu ON fu.id=t.from_user_id JOIN users tu ON tu.id=t.to_user_id
    WHERE t.from_user_id=$1 OR t.to_user_id=$1 ORDER BY t.timestamp DESC`, [req.user.id]);
  res.json({ transactions: result.rows.map(safeTransaction), total: result.rows.length, page: 1, pages: 1 });
});

router.get('/transactions/all', requireUser, requireAdmin, async (req, res) => {
  const suspicious = req.query.suspicious === 'true';
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;
  const status = req.query.status || null;
  const transactionType = req.query.transactionType || null;
  const userId = req.query.userId || null;
  const result = await database.query(`SELECT t.*, fu.username AS "fromUsername", fu.full_name AS "fromName", tu.username AS "toUsername", tu.full_name AS "toName"
    FROM transactions t JOIN users fu ON fu.id=t.from_user_id JOIN users tu ON tu.id=t.to_user_id
    WHERE ($1::boolean = FALSE OR t.suspicious = TRUE)
      AND ($2::text IS NULL OR t.status=$2)
      AND ($3::text IS NULL OR t.from_user_id=$3 OR t.to_user_id=$3)
      AND ($4::text IS NULL OR LOWER(fu.username) LIKE $4 OR LOWER(fu.full_name) LIKE $4 OR LOWER(tu.username) LIKE $4 OR LOWER(tu.full_name) LIKE $4 OR t.amount::text LIKE $4)
      AND ($5::text IS NULL OR t.transaction_type=$5)
    ORDER BY t.timestamp DESC`, [suspicious, status, userId, search, transactionType]);
  res.json({ transactions: result.rows.map(safeTransaction), total: result.rows.length, page: 1, pages: 1 });
});

router.post('/transactions/admin-transfer', requireUser, requireAdmin, async (req, res) => {
  const { fromUsername, toUsername, amount, note } = req.body;
  const numericAmount = Number(amount);
  if (!fromUsername || !toUsername || !Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Sender, recipient and valid amount are required' });
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    const senderResult = await client.query('SELECT * FROM users WHERE username=$1 OR user_code=$1 FOR UPDATE', [fromUsername]);
    const recipientResult = await client.query('SELECT * FROM users WHERE username=$1 OR user_code=$1 FOR UPDATE', [toUsername]);
    const sender = senderResult.rows[0]; const recipient = recipientResult.rows[0];
    if (!sender || !recipient) { await client.query('ROLLBACK'); return res.status(404).json({ error: !sender ? 'Sender not found' : 'Recipient not found' }); }
    if (sender.id === recipient.id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot transfer to yourself' }); }
    const fee = Number((numericAmount * 0.001).toFixed(4));
    if (sender.transfer_blocked || recipient.transfer_blocked) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Transfers are blocked for this account or recipient' }); }
    if (Number(sender.balance) < numericAmount + fee) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance including fee' }); }
    const analysis = analyzeTransaction({ fromUserId: sender.id, toUserId: recipient.id, amount: numericAmount, timestamp: new Date().toISOString() });
    const id = `tx-${uuidv4().slice(0, 8)}`;
    const inserted = await client.query(`INSERT INTO transactions (id,tx_hash,from_user_id,to_user_id,from_address,to_address,amount,fee,status,note,suspicion_score,suspicious,suspicion_reasons,severity,chain)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'internal') RETURNING *`, [id, `internal-${uuidv4()}`, sender.id, recipient.id, sender.wallet_address, recipient.wallet_address, numericAmount, fee, analysis.suspicious ? 'flagged' : 'confirmed', `[ADMIN] ${note || 'Administrative transfer'}`, analysis.suspicionScore, analysis.suspicious, JSON.stringify(analysis.suspicionReasons), analysis.severity]);
    await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2', [numericAmount + fee, sender.id]);
    await client.query('UPDATE users SET balance=balance+$1 WHERE id=$2', [numericAmount, recipient.id]);
    if (analysis.suspicious) await client.query('INSERT INTO alerts (id,type,severity,transaction_id,user_id,message) VALUES ($1,$2,$3,$4,$5,$6)', [`alert-${uuidv4().slice(0,8)}`, 'suspicious_transaction', analysis.severity, id, sender.id, `Suspicious admin transfer: ${analysis.suspicionReasons.join(', ')}`]);
    await client.query('COMMIT');
    res.json({ success: true, transaction: safeTransaction(inserted.rows[0]), warning: analysis.suspicious ? 'Transfer flagged for review' : null });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: error.message || 'Transfer failed' }); }
  finally { client.release(); }
});

router.post('/transactions/admin-wallet-operation', requireUser, requireAdmin, async (req, res) => {
  const { username, amount, operation, note } = req.body;
  const numericAmount = Number(amount);
  if (!username || !Number.isFinite(numericAmount) || numericAmount <= 0 || !['deposit', 'withdrawal'].includes(operation)) return res.status(400).json({ error: 'User, valid amount and operation are required' });
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT * FROM users WHERE username=$1 OR user_code=$1 FOR UPDATE', [username]);
    const user = userResult.rows[0];
    if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'User not found' }); }
    if (operation === 'withdrawal' && Number(user.balance) < numericAmount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
    const analysis = analyzeTransaction({ fromUserId: user.id, toUserId: user.id, amount: numericAmount, timestamp: new Date().toISOString() });
    const id = `tx-${uuidv4().slice(0, 8)}`;
    const type = operation === 'deposit' ? 'deposit' : 'withdrawal';
    const inserted = await client.query(`INSERT INTO transactions (id,tx_hash,from_user_id,to_user_id,from_address,to_address,amount,fee,status,note,suspicion_score,suspicious,suspicion_reasons,severity,chain,transaction_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,'internal',$14) RETURNING *`, [id, `internal-${uuidv4()}`, user.id, user.id, user.wallet_address, user.wallet_address, numericAmount, analysis.suspicious ? 'flagged' : 'confirmed', `[ADMIN ${type.toUpperCase()}] ${note || ''}`.trim(), analysis.suspicionScore, analysis.suspicious, JSON.stringify(analysis.suspicionReasons), analysis.severity, type]);
    const delta = operation === 'deposit' ? numericAmount : -numericAmount;
    await client.query('UPDATE users SET balance=balance+$1 WHERE id=$2', [delta, user.id]);
    if (analysis.suspicious) await client.query('INSERT INTO alerts (id,type,severity,transaction_id,user_id,message) VALUES ($1,$2,$3,$4,$5,$6)', [`alert-${uuidv4().slice(0,8)}`, `${type}_review`, analysis.severity, id, user.id, `Suspicious ${type} detected: ${analysis.suspicionReasons.join(', ')}`]);
    await client.query('COMMIT');
    const balance = await database.query('SELECT balance FROM users WHERE id=$1', [user.id]);
    res.json({ success: true, transaction: safeTransaction(inserted.rows[0]), newBalance: Number(balance.rows[0].balance), warning: analysis.suspicious ? `${type} flagged for review` : null });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: error.message || 'Wallet operation failed' }); }
  finally { client.release(); }
});

router.post('/transactions/transfer', requireUser, async (req, res) => {
  const { toUsername, amount, note } = req.body;
  const numericAmount = Number(amount);
  if (!toUsername || !Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Recipient and valid amount are required' });
  const client = await database.getPool().connect();
  try {
    await client.query('BEGIN');
    const senderResult = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const recipientResult = await client.query('SELECT * FROM users WHERE username=$1 OR user_code=$1 OR email=$1 OR wallet_address=$1 FOR UPDATE', [toUsername]);
    const sender = senderResult.rows[0]; const recipient = recipientResult.rows[0];
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
    if (sender.id === recipient.id) return res.status(400).json({ error: 'Cannot transfer to yourself' });
    if (sender.transfer_blocked || recipient.transfer_blocked) return res.status(403).json({ error: 'Transfers are blocked for this account or recipient' });
    const fee = Number((numericAmount * 0.001).toFixed(4));
    if (Number(sender.balance) < numericAmount + fee) return res.status(400).json({ error: 'Insufficient balance including fee' });
    const analysis = analyzeTransaction({ fromUserId: sender.id, toUserId: recipient.id, amount: numericAmount, timestamp: new Date().toISOString() });
    const addressResult = await client.query('SELECT * FROM watched_addresses WHERE address=$1', [recipient.wallet_address.toLowerCase()]);
    const watchedAddress = addressResult.rows[0] || null;
    const recentResult = await client.query('SELECT COUNT(*)::int AS count FROM transactions WHERE from_user_id=$1 AND timestamp >= NOW() - INTERVAL \'1 hour\'', [sender.id]);
    const velocityRisk = recentResult.rows[0].count >= 5;
    const addressRisk = watchedAddress ? (watchedAddress.risk_level === 'critical' ? 1 : watchedAddress.risk_level === 'high' ? 0.8 : 0.5) : 0;
    const suspicionReasons = [...analysis.suspicionReasons];
    if (watchedAddress) suspicionReasons.push(`Watched ${watchedAddress.risk_level}-risk address: ${watchedAddress.reason || watchedAddress.label}`);
    if (velocityRisk && !suspicionReasons.includes('Velocity spike (too many transactions in 1 hour)')) suspicionReasons.push('Velocity spike (too many transactions in 1 hour)');
    const suspicionScore = Math.min(1, Math.max(analysis.suspicionScore, addressRisk, velocityRisk ? 0.6 : 0));
    const suspicious = suspicionScore >= 0.5;
    const severity = suspicionScore >= 0.8 ? 'critical' : suspicionScore >= 0.5 ? 'high' : suspicionScore >= 0.3 ? 'medium' : 'low';
    const id = `tx-${uuidv4().slice(0, 8)}`;
    let txHash = `internal-${uuidv4()}`; let chain = 'internal'; let blockNumber = null;
    if (process.env.BLOCKCHAIN_MODE === 'custodial') {
      const chainTx = await sendNativeTransfer({ privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY, toAddress: recipient.wallet_address, amount: numericAmount });
      txHash = chainTx.hash; chain = 'testnet';
      const receipt = await chainTx.wait(); blockNumber = receipt?.blockNumber || null;
    }
    const inserted = await client.query(`INSERT INTO transactions (id,tx_hash,from_user_id,to_user_id,from_address,to_address,amount,fee,status,block_number,note,suspicion_score,suspicious,suspicion_reasons,severity,chain,address_risk)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`, [id, txHash, sender.id, recipient.id, sender.wallet_address, recipient.wallet_address, numericAmount, fee, suspicious ? 'flagged' : 'confirmed', blockNumber, note || '', suspicionScore, suspicious, JSON.stringify(suspicionReasons), severity, chain, JSON.stringify({ watched: Boolean(watchedAddress), level: watchedAddress?.risk_level || 'none' })]);
    await client.query('UPDATE users SET balance=balance-$1 WHERE id=$2', [numericAmount + fee, sender.id]);
    await client.query('UPDATE users SET balance=balance+$1 WHERE id=$2', [numericAmount, recipient.id]);
    if (suspicious) {
      await client.query('INSERT INTO alerts (id,type,severity,transaction_id,user_id,message) VALUES ($1,$2,$3,$4,$5,$6)', [`alert-${uuidv4().slice(0,8)}`, 'suspicious_transaction', severity, id, sender.id, `Suspicious transaction detected: ${suspicionReasons.join(', ')}`]);
      notify('security:high-risk-transaction', { transaction: safeTransaction(inserted.rows[0]) });
    }
    await client.query('COMMIT');
    await recordAudit({ actor: sender, action: 'transaction.transfer', entityType: 'transaction', entityId: id, metadata: { amount: numericAmount, chain, txHash }, req });
    const balance = await database.query('SELECT balance FROM users WHERE id=$1', [sender.id]);
    res.json({ success: true, transaction: safeTransaction(inserted.rows[0]), newBalance: Number(balance.rows[0].balance), warning: suspicious ? `Transfer flagged: ${suspicionReasons.join(', ')}` : null });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message || 'Transfer failed' });
  } finally { client.release(); }
});

router.get('/alerts', requireUser, requireAdmin, async (req, res) => {
  const resolvedFilter = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : null;
  const result = await database.query(`SELECT a.*, u.username, u.full_name AS "userName", t.amount AS "transactionAmount", t.suspicion_score AS "suspicionScore" FROM alerts a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN transactions t ON t.id=a.transaction_id WHERE ($1::boolean IS NULL OR a.resolved = $1) ORDER BY a.timestamp DESC`, [resolvedFilter]);
  res.json(result.rows);
});

router.put('/alerts/:id/resolve', requireUser, requireAdmin, async (req, res) => {
  await database.query('UPDATE alerts SET resolved=true,resolved_by=$1,resolved_at=NOW() WHERE id=$2', [req.user.username, req.params.id]);
  await recordAudit({ actor: req.user, action: 'alert.resolve', entityType: 'alert', entityId: req.params.id, req });
  res.json({ message: 'Alert resolved' });
});

router.post('/help', requireUser, async (req, res) => {
  const { category, message } = req.body; const id = `help-${uuidv4().slice(0,8)}`;
  await database.query('INSERT INTO help_requests (id,user_id,category,message) VALUES ($1,$2,$3,$4)', [id, req.user.id, category, message]);
  await recordAudit({ actor: req.user, action: 'help.create', entityType: 'help_request', entityId: id, req });
  notify('support:new-request', { id, category, user: req.user.username });
  res.status(201).json({ id, category, message, status: 'open' });
});

router.get('/help/my', requireUser, async (req, res) => {
  const result = await database.query('SELECT id,category,message,status,created_at AS "createdAt",admin_note AS "adminNote" FROM help_requests WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(result.rows);
});

router.get('/admin/help-requests', requireUser, requireAdmin, async (req, res) => {
  const result = await database.query('SELECT h.*,u.full_name AS user FROM help_requests h JOIN users u ON u.id=h.user_id ORDER BY h.created_at DESC');
  res.json(result.rows.map(row => ({ ...row, createdAt: row.created_at })));
});

router.put('/admin/help-requests/:id/resolve', requireUser, requireAdmin, async (req, res) => {
  await database.query('UPDATE help_requests SET status=\'resolved\',resolved_by=$1,resolved_at=NOW(),admin_note=$2 WHERE id=$3', [req.user.username, req.body.adminNote || '', req.params.id]);
  await recordAudit({ actor: req.user, action: 'help.resolve', entityType: 'help_request', entityId: req.params.id, req });
  res.json({ message: 'Help request resolved' });
});

module.exports = router;