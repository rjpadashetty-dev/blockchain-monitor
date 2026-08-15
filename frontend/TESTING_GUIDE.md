# Testing & Verification Guide

## ✅ System Testing Checklist

### 1. Backend API Testing

#### Health Check:
```bash
curl http://localhost:5000/api/health
# Expected response: 200 OK
# {
#   "status": "ok",
#   "timestamp": "2024-06-14T10:30:00.000Z",
#   "version": "1.0.0",
#   "system": "Blockchain Security Monitor"
# }
```

#### Authentication Flow:
```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"junaid","password":"password"}'

# Expected: Returns token and user data
# {
#   "token": "eyJhbGc...",
#   "user": {
#     "id": "user-001",
#     "username": "junaid",
#     "balance": 5000,
#     ...
#   }
# }

# 2. Use token for authenticated requests
TOKEN="<token-from-above>"

curl http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer $TOKEN"
```

#### User Management (Admin):
```bash
# Get all users
curl "http://localhost:5000/api/admin/users?search=junaid" \
  -H "Authorization: Bearer $TOKEN"

# Create new user
curl -X POST http://localhost:5000/api/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User",
    "role": "user",
    "balance": 10000
  }'

# Update user balance
curl -X PUT http://localhost:5000/api/admin/users/user-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"balance": 7500}'

# Delete user
curl -X DELETE http://localhost:5000/api/admin/users/user-999 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Transaction Flow:
```bash
# 1. View user's transactions
curl "http://localhost:5000/api/transactions/my?page=1&limit=20" \
  -H "Authorization: Bearer $JUNAID_TOKEN"

# 2. Make transfer
curl -X POST http://localhost:5000/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JUNAID_TOKEN" \
  -d '{
    "toUsername": "rajesh",
    "amount": 1500,
    "note": "Payment for services"
  }'

# Expected: Transaction created with suspicion score
# {
#   "success": true,
#   "transaction": {
#     "id": "tx-abc123",
#     "status": "confirmed",
#     "suspicionScore": 0.15,
#     "suspicious": false,
#     ...
#   },
#   "newBalance": 3500
# }

# 3. View all transactions (admin)
curl "http://localhost:5000/api/transactions/all?page=1&suspicious=false" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Alert Management:
```bash
# Get all alerts
curl http://localhost:5000/api/alerts \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Resolve alert
curl -X PUT http://localhost:5000/api/alerts/alert-001/resolve \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### 2. Frontend UI Testing

#### Test Suite:
```bash
# Run as admin (admin/password)

✓ Dashboard Page:
  - Balance displays correctly
  - Total sent/received shows
  - Recent transactions listed
  
✓ Transfer Page:
  - Recipient search works
  - Transfer succeeds with low amount ($100)
  - Transfer flags with high amount ($25000 at 2 AM)
  - Balance updates after transfer
  
✓ Transaction History:
  - Lists all user transactions
  - Shows status (confirmed/flagged)
  - Risk score displays with color
  - Pagination works
  
✓ Admin Users Page:
  - Lists all users with balances
  - Search filters correctly
  - Add user creates account
  - Edit user updates balance
  - Delete user removes account
  
✓ Admin Transactions:
  - Shows all transactions
  - Filter by suspicious status
  - Displays risk scores
  - Shows suspicion reasons
  
✓ Admin Alerts:
  - Lists all alerts
  - Filter by status (resolved/unresolved)
  - Resolve button marks as checked
  - Shows severity badges
```

---

### 3. Anomaly Detection Testing

#### Test Case 1: Normal Transaction
```
Transaction: $500 transfer at 2 PM on Tuesday
Expected: Score 0.0-0.2 (Green)
Status: CONFIRMED ✓
```

#### Test Case 2: Large Amount
```
Transaction: $10,000 transfer at 3 PM
Expected: Score 0.3-0.5 (Yellow)
Status: FLAGGED ⚠️
```

#### Test Case 3: Suspicious Time
```
Transaction: $2,000 transfer at 3 AM (Midnight-5 AM)
Expected: Score 0.4-0.6 (Yellow-Orange)
Status: FLAGGED ⚠️
```

#### Test Case 4: High Velocity
```
Scenario: 7 transactions in 1 hour (threshold: 5)
Expected: Score 0.5+ (Orange)
Status: FLAGGED ⚠️
```

#### Test Case 5: Combined Risk
```
Transaction: $25,000 to NEW recipient at 2 AM
Expected: Score 0.8-1.0 (Red - Critical)
Status: FLAGGED 🔴
Alert Created: YES
```

#### How to Test:
```bash
# As junaid user:
1. Go to Transfer Funds
2. Enter transaction details
3. Submit
4. Check returned score:
   - suspicionScore: <value>
   - suspicious: true/false
5. View in admin portal
6. Verify alert created (if suspicious)
```

---

### 4. Admin Portal Testing

#### Test Transaction Flow:
```bash
# 1. Login as admin (admin/password)

# 2. Go to "All Transactions"
   - Should see transfers from junaid → rajesh
   - Risk scores displayed
   - Color coding:
     * Green (0.0-0.3): Low risk
     * Yellow (0.3-0.5): Medium risk
     * Orange (0.5-0.8): High risk
     * Red (0.8-1.0): Critical risk

# 3. Go to "Alerts"
   - Should see flagged transactions
   - Can resolve alerts
   - Severity shown (critical/high/medium/low)

# 4. Go to "Users"
   - Can view all users and balances
   - Add test user with $5000 balance
   - Edit balance to $7500
   - Delete test user

# 5. View user transaction history
   - Click "Edit" on a user
   - See their recent transactions
```

---

### 5. User Balance Update Testing

#### Verify Balance is Preserved:

```bash
# Test Scenario: Admin updates user balance

# 1. Check initial balance
User: rajesh
Current balance: 7500.50

# 2. Admin edits user, sets balance to 10000
Admin portal → Users → Edit rajesh → Balance: 10000

# 3. Verify persistence
- Frontend: Shows 10000 ✓
- Backend: Returns 10000 ✓
- Database: db.json shows 10000 ✓

# 4. Make transfer to confirm
junaid → rajesh: $1000
- rajesh balance: 10000 + 1000 - 0.01 (fee) = 10999.99 ✓
```

---

### 6. Docker Compose Testing

#### Verify Services:
```bash
# Check all services running
docker-compose ps
# Expected: All containers with status "Up"

# Backend logs
docker logs -f bcmonitor-backend
# Should see: "🚀 Blockchain Monitor Backend running on port 5000"

# Frontend logs
docker logs -f bcmonitor-frontend
# Should show nginx started

# Database persistence
docker exec bcmonitor-backend ls -lh /app/db.json
# Should show database file exists

# Health check
docker inspect bcmonitor-backend --format='{{.State.Health.Status}}'
# Expected: healthy
```

#### Network Testing:
```bash
# Test inter-container communication
docker exec bcmonitor-backend curl http://bcmonitor-prometheus:9090/-/healthy
# Expected: 200 response

# Test external access
curl http://localhost:5000/api/health
# Expected: 200 response
```

---

### 7. CI/CD Pipeline Testing

#### Local Pipeline Simulation:
```bash
# Install dependencies
cd backend && npm ci

# Run tests
npm test -- --passWithNoTests
# Expected: "Tests: 0, Passing: 0"

# Security audit
npm audit --audit-level=high
# Expected: "up to date, audited 409 packages"

# Check lint (if configured)
npm run lint
# Expected: No errors

# Build Docker image
docker build -t bcmonitor-backend:test ./backend
# Expected: Successfully tagged...
```

#### GitHub Actions Verification:
```bash
# After pushing to GitHub:
1. Go to repo → Actions tab
2. See ci-cd.yml workflow running
3. Check each stage completes:
   ✓ test
   ✓ build-and-deploy
4. Review logs for any failures
5. Verify Docker image created
```

---

### 8. Performance Testing

#### Response Time:
```bash
# Measure API latency
time curl http://localhost:5000/api/health
# Expected: < 100ms

