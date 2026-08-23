const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false })
  : null;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', full_name TEXT NOT NULL,
  wallet_address TEXT UNIQUE NOT NULL, user_code TEXT UNIQUE, balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login TIMESTAMPTZ,
  phone TEXT DEFAULT '', department TEXT DEFAULT '', transfer_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  daily_limit NUMERIC(18,4), monthly_limit NUMERIC(18,4), risk_score NUMERIC(5,4) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, tx_hash TEXT NOT NULL, from_user_id TEXT NOT NULL REFERENCES users(id),
  to_user_id TEXT NOT NULL REFERENCES users(id), from_address TEXT NOT NULL, to_address TEXT NOT NULL,
  amount NUMERIC(18,4) NOT NULL, fee NUMERIC(18,4) NOT NULL DEFAULT 0, status TEXT NOT NULL,
  block_number BIGINT, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), note TEXT DEFAULT '',
  suspicion_score NUMERIC(5,4) DEFAULT 0, suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  suspicion_reasons JSONB NOT NULL DEFAULT '[]', severity TEXT DEFAULT 'low', chain TEXT DEFAULT 'internal',
  transaction_type TEXT NOT NULL DEFAULT 'transfer',
  address_risk JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, severity TEXT NOT NULL, transaction_id TEXT REFERENCES transactions(id),
  user_id TEXT REFERENCES users(id), message TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE, resolved_by TEXT, resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_by TEXT,
  resolved_at TIMESTAMPTZ, admin_note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_id TEXT, actor_username TEXT, action TEXT NOT NULL, entity_type TEXT,
  entity_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, ip_address TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, workflow TEXT, status TEXT, branch TEXT, commit_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS watched_addresses (
  address TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '', risk_level TEXT NOT NULL DEFAULT 'medium',
  reason TEXT DEFAULT '', created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_sender_time_idx ON transactions(from_user_id, timestamp);
CREATE INDEX IF NOT EXISTS transactions_recipient_time_idx ON transactions(to_user_id, timestamp);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS help_requests_status_idx ON help_requests(status, created_at DESC);
`;

async function initializeDatabase() {
  if (!pool) return false;
  await pool.query(schema);
  await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'transfer'");
  await seedUsersFromJson();
  return true;
}

async function seedUsersFromJson() {
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (count.rows[0].count > 0) return;
  const file = path.join(__dirname, '../db.json');
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const user of data.users || []) {
    await pool.query(`INSERT INTO users
      (id, username, email, password, role, full_name, wallet_address, user_code, balance, status, created_at, last_login, phone, department, transfer_blocked, daily_limit, monthly_limit)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO NOTHING`, [user.id, user.username, user.email, user.password, user.role, user.fullName,
      user.walletAddress, user.userCode || `${user.username}-${user.id.slice(-6)}`, user.balance || 0, user.status || 'active',
      user.createdAt || new Date(), user.lastLogin || null, user.phone || '', user.department || '', Boolean(user.transferBlocked),
      user.transferLimits?.daily ?? null, user.transferLimits?.monthly ?? null]);
  }
  for (const transaction of data.transactions || []) {
    await pool.query(`INSERT INTO transactions
      (id,tx_hash,from_user_id,to_user_id,from_address,to_address,amount,fee,status,block_number,timestamp,note,suspicion_score,suspicious,suspicion_reasons,severity,chain)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'internal') ON CONFLICT (id) DO NOTHING`, [
      transaction.id, transaction.txHash || `legacy-${transaction.id}`, transaction.fromUserId, transaction.toUserId,
      transaction.fromAddress || '', transaction.toAddress || '', transaction.amount || 0, transaction.fee || 0,
      transaction.status || 'confirmed', transaction.blockNumber || null, transaction.timestamp || new Date(), transaction.note || '',
      transaction.suspicionScore || 0, Boolean(transaction.suspicious), JSON.stringify(transaction.suspicionReasons || []), transaction.severity || 'low']);
  }
  for (const alert of data.alerts || []) {
    await pool.query(`INSERT INTO alerts (id,type,severity,transaction_id,user_id,message,timestamp,resolved,resolved_by,resolved_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`, [alert.id, alert.type || 'system', alert.severity || 'medium', alert.transactionId || null,
      alert.userId || null, alert.message || '', alert.timestamp || new Date(), Boolean(alert.resolved), alert.resolvedBy || null, alert.resolvedAt || null]);
  }
  for (const request of data.helpRequests || []) {
    await pool.query(`INSERT INTO help_requests (id,user_id,category,message,status,created_at,resolved_by,resolved_at,admin_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`, [request.id, request.userId, request.category, request.message, request.status || 'open', request.createdAt || new Date(), request.resolvedBy || null, request.resolvedAt || null, request.adminNote || '']);
  }
}

function isEnabled() { return Boolean(pool); }
function query(text, params) { if (!pool) throw new Error('DATABASE_URL is not configured'); return pool.query(text, params); }
function getPool() { return pool; }

module.exports = { initializeDatabase, isEnabled, query, getPool };