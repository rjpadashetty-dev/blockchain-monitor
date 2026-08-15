# 📥 Downloads & Installation Guide

## 🎯 Complete Downloads Required

### Essential Downloads:

#### 1. **Docker Desktop** ⭐ REQUIRED
**Why:** Containerizes all services (backend, frontend, monitoring)
**Download:** https://www.docker.com/products/docker-desktop
**Size:** ~650 MB
**Installation Time:** 5-10 minutes

**What it includes:**
- Docker Engine (containerization)
- Docker Compose (multi-container orchestration)
- Docker Desktop GUI (easy management)

**Installation Steps (Windows):**
```
1. Download Docker Desktop for Windows
2. Run installer (docker-desktop-installer.exe)
3. Accept default settings
4. Complete installation
5. Restart computer
6. Open PowerShell and verify:
   docker --version
   docker-compose --version
```

---

#### 2. **Node.js** (Already installed? Skip if yes)
**Why:** JavaScript runtime for backend
**Download:** https://nodejs.org/
**Recommended:** LTS version (v20+)
**Size:** ~150 MB

**Verify Installation:**
```bash
node --version
npm --version
```

---

#### 3. **Git** (Optional but recommended)
**Why:** Version control & CI/CD integration
**Download:** https://git-scm.com/download/
**Size:** ~300 MB

**Usage:**
```bash
git clone <repo-url>
git commit -m "message"
git push origin main
```

---

### Optional Downloads (Recommended for Later):

#### 4. **Postman** (API Testing)
**Download:** https://www.postman.com/downloads/
**Size:** ~300 MB
**Use:** Test API endpoints without command line

**Example request:**
```
POST http://localhost:5000/api/auth/login
Body: {
  "username": "admin",
  "password": "password"
}
```

---

#### 5. **Visual Studio Code Extensions** (Already have VS Code)
**Extensions to Install:**
- REST Client (for API testing)
- Docker (for container management)
- JSON (for db.json viewing)

**Install in VS Code:**
```
Ctrl+Shift+X (Windows) or Cmd+Shift+X (Mac)
Search: "REST Client"
Click Install
```

---

#### 6. **Jenkins** (For On-Premise CI/CD)
**Download:** https://www.jenkins.io/download/
**Size:** ~300 MB
**Optional:** Only if not using GitHub Actions

---

#### 7. **Prometheus & Grafana** (Advanced Monitoring)
**Included in docker-compose.yml** ✓
No separate download needed

---

## 📋 Installation Checklist

- [ ] Docker Desktop installed & running
  ```bash
  docker --version
  docker-compose --version
  ```

- [ ] Node.js installed (verify: `node --version`)

- [ ] Git installed (optional: `git --version`)

- [ ] Project repository cloned/downloaded
  ```bash
  cd c:\Users\Administrator\Desktop\BlockChain
  ```

- [ ] All dependencies installed
  ```bash
  cd backend
  npm install
  ```

- [ ] Docker services started
  ```bash
  docker-compose up -d
  ```

- [ ] Services verified running
  ```bash
  docker-compose ps
  ```

---

## 🚀 First Run (After Downloads)

### Step 1: Start Docker
```bash
# Open Docker Desktop (first time takes ~2 minutes)
# Wait for status: "Docker is running"
```

### Step 2: Navigate to Project
```bash
cd c:\Users\Administrator\Desktop\BlockChain
```

### Step 3: Start All Services
```bash
docker-compose up -d
# Output should show:
# Creating bcmonitor-backend ... done
# Creating bcmonitor-frontend ... done
# Creating bcmonitor-prometheus ... done
```

### Step 4: Verify Services
```bash
docker-compose ps
# All services should show "Up"

# Also verify:
curl http://localhost:5000/api/health
# Should return 200 OK
```

### Step 5: Access Application
```
Frontend:    http://localhost:3000
Backend:     http://localhost:5000/api/health
Prometheus:  http://localhost:9090
```

---

## 📦 What You Have (Without Docker)

Currently running:
- ✅ Backend server (npm start)
- ❌ Frontend (manually via http-server)
- ❌ Prometheus monitoring
- ❌ Proper containerization

