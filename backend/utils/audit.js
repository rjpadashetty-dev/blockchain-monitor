const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const database = require('./database');

async function recordAudit({ actor, action, entityType, entityId, metadata = {}, req }) {
  const actorId = actor?.id || null;
  const actorUsername = actor?.username || 'system';
  if (database.isEnabled()) {
    await database.query(`INSERT INTO audit_logs (actor_id, actor_username, action, entity_type, entity_id, metadata, ip_address)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [actorId, actorUsername, action, entityType || null, entityId || null, metadata, req?.ip || null]);
  } else {
    db.get('systemLogs').push({ id: uuidv4(), type: 'audit', actorId, actorUsername, action, entityType, entityId, metadata, createdAt: new Date().toISOString() }).write();
  }
}

module.exports = { recordAudit };