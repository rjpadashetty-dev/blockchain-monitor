const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const file = path.join(__dirname, '..', 'db.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const password = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
const endDate = new Date('2026-08-23T18:00:00.000Z');
const startDate = new Date('2026-05-01T09:00:00.000Z');

const existing = data.users.filter(user => user.role === 'admin' || ['junaid', 'rajesh', 'sharanagouda', 'sainath'].includes(user.username));
const admin = existing.find(user => user.role === 'admin');
const users = existing.filter(user => user.role !== 'admin');
const additions = [
  ['user-004', 'priya', 'Priya', 'Sharma', 'priya.sharma@example.com', 'Finance', 'female', 48000, 15000, 250000],
  ['user-005', 'amit', 'Amit', 'Verma', 'amit.verma@example.com', 'Sales', 'male', 26500, 12000, 180000],
  ['user-006', 'neha', 'Neha', 'Kulkarni', 'neha.kulkarni@example.com', 'Education', 'female', 32000, 20000, 120000],
  ['user-007', 'rohit', 'Rohit', 'Mehta', 'rohit.mehta@example.com', 'Business', 'male', 425000, null, null],
  ['user-008', 'ananya', 'Ananya', 'Iyer', 'ananya.iyer@example.com', 'Design', 'female', 18500, 10000, 50000],
  ['user-009', 'vikram', 'Vikram', 'Singh', 'vikram.singh@example.com', 'Healthcare', 'male', 76000, 25000, 300000],
  ['user-010', 'kavya', 'Kavya', 'Reddy', 'kavya.reddy@example.com', 'Marketing', 'female', 29500, 8000, 100000],
  ['user-011', 'arjun', 'Arjun', 'Nair', 'arjun.nair@example.com', 'Operations', 'male', 51000, 18000, 160000],
  ['user-012', 'deepak', 'Deepak', 'Joshi', 'deepak.joshi@example.com', 'Consulting', 'male', 62000, 22000, 220000]
];

function wallet(id) { return '0x' + id.replace(/[^a-z0-9]/gi, '').padEnd(40, '0').slice(0, 40); }
function code(username, id) { return `${username}-${id.slice(-3)}426`; }
function addUser(row, index) {
  const [id, username, firstName, surname, email, department, gender, balance, daily, monthly] = row;
  return { id, username, email, password, role: 'user', fullName: `${firstName} ${surname}`, firstName, surname, gender, walletAddress: wallet(id), balance, status: 'active', createdAt: '2026-05-01T09:00:00.000Z', lastLogin: null, phone: `+91-98${String(10000000 + index * 137531).slice(-8)}`, department, userCode: code(username, id), transferLimits: { daily, monthly }, transferBlocked: false };
}

const newUsers = additions.map(addUser);
users.forEach(user => {
  if (!user.surname) {
    const parts = String(user.fullName || user.username).trim().split(/\s+/);
    user.surname = parts.length > 1 ? parts[parts.length - 1] : '';
  }
  if (!user.firstName) user.firstName = String(user.fullName || user.username).trim().split(/\s+/)[0];
  if (!user.gender) user.gender = user.username === 'sainath' ? 'male' : 'male';
});
const allUsers = [admin, ...users, ...newUsers];
const userMap = Object.fromEntries(allUsers.map(user => [user.id, user]));
const accountUsers = allUsers.filter(user => user.role === 'user');
let sequence = 1;
const transactions = [];
const alerts = [];

function iso(day, hour, minute = 0) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}
function tx(fromUserId, toUserId, amount, timestamp, transactionType = 'transfer', suspicious = false, note = '') {
  const from = userMap[fromUserId];
  const to = userMap[toUserId];
  const score = suspicious ? 0.86 : amount >= 20000 ? 0.42 : amount >= 5000 ? 0.24 : 0.08;
  const id = `seed-tx-${String(sequence++).padStart(4, '0')}`;
  const reasons = suspicious ? ['Unexpected transaction pattern', 'Amount differs from user baseline', 'Unusual transaction time'] : amount >= 20000 ? ['Large amount (>$20,000)'] : [];
  const transaction = { id, txHash: `0x${id.replace(/-/g, '').padEnd(64, '0')}`, fromUserId, toUserId, fromAddress: from.walletAddress, toAddress: to.walletAddress, amount, fee: transactionType === 'transfer' ? Number((amount * 0.001).toFixed(4)) : 0, status: suspicious ? 'flagged' : 'confirmed', blockNumber: 18500000 + sequence, timestamp, note, suspicionScore: score, suspicious, suspicionReasons: reasons, severity: suspicious ? 'high' : score >= 0.4 ? 'medium' : 'low', transactionType };
  transactions.push(transaction);
  if (suspicious) alerts.push({ id: `seed-alert-${String(alerts.length + 1).padStart(3, '0')}`, type: 'suspicious_transaction', severity: 'high', transactionId: id, userId: fromUserId, message: `Suspicious transaction detected: ${reasons.join(', ')}`, timestamp, resolved: false, resolvedBy: null, resolvedAt: null });
}