**With Docker:**
- ✅ Backend (containerized)
- ✅ Frontend (Nginx containerized)
- ✅ Prometheus (containerized)
- ✅ Easy scaling & deployment
- ✅ Production-ready setup

---

## 💾 Storage Requirements

| Component | Size |
|-----------|------|
| Docker Engine | 2 GB |
| Docker Images | 500 MB |
| Database (db.json) | 50 KB - 10 MB |
| Node modules | 300 MB |
| Project code | 50 MB |
| **Total** | **~3 GB** |

**Required Free Disk Space:** 5 GB minimum

---

## 🆚 Comparison: With vs Without Docker

| Feature | Without Docker | With Docker |
|---------|---|---|
| Services | Manual install each | One command: `docker-compose up` |
| Monitoring | None | Prometheus included |
| Frontend | http-server | Nginx load balancer |
| Reproducibility | Different per machine | Same everywhere |
| Production-ready | Partial | Complete |
| Scaling | Difficult | Easy with replicas |
| Team deployment | Error-prone | Consistent |

---

## ⚙️ Post-Installation Configuration

After installing Docker, configure:

### 1. Environment Variables (.env)
```bash
# Create file: backend/.env
PORT=5000
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-production
FRONTEND_URL=http://localhost:3000
```

### 2. Database Backup Strategy
```bash
# Create backup directory
mkdir backend/backups

# Backup script (run weekly)
cp backend/db.json backend/backups/db-$(date +%Y%m%d).json
```

### 3. Monitoring Configuration
```bash
# Edit: devops/prometheus.yml
# Add alert rules (optional)
# Configure email notifications (optional)
```

---

## 🆘 Installation Troubleshooting

### Docker Won't Start
```bash
# Solution 1: Restart Docker
# Close Docker Desktop → Click icon again

# Solution 2: Check virtualization enabled
# Windows: Control Panel → Programs → Turn Windows features on/off
# Enable: Hyper-V, Virtual Machine Platform

# Solution 3: Update Windows
# Windows Update → Install latest
```

### Port Already in Use
```bash
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process
taskkill /PID <PID> /F

# Or change port in docker-compose.yml
ports:
  - "5001:5000"  # Change 5000 to 5001
```

### npm install Fails
```bash
# Clear cache
npm cache clean --force

# Reinstall
npm install

# If still fails, try:
rm -rf node_modules package-lock.json
npm install
```

### Docker Image Build Fails
```bash
# Check Dockerfile
cat backend/Dockerfile

# Rebuild
docker build -t bcmonitor-backend:latest ./backend

# If fails, check logs
docker build -t bcmonitor-backend:latest ./backend 2>&1 | tail -50
```

---

## 📊 Verification After Installation

```bash
# 1. Docker running
docker --version
# Expected: Docker version 20.x.x

# 2. All services up
docker-compose ps
# Expected: All "Up"

# 3. Backend responding
curl http://localhost:5000/api/health
# Expected: 200 OK

# 4. Frontend accessible
# Open http://localhost:3000 in browser
# Expected: Login page loads

# 5. Database exists
docker exec bcmonitor-backend ls -lh /app/db.json
# Expected: Shows file size

# 6. All tests passing
cd backend && npm test
# Expected: 0 failures
```

---

## 📚 Next Steps

1. **Download Docker Desktop** (Most important!)
2. **Run `docker-compose up -d`**
3. **Verify all services** (docker-compose ps)
4. **Access http://localhost:3000**
5. **Follow QUICK_START_GUIDE.md** for testing
6. **Review ML_TRAINING_GUIDE.md** for anomaly detection tuning

---

## ✅ Installation Summary

```
ESSENTIAL:
✓ Docker Desktop     → https://www.docker.com/products/docker-desktop
✓ Node.js (if dev)   → https://nodejs.org/

OPTIONAL:
○ Git               → https://git-scm.com/
○ Postman           → https://www.postman.com/
○ VS Code Extensions → Docker, REST Client

INSTALLATION TIME: 15-30 minutes total
DISK SPACE NEEDED: 5 GB free

After installation:
docker-compose up -d
# That's it! ✓
```

---

**Questions?**
1. Check DEVOPS_SETUP.md for detailed DevOps info
2. Check QUICK_START_GUIDE.md for quick reference
3. Check TESTING_GUIDE.md for verification steps
