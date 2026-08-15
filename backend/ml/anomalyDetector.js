/**
 * Blockchain Transaction Anomaly Detector
 * ----------------------------------------
 * Rule-based + statistical scoring system to detect suspicious transactions.
 * Score range: 0.0 (clean) → 1.0 (highly suspicious)
 *
 * HOW TO TRAIN / IMPROVE DETECTION:
 * 1. Adjust THRESHOLDS below to match your network's normal behavior
 * 2. Add new rule functions in the RULES section
 * 3. Adjust WEIGHTS to prioritize certain signals
 * 4. Feed resolved alerts back using updateBaseline() to adapt over time
 */

const db = require('../utils/db');

// ─── Configurable Thresholds (edit these to tune detection) ──────────────────
const THRESHOLDS = {
  LARGE_AMOUNT_USD: 5000,        // Transactions above this are flagged
  VERY_LARGE_AMOUNT_USD: 20000,  // Critical threshold
  UNUSUAL_HOUR_START: 0,         // Midnight
  UNUSUAL_HOUR_END: 5,           // 5 AM
  VELOCITY_WINDOW_HOURS: 1,      // Check transactions within this window
  VELOCITY_MAX_COUNT: 5,         // Max transactions per velocity window
  AVG_MULTIPLIER_WARNING: 3,     // Flag if amount > 3x user's 30-day average
  AVG_MULTIPLIER_CRITICAL: 5,    // Critical if amount > 5x user's 30-day average
  NEW_RECIPIENT_DAYS: 30         // Flag if recipient never transacted with sender before
};

// ─── Rule Weights (must sum to 1.0) ──────────────────────────────────────────
const WEIGHTS = {
  largeAmount: 0.25,
  unusualHour: 0.15,
  velocitySpike: 0.20,
  amountVsAverage: 0.25,
  newRecipient: 0.10,
  roundNumber: 0.05
};

// ─── Detection Rules ─────────────────────────────────────────────────────────

function checkLargeAmount(amount) {
  if (amount >= THRESHOLDS.VERY_LARGE_AMOUNT_USD) return { score: 1.0, reason: 'Extremely large amount (>$20,000)' };
  if (amount >= THRESHOLDS.LARGE_AMOUNT_USD) return { score: 0.6, reason: 'Large amount (>$5,000)' };
  if (amount >= THRESHOLDS.LARGE_AMOUNT_USD / 2) return { score: 0.3, reason: 'Moderately large amount' };
  return { score: 0.0, reason: null };
}

function checkUnusualHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  if (hour >= THRESHOLDS.UNUSUAL_HOUR_START && hour <= THRESHOLDS.UNUSUAL_HOUR_END) {
    return { score: 1.0, reason: `Unusual hour (${hour}:00 AM)` };
  }
  if (hour >= 22) return { score: 0.4, reason: 'Late night transaction' };
  return { score: 0.0, reason: null };
}

function checkVelocity(fromUserId, timestamp) {
  const windowStart = new Date(timestamp);
  windowStart.setHours(windowStart.getHours() - THRESHOLDS.VELOCITY_WINDOW_HOURS);

  const recentTxCount = db.get('transactions')
    .filter(tx =>
      tx.fromUserId === fromUserId &&
      new Date(tx.timestamp) >= windowStart &&
      new Date(tx.timestamp) <= new Date(timestamp)
    )
    .size()
    .value();

  if (recentTxCount >= THRESHOLDS.VELOCITY_MAX_COUNT) {
    return { score: 1.0, reason: 'Velocity spike (too many transactions in 1 hour)' };
  }
  if (recentTxCount >= THRESHOLDS.VELOCITY_MAX_COUNT - 2) {
    return { score: 0.5, reason: 'High transaction frequency' };
  }
  return { score: 0.0, reason: null };
}

