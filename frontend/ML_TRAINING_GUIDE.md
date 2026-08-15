# Machine Learning Training Guide - Anomaly Detection

## 🧠 System Overview

Your blockchain monitor uses a **rule-based + statistical scoring system** for detecting fraudulent transactions. Unlike traditional ML models requiring labeled training data, this system learns and adapts through configured thresholds.

**Location:** `backend/ml/anomalyDetector.js`

---

## 📊 How the System Works

### Scoring Pipeline:
```
Transaction Input
    ↓
[6 Detection Rules run in parallel]
    ├─ Large Amount Check (25%)
    ├─ Unusual Hour Check (15%)
    ├─ Velocity Spike Check (20%)
    ├─ Amount vs. Average Check (25%)
    ├─ New Recipient Check (10%)
    └─ Round Number Check (5%)
    ↓
[Weighted Scoring]
    ↓
Final Score: 0.0 → 1.0
    ├─ 0.0-0.3  = Low Risk (Green)
    ├─ 0.3-0.5  = Medium Risk (Yellow)
    ├─ 0.5-0.8  = High Risk (Orange)
    └─ 0.8-1.0  = Critical Risk (Red)
    ↓
Alert Generated (if score ≥ 0.5)
```

---

## 🎛️ Configuration & Tuning

### 1. Threshold Adjustment (Most Important)

**File:** `backend/ml/anomalyDetector.js` - Lines 16-28

```javascript
const THRESHOLDS = {
  LARGE_AMOUNT_USD: 5000,           // ← Adjust based on your network's normal activity
  VERY_LARGE_AMOUNT_USD: 20000,     // ← Critical threshold
  UNUSUAL_HOUR_START: 0,            // ← Midnight (0-5 AM = unusual)
  UNUSUAL_HOUR_END: 5,
  VELOCITY_WINDOW_HOURS: 1,         // ← Max transactions per hour window
  VELOCITY_MAX_COUNT: 5,            // ← Flag if >5 transactions in 1 hour
  AVG_MULTIPLIER_WARNING: 3,        // ← Flag if amount > 3x user's 30-day average
  AVG_MULTIPLIER_CRITICAL: 5,       // ← Critical if > 5x average
  NEW_RECIPIENT_DAYS: 30            // ← Track recipients over 30 days
};
```

### How to Tune:

#### Step 1: Analyze Normal Activity
```bash
# Login as admin and view recent transactions
# Calculate baseline patterns:
- Average transaction amount
- Peak hours (when most transactions occur)
- Most users' typical transaction velocity (txs/hour)
- Average recipient diversity (how many unique recipients per user)
```

#### Step 2: Update Thresholds
```javascript
// Example: If your average transaction is $2000, not $5000:
LARGE_AMOUNT_USD: 2000,           // Now flags >$2000
VERY_LARGE_AMOUNT_USD: 10000,     // Now flags >$10000

// Example: If most activity is 8 AM - 6 PM, not 24/7:
UNUSUAL_HOUR_START: 20,           // 8 PM (evening)
UNUSUAL_HOUR_END: 7,              // 7 AM (morning)

// Example: If users transact 10 times/hour normally:
VELOCITY_MAX_COUNT: 10,           // Adjust from 5 to 10
```

#### Step 3: Test & Validate
```bash
# Make test transactions with known patterns
# Verify scores match expected values
# Check admin alerts dashboard
```

---

### 2. Weight Adjustment (Fine-Tuning)

**File:** `backend/ml/anomalyDetector.js` - Lines 31-37

```javascript
const WEIGHTS = {
  largeAmount: 0.25,           // 25% importance
  unusualHour: 0.15,           // 15% importance
  velocitySpike: 0.20,         // 20% importance
  amountVsAverage: 0.25,       // 25% importance
  newRecipient: 0.10,          // 10% importance
  roundNumber: 0.05            // 5% importance (must sum to 1.0)
};
```

### How to Adjust Weights:

If you want to prioritize **amount-based fraud**:
```javascript
const WEIGHTS = {
  largeAmount: 0.35,      // ↑ Increased from 0.25
  unusualHour: 0.10,      // ↓ Decreased
  velocitySpike: 0.20,
  amountVsAverage: 0.25,
  newRecipient: 0.05,     // ↓ Decreased
  roundNumber: 0.05
};
// Total = 1.0 ✅
```

If you want to prioritize **behavioral fraud** (velocity/time):
```javascript
const WEIGHTS = {
  largeAmount: 0.15,
  unusualHour: 0.25,      // ↑ Increased
  velocitySpike: 0.30,    // ↑ Increased
  amountVsAverage: 0.20,
  newRecipient: 0.05,
  roundNumber: 0.05
};
```

---

## 🔄 Training Process (Adaptive Learning)

### Phase 1: Baseline Establishment (Week 1)
```bash
# 1. Run system for 1 week with current thresholds
# 2. Let it generate alerts
# 3. Manually review alerts and categorize:
#    - TRUE POSITIVE: Legitimate fraud alert ✓
#    - FALSE POSITIVE: Safe transaction flagged ✗
#    - FALSE NEGATIVE: Fraud missed (fix later) ✗

# 4. Track metrics:
metrics = {
  total_alerts: 45,
  true_positives: 38,
  false_positives: 7,
  precision: 38 / 45 = 0.84 (84%)
}
```

### Phase 2: Threshold Refinement
```javascript
// If getting too many FALSE POSITIVES (flagging safe transactions):
// → Increase thresholds (make detection stricter)
LARGE_AMOUNT_USD: 5000,  // ← Increase to 7000
AVG_MULTIPLIER_WARNING: 3,  // ← Increase to 4

// If getting too many FALSE NEGATIVES (missing fraud):
// → Decrease thresholds (make detection more sensitive)
LARGE_AMOUNT_USD: 5000,  // ← Decrease to 3000
AVG_MULTIPLIER_WARNING: 3,  // ← Decrease to 2.5
```

### Phase 3: Confirm with Resolved Alerts
After admin confirms suspicious alerts:
```javascript
// Call updateBaseline() to adapt detection
// Usage in backend when admin resolves alert:

const { updateBaseline } = require('./ml/anomalyDetector');

// When admin confirms fraud:
updateBaseline({
  confirmedFraudAmounts: [9800, 25000, 15000]
});

// System dynamically lowers threshold if fraud occurs at lower amounts
```

---

## 📈 Real-World Training Scenarios

### Scenario 1: Detecting Structuring (Breaking Large Transactions)
```javascript
// Problem: User sends 5 × $1000 transactions in 1 hour to avoid $5000 threshold

// Solution: Adjust velocity + amount averaging
const THRESHOLDS = {
  VELOCITY_MAX_COUNT: 3,  // Flag if >3 transactions/hour
  VELOCITY_WINDOW_HOURS: 2,  // Look back 2 hours instead of 1
  AVG_MULTIPLIER_WARNING: 1.5  // Flag if even 1.5x average (cumulative)
};

// Recalc: 5 × $1000 = $5000 total
// Even though each is $1000, velocity spike catches it! ✓
```

### Scenario 2: High-Volume Merchant Network
```javascript
// Problem: Legitimate e-commerce platform now flagged for high velocity

// Solution: Increase velocity threshold for verified merchants
// (Implement role-based detection)

function analyzeTransaction({ fromUserId, toUserId, amount, timestamp, senderRole }) {
  let VELOCITY_MAX = 5;  // Default
  
  if (senderRole === 'merchant') {
    VELOCITY_MAX = 50;  // Merchants can do 50 txs/hour
  }
  
  const recentTxCount = db.get('transactions')
    .filter(tx =>
      tx.fromUserId === fromUserId &&
      new Date(tx.timestamp) >= windowStart
    )
    .size()
    .value();

  if (recentTxCount >= VELOCITY_MAX) {
    // Only flag merchants if exceeding their higher limit
  }
}
```

### Scenario 3: Time Zone Adaptation
```javascript
// Problem: User in different timezone (e.g., India) always sends at 2 AM NY time

// Solution: Make unusual hours configurable per user
const USER_TIMEZONES = {
  'user-001': 'UTC+5:30',  // India
  'user-002': 'UTC-5'      // New York
};

function checkUnusualHour(timestamp, userId) {
  const userTz = USER_TIMEZONES[userId] || 'UTC';
  const hour = new Date(timestamp).toLocaleString('en-US', {
    timeZone: userTz
  });
  
  // Now check against user's local time, not UTC
  // Results in fewer false positives ✓
}
```

---

## 🎯 Step-by-Step Training Implementation

### Step 1: Monitor Real Transactions (Week 1)
```bash
# No changes, let system generate baseline alerts
# Admin portal: View all alerts
# Note: precision, recall, false positive rate
```

### Step 2: Collect Feedback Data
Create `backend/training-data.json`:
```json
{
  "labeled_transactions": [
    {
      "tx_id": "tx-001",
      "amount": 15000,
      "hour": 2,
      "velocity_in_window": 7,
      "is_new_recipient": true,
      "label": "FRAUD",  // Admin confirmed
      "reason": "Large amount at midnight with new recipient"
    },
    {
      "tx_id": "tx-002",
      "amount": 5500,
      "hour": 14,
      "velocity_in_window": 2,
      "is_new_recipient": false,
      "label": "LEGITIMATE",  // Admin confirmed
      "reason": "Normal business hours, known recipient"
    }
  ]
}
```

### Step 3: Analyze Feedback
```javascript
// Create analysis script: backend/scripts/analyze-training-data.js
const fs = require('fs');
const trainingData = JSON.parse(fs.readFileSync('training-data.json'));

// Calculate metrics
let truePositives = 0;
let falsePositives = 0;
let falseNegatives = 0;

trainingData.forEach(tx => {
  const predicted = analyzeTransaction(tx).suspicious;
  const actual = tx.label === 'FRAUD';
  
  if (predicted && actual) truePositives++;
  else if (predicted && !actual) falsePositives++;
  else if (!predicted && actual) falseNegatives++;
});

console.log(`Precision: ${truePositives / (truePositives + falsePositives)}`);
console.log(`Recall: ${truePositives / (truePositives + falseNegatives)}`);
console.log(`F1 Score: ...`);
```

### Step 4: Iterative Tuning
```bash
# For each feedback cycle:
# 1. Adjust thresholds based on false positives/negatives
# 2. Re-run analysis script
# 3. If metrics improve, commit changes
# 4. If metrics worsen, revert changes
# 5. Repeat every week until stable
```

---

## 📊 Monitoring & Metrics

### Key Metrics to Track:

```bash
# In admin portal, track these over time:
- Precision = TP / (TP + FP)  # How many alerts are actually fraud?
- Recall = TP / (TP + FN)      # How many frauds are caught?
- F1 Score = 2 × (Precision × Recall) / (Precision + Recall)
- False Positive Rate = FP / (FP + TN)
- Detection Latency = Time from fraud → alert
```

### Create Metrics Dashboard:
```bash
# Add to devops/prometheus.yml:
- job_name: 'anomaly_detection'
  metrics_path: '/api/metrics/anomaly'
  static_configs:
    - targets: ['localhost:5000']
```

---

## 🚀 Advanced: Integrate Real ML Models (Optional Future)

If you want to upgrade to **true machine learning**:

### Option 1: Isolation Forest
```bash
npm install scikit-learn-js
# Detect anomalies without labeled data
```

### Option 2: One-Class SVM
```bash
npm install libsvm-js
# Learn "normal" transaction patterns
```

### Option 3: Neural Networks
```bash
npm install tensorflow.js
# Deep learning for complex patterns
```

### Option 4: Cloud ML Services
```bash
# Google Cloud Vertex AI
# AWS SageMaker
# Azure ML
```

---

## ✅ Tuning Checklist

- [ ] Analyzed normal transaction patterns
- [ ] Updated LARGE_AMOUNT_USD threshold
- [ ] Updated VELOCITY thresholds
- [ ] Updated AVG_MULTIPLIER values
- [ ] Tested with sample transactions
- [ ] Verified alerts in admin dashboard
- [ ] Collected feedback for 1 week
- [ ] Calculated precision/recall metrics
- [ ] Adjusted weights if needed
- [ ] Re-tuned based on feedback
- [ ] Documented final thresholds
- [ ] Set up automated retraining (weekly)

---

## 📝 Template: Tuning Report

```markdown
## Weekly Anomaly Detection Tuning Report

**Week of:** June 14-20, 2024

### Baseline Metrics
- Alerts Generated: 45
- Verified Fraud: 38
- False Positives: 7
- Precision: 84%
- Recall: 92%

### Changes Made
- ↑ LARGE_AMOUNT_USD: 5000 → 4000
- ↓ VELOCITY_MAX_COUNT: 5 → 3
- Updated AVG_MULTIPLIER_WARNING: 3 → 2.5

### New Metrics
- Alerts Generated: 52
- Verified Fraud: 40
- False Positives: 12
- Precision: 77% (↓ but caught 2 more frauds)
- Recall: 95% (↑ improved)

### Next Week Action
- FP increased, reduce sensitivity slightly
- LARGE_AMOUNT_USD: 4000 → 4500
```

---

**Next Steps:**
1. ✅ Review current transaction patterns in admin dashboard
2. ✅ Update THRESHOLDS in `backend/ml/anomalyDetector.js`
3. ✅ Test with sample transactions
4. ✅ Monitor alerts for 1 week
5. ✅ Create training data and calculate metrics
6. ✅ Iterate tuning based on feedback