function dayRange(callback) {
  for (let date = new Date(startDate); date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) callback(new Date(date));
}
function dayString(date) { return date.toISOString().slice(0, 10); }
function dateInMonth(month, day, hour) { return iso(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, hour); }

// Priya: monthly salary and regular household transfers.
[5, 6, 7, 8].forEach((month, index) => { tx(admin.id, 'user-004', 48000, dateInMonth(month, 1, 9), 'deposit', false, 'Monthly salary credit'); tx('user-004', 'user-006', 6500, dateInMonth(month, 5, 18), 'transfer', false, 'Education support'); });
// Deepak: monthly salary with occasional consulting payments.
[5, 6, 7, 8].forEach(month => { tx(admin.id, 'user-012', 62000, dateInMonth(month, 1, 8), 'deposit', false, 'Monthly salary credit'); });
[['2026-05-18', 8500], ['2026-06-21', 12000], ['2026-07-16', 9500], ['2026-08-19', 14500]].forEach(([day, amount]) => tx('user-012', 'user-004', amount, iso(day, 14), 'transfer', false, 'Consulting payment'));
// Amit and Kavya: active daily users with small frequent payments.
dayRange(date => { const day = date.getUTCDate(); if (day % 2 === 0) tx('user-005', 'user-010', 180 + (day % 5) * 35, iso(dayString(date), 10 + (day % 8), 20), 'transfer'); if (day % 3 === 0) tx('user-010', 'user-005', 95 + (day % 4) * 25, iso(dayString(date), 15, 40), 'transfer'); });
// Neha and Arjun: weekly activity.
[3, 10, 17, 24, 31].forEach(day => { tx(admin.id, 'user-006', 8000, dateInMonth(5, day, 10), 'deposit', false, 'Weekly allowance'); tx('user-011', 'user-006', 1200, dateInMonth(5, day, 17), 'transfer'); });
[7, 14, 21, 28].forEach(day => { tx(admin.id, 'user-011', 10000, dateInMonth(6, day, 9), 'deposit', false, 'Weekly allowance'); tx('user-006', 'user-011', 950, dateInMonth(6, day, 19), 'transfer'); });
[5, 12, 19, 26].forEach(day => { tx(admin.id, 'user-006', 8000, dateInMonth(7, day, 10), 'deposit', false, 'Weekly allowance'); tx('user-011', 'user-006', 1350, dateInMonth(7, day, 17), 'transfer'); });
[2, 9, 16].forEach(day => { tx(admin.id, 'user-011', 10000, dateInMonth(8, day, 9), 'deposit', false, 'Weekly allowance'); tx('user-006', 'user-011', 1100, dateInMonth(8, day, 19), 'transfer'); });
// Rohit and Vikram: business accounts with high-value transactions at varied times.
[['2026-05-08', 125000, 'user-009'], ['2026-05-22', 210000, 'user-004'], ['2026-06-11', 175000, 'user-009'], ['2026-07-19', 265000, 'user-004'], ['2026-08-04', 320000, 'user-009'], ['2026-08-21', 185000, 'user-004']].forEach(([day, amount, recipient], index) => { tx('user-007', recipient, amount, iso(day, [7, 13, 21, 2, 16, 23][index], 15), 'transfer', amount >= 250000, 'Business settlement'); });
[['2026-05-15', 38000], ['2026-06-15', 42000], ['2026-07-15', 46000], ['2026-08-15', 50000]].forEach(([day, amount]) => tx(admin.id, 'user-009', amount, iso(day, 8), 'deposit', false, 'Monthly salary credit'));
// Junaid: blocked account with withdrawals only.
[['2026-05-12', 1800], ['2026-06-12', 2200], ['2026-07-12', 1600], ['2026-08-12', 2400]].forEach(([day, amount]) => tx('user-001', admin.id, amount, iso(day, 12), 'withdrawal', false, 'Scheduled withdrawal'));
// Rajesh: month-end finance transfers.
[['2026-05-28', 9000], ['2026-06-28', 12500], ['2026-07-28', 15000], ['2026-08-20', 17500]].forEach(([day, amount]) => tx('user-002', 'user-003', amount, iso(day, 16), 'transfer'));
// Sharanagouda and Sainath: mixed monthly and moderate activity.
[['2026-05-03', 6000], ['2026-06-03', 7200], ['2026-07-03', 6800], ['2026-08-03', 8000]].forEach(([day, amount]) => tx(admin.id, 'user-003', amount, iso(day, 9), 'deposit', false, 'Monthly account funding'));
[['2026-05-14', 5000], ['2026-06-14', 5500], ['2026-07-14', 6500], ['2026-08-14', 7000]].forEach(([day, amount]) => tx(admin.id, 'user-93b78ac3', amount, iso(day, 11), 'deposit', false, 'Monthly account funding'));
// Ananya and existing users with unexpected behavior to exercise anomaly detection.
tx('user-008', 'user-007', 14999, iso('2026-06-26', 3, 42), 'transfer', true, 'Unexpected overnight transfer');
tx('user-008', 'user-007', 27500, iso('2026-08-18', 2, 8), 'transfer', true, 'Unexpected large transfer');
tx('user-003', 'user-008', 33333, iso('2026-07-27', 23, 55), 'transfer', true, 'Unusual round-number transfer');
tx('user-005', 'user-008', 12000, iso('2026-08-22', 1, 12), 'transfer', true, 'Unexpected recipient activity');