# Measure transaction processing
time curl -X POST http://localhost:5000/api/transactions/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"toUsername":"rajesh","amount":500}'
# Expected: < 500ms
```

#### Concurrent Users:
```bash
# Install Apache Bench
# macOS: brew install httpd
# Windows: Download from ApacheFriends

# Test with 100 concurrent requests
ab -n 1000 -c 100 http://localhost:5000/api/health

# Expected output:
# Requests per second: > 100 req/s
# Failed requests: 0
```

#### Database Size:
```bash
# Monitor db.json growth
ls -lh backend/db.json
# After 100 transactions: ~50KB

# Expected growth: ~500 bytes per transaction
# If > 1MB and < 1 year of data, consider archiving
```

---

### 9. Security Testing

#### XSS Protection:
```bash
# Try to inject script in transaction note
Transfer note: <script>alert('xss')</script>
Expected: Note sanitized, script not executed ✓

# Admin portal displays safely
Expected: Script tags visible as text, not executed ✓
```

#### SQL Injection (if using SQL):
```bash
# Try injection in search
Search: admin' OR '1'='1
Expected: Treated as literal string, no injection ✓
```

#### CORS Testing:
```bash
# Request from different origin
curl -H "Origin: http://evil.com" http://localhost:5000/api/health
Expected: 
- If dev: Response allowed
- If prod: 403 Forbidden or CORS error ✓
```

#### Rate Limiting:
```bash
# Send 11 login attempts in 15 minutes
for i in {1..15}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -d '{"username":"junaid","password":"wrong"}' &
done

# Expected: After 10 attempts, get rate limit error:
# 429 Too Many Requests ✓
```

---

### 10. Data Persistence Testing

#### Test Database Persistence:
```bash
# 1. Create transaction
# 2. Restart backend
docker restart bcmonitor-backend

# 3. Verify transaction still exists
# Expected: ✓ Data persisted

# 4. Test with Docker Compose restart
docker-compose down
docker-compose up -d

# 5. Verify data still there
# Expected: ✓ All data intact
```

---

## 📊 Test Report Template

```markdown
## System Testing Report - [Date]

### Backend API
- ✓ Health check responding
- ✓ Authentication working
- ✓ User CRUD operations
- ✓ Transaction processing
- ✓ Alert management
- ✓ Admin endpoints

### Frontend UI
- ✓ Dashboard displays correctly
- ✓ Transfer page functional
- ✓ Transaction history showing
- ✓ Admin users management
- ✓ Admin transactions view
- ✓ Alert resolution

### Anomaly Detection
- ✓ Normal txs (score 0.0-0.2)
- ✓ Large amount flag (score 0.3+)
- ✓ Unusual time flag (score 0.4+)
- ✓ Velocity spike flag (score 0.5+)
- ✓ Combined risk flag (score 0.8+)

### Admin Portal
- ✓ User balance updates persist
- ✓ Transaction display accurate
- ✓ Risk scores displaying
- ✓ Alerts can be resolved

### Docker & CI/CD
- ✓ Services starting correctly
- ✓ Health checks passing
- ✓ Tests running successfully
- ✓ Security audit clean
- ✓ Data persistence working

### Performance
- ✓ Response times < 500ms
- ✓ Handles 100+ concurrent users
- ✓ Database < 1MB (normal size)

### Security
- ✓ XSS protection active
- ✓ Rate limiting working
- ✓ CORS configured
- ✓ JWT validation enforced

### Issues Found:
- None

### Recommendation:
✅ System ready for deployment
```

---

## 🚀 Final Verification Steps

Before considering the system "production ready":

1. ✅ All tests passing
2. ✅ No security vulnerabilities
3. ✅ Admin balance updates working
4. ✅ Transactions showing in admin portal
5. ✅ Anomaly detection scoring correctly
6. ✅ Alerts generating for suspicious txs
7. ✅ Docker containers running stable
8. ✅ Database persisting data
9. ✅ CI/CD pipeline automated
10. ✅ Monitoring collecting metrics

---

**Next Steps After Testing:**
1. Review ML_TRAINING_GUIDE.md
2. Tune anomaly detection thresholds
3. Deploy to production using DEVOPS_SETUP.md
4. Setup continuous monitoring
5. Document runbook for team