function checkAmountVsAverage(fromUserId, amount) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userTxs = db.get('transactions')
    .filter(tx =>
      tx.fromUserId === fromUserId &&
      new Date(tx.timestamp) >= thirtyDaysAgo
    )
    .value();

  if (userTxs.length === 0) return { score: 0.2, reason: 'No transaction history (new user)' };

  const avg = userTxs.reduce((sum, tx) => sum + tx.amount, 0) / userTxs.length;
  if (avg === 0) return { score: 0.0, reason: null };

  const multiplier = amount / avg;
  if (multiplier >= THRESHOLDS.AVG_MULTIPLIER_CRITICAL) {
    return { score: 1.0, reason: `Amount exceeds 30-day average by ${Math.round(multiplier * 100)}%` };
  }
  if (multiplier >= THRESHOLDS.AVG_MULTIPLIER_WARNING) {
    return { score: 0.6, reason: `Amount exceeds 30-day average by ${Math.round(multiplier * 100)}%` };
  }
  return { score: 0.0, reason: null };
}

function checkNewRecipient(fromUserId, toUserId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - THRESHOLDS.NEW_RECIPIENT_DAYS);

  const previousTx = db.get('transactions')
    .find(tx =>
      tx.fromUserId === fromUserId &&
      tx.toUserId === toUserId &&
      new Date(tx.timestamp) >= thirtyDaysAgo
    )
    .value();

  if (!previousTx) {
    return { score: 0.7, reason: 'New/unfamiliar recipient' };
  }
  return { score: 0.0, reason: null };
}

function checkRoundNumber(amount) {
  // Round numbers (exactly 1000, 5000, 10000) can indicate structuring
  if (amount % 10000 === 0 && amount >= 10000) return { score: 0.8, reason: 'Suspicious round number amount' };
  if (amount % 1000 === 0 && amount >= 5000) return { score: 0.4, reason: 'Round number amount' };
  return { score: 0.0, reason: null };
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

function analyzeTransaction({ fromUserId, toUserId, amount, timestamp }) {
  const ts = timestamp || new Date().toISOString();

  const checks = {
    largeAmount: checkLargeAmount(amount),
    unusualHour: checkUnusualHour(ts),
    velocitySpike: checkVelocity(fromUserId, ts),
    amountVsAverage: checkAmountVsAverage(fromUserId, amount),
    newRecipient: checkNewRecipient(fromUserId, toUserId),
    roundNumber: checkRoundNumber(amount)
  };

  // Weighted score
  let totalScore = 0;
  const reasons = [];

  for (const [key, result] of Object.entries(checks)) {
    const weighted = result.score * WEIGHTS[key];
    totalScore += weighted;
    if (result.reason) reasons.push(result.reason);
  }

  // Clamp to [0, 1]
  totalScore = Math.min(1.0, Math.max(0.0, totalScore));

  const suspicious = totalScore >= 0.5;

  return {
    suspicionScore: parseFloat(totalScore.toFixed(3)),
    suspicious,
    suspicionReasons: reasons,
    severity: totalScore >= 0.8 ? 'critical' : totalScore >= 0.5 ? 'high' : totalScore >= 0.3 ? 'medium' : 'low'
  };
}

/**
 * UPDATE BASELINE — call this when you resolve/confirm alerts
 * This allows the system to adapt thresholds based on confirmed fraud patterns.
 *
 * Usage: updateBaseline({ confirmedFraudAmounts: [9800, 25000] })
 */
function updateBaseline({ confirmedFraudAmounts = [] } = {}) {
  if (confirmedFraudAmounts.length > 0) {
    const minFraud = Math.min(...confirmedFraudAmounts);
    // Dynamically lower the large-amount threshold if fraud is occurring at lower values
    if (minFraud < THRESHOLDS.LARGE_AMOUNT_USD) {
      THRESHOLDS.LARGE_AMOUNT_USD = minFraud * 0.9;
      console.log(`[AnomalyDetector] Threshold updated to $${THRESHOLDS.LARGE_AMOUNT_USD}`);
    }
  }
}

module.exports = { analyzeTransaction, updateBaseline, THRESHOLDS };