// Keep balances compatible with the generated history while preserving existing account identity.
const balances = { 'user-001': 24203.23, 'user-002': 218919, 'user-003': 73959.2798, 'user-93b78ac3': 20090.1, 'user-004': 181500, 'user-005': 25100, 'user-006': 46950, 'user-007': 903000, 'user-008': 9500, 'user-009': 152000, 'user-010': 31200, 'user-011': 68500, 'user-012': 212000 };
allUsers.forEach(user => { if (balances[user.id] !== undefined) user.balance = balances[user.id]; });
data.users = allUsers;
data.transactions = transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
data.alerts = alerts;
data.helpRequests = data.helpRequests || [];
data.systemLogs = data.systemLogs || [];
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Seeded ${accountUsers.length} user accounts and ${transactions.length} transactions from ${startDate.toISOString().slice(0, 10)} through ${endDate.toISOString().slice(0, 10)}.`);
console.log(`Generated ${alerts.length} anomaly alerts.`);

async function syncNeon() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --neon mode');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT ''");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS surname TEXT DEFAULT ''");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");
    await client.query('DELETE FROM alerts');
    await client.query('DELETE FROM transactions');
    for (const user of allUsers) {
      await client.query(`INSERT INTO users (id,username,email,password,role,full_name,first_name,surname,gender,wallet_address,user_code,balance,status,created_at,last_login,phone,department,transfer_blocked,daily_limit,monthly_limit)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,full_name=EXCLUDED.full_name,first_name=EXCLUDED.first_name,surname=EXCLUDED.surname,gender=EXCLUDED.gender,balance=EXCLUDED.balance,status=EXCLUDED.status,phone=EXCLUDED.phone,department=EXCLUDED.department,transfer_blocked=EXCLUDED.transfer_blocked,daily_limit=EXCLUDED.daily_limit,monthly_limit=EXCLUDED.monthly_limit`, [user.id, user.username, user.email, user.password, user.role, user.fullName, user.firstName || '', user.surname || '', user.gender || '', user.walletAddress, user.userCode, user.balance, user.status, user.createdAt, user.lastLogin, user.phone || '', user.department || '', Boolean(user.transferBlocked), user.transferLimits?.daily ?? null, user.transferLimits?.monthly ?? null]);
    }
    for (const transaction of transactions) {
      await client.query(`INSERT INTO transactions (id,tx_hash,from_user_id,to_user_id,from_address,to_address,amount,fee,status,block_number,timestamp,note,suspicion_score,suspicious,suspicion_reasons,severity,transaction_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [transaction.id, transaction.txHash, transaction.fromUserId, transaction.toUserId, transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.fee, transaction.status, transaction.blockNumber, transaction.timestamp, transaction.note, transaction.suspicionScore, transaction.suspicious, JSON.stringify(transaction.suspicionReasons), transaction.severity, transaction.transactionType]);
    }
    for (const alert of alerts) {
      await client.query(`INSERT INTO alerts (id,type,severity,transaction_id,user_id,message,timestamp,resolved) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [alert.id, alert.type, alert.severity, alert.transactionId, alert.userId, alert.message, alert.timestamp, alert.resolved]);
    }
    await client.query('COMMIT');
    console.log(`Synced ${allUsers.length} users, ${transactions.length} transactions, and ${alerts.length} alerts to Neon.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes('--neon')) syncNeon().catch(error => { console.error('Neon sync failed:', error.message); process.exitCode = 1; });
