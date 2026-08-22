const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '../db.json'));
const db = low(adapter);

// Default structure
db.defaults({
  users: [],
  transactions: [],
  alerts: [],
  helpRequests: [],
  systemLogs: []
}).write();

// Backfill fields introduced after the initial LowDB schema.
db.get('users').value().forEach((user) => {
  const updates = {};
  if (!user.userCode) updates.userCode = `${user.username}-${Math.floor(100000 + Math.random() * 900000)}`;
  if (!user.transferLimits) updates.transferLimits = { daily: null, monthly: null };
  if (user.transferBlocked === undefined) updates.transferBlocked = false;
  if (Object.keys(updates).length) db.get('users').find({ id: user.id }).assign(updates).write();
});

module.exports = db;
