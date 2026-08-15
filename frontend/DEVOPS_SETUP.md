# DevOps Setup Guide - Blockchain Security Monitor

## 📋 Project Goals Alignment

### Goal 1: Secure Blockchain Monitoring with DevOps ✅
- Continuous monitoring via Prometheus & health checks
- Multi-container deployment with Docker Compose
- Automated CI/CD pipelines (GitHub Actions + Jenkins)
- Real-time alerting system for security events

### Goal 2: Blockchain Transaction Anomaly Detection ✅
- ML-powered fraud detection in `backend/ml/anomalyDetector.js`
- Real-time transaction monitoring
- Alert management system
- Suspicion scoring (0.0-1.0 scale)

### Goal 3: CI/CD Integration ✅
- Automated testing & deployment
- Docker containerization
- Health checks & monitoring
- Quick rollout & rollback capability

---

## 🐳 Docker & Docker Compose Setup

### Prerequisites to Download:
```bash
# Download and install these:
1. Docker Desktop (includes Docker + Docker Compose)
   - Windows: https://www.docker.com/products/docker-desktop
   - Mac: https://www.docker.com/products/docker-desktop
   - Linux: sudo apt-get install docker-ce docker-compose

2. Optional but recommended:
   - Postman (API testing): https://www.postman.com/downloads/
   - Git: https://git-scm.com/download/
```

### Verify Installation:
```bash
docker --version
docker-compose --version
node --version
npm --version
```

---

## 🚀 Running with Docker Compose

### Start All Services:
```bash
cd c:\Users\Administrator\Desktop\BlockChain
docker-compose up -d
```

### What This Deploys:
```
Backend API          → http://localhost:5000
Frontend (Nginx)     → http://localhost:3000
Prometheus (Monitor) → http://localhost:9090
Grafana (Dashboard)  → http://localhost:3001
```

### Access Services:
```
Backend Health:  curl http://localhost:5000/api/health
Frontend:        Open http://localhost:3000 in browser
```

### Check Service Status:
```bash
docker-compose ps
docker logs bcmonitor-backend
docker logs bcmonitor-frontend
docker logs bcmonitor-prometheus
```

### Stop All Services:
```bash
docker-compose down
docker-compose down -v  # Also remove volumes
```

---

## 📊 Prometheus Monitoring

### Current Configuration
File: `devops/prometheus.yml`

Monitors:
- Backend API metrics
- Container health
- System performance

### View Metrics:
1. Open http://localhost:9090
2. Query examples:
   - `up{job="prometheus"}` - Service status
   - `container_memory_usage_bytes` - Memory usage
   - `rate(http_requests_total[5m])` - Request rate

### Add Custom Metrics:
Backend exposes metrics at `/api/health`:
```json
{
  "status": "ok",
  "timestamp": "2024-06-14T10:30:00.000Z",
  "version": "1.0.0",
  "system": "Blockchain Security Monitor"
}
```

---

## 🔄 CI/CD Pipelines

### GitHub Actions (ci-cd.yml)
**Triggers on:** Push to `main` or `develop` branches

**Steps:**
1. ✅ Install dependencies
2. 🧪 Run tests
3. 🔍 Security audit (npm audit)
4. 🐳 Build Docker image
5. 🚀 Deploy services
6. 💓 Health check

### Jenkins Pipeline (Jenkinsfile)
**Stages:**
1. 📥 Checkout code
2. 📦 Install dependencies
3. 🧪 Run tests
4. 🔍 Security scan
5. 🐳 Build Docker image
6. 📤 Push to registry
7. 🚀 Deploy to production

### Running Locally:
```bash
# Install Jenkins (optional for local testing)
# OR manually run the stages:

cd backend
npm ci                          # Step 1: Install
npm test -- --passWithNoTests   # Step 2: Test
npm audit --audit-level=high    # Step 3: Audit
```

---

## 🔒 Security Best Practices

### Implemented:
- ✅ CORS protection
- ✅ Helmet security headers
- ✅ Rate limiting (15 min windows)
- ✅ Password hashing (bcryptjs)
- ✅ JWT token authentication
- ✅ Admin role verification
- ✅ Transaction validation

### Environment Variables (.env):
```bash
# Create backend/.env
PORT=5000
NODE_ENV=production
JWT_SECRET=your-super-secret-key-change-in-production
FRONTEND_URL=http://localhost:3000
```

### Database Security:
- Data persisted in `backend/db.json`
- Mount as volume in Docker: `./backend/db.json:/app/db.json`
- Backup daily: `docker cp bcmonitor-backend:/app/db.json ./backups/db-$(date +%Y%m%d).json`

---

## 📈 Scaling & Production Deployment

### For Production:
```yaml
# docker-compose.prod.yml
services:
  backend:
    image: your-registry/bcmonitor-backend:latest
    restart: always
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
    deploy:
      replicas: 3  # Scale to 3 instances
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

### Deploy to Cloud:
```bash
# AWS ECS
aws ecs create-service --cluster blockchain-monitor --service-name api --task-definition bcmonitor-backend

# Kubernetes
kubectl apply -f k8s-deployment.yaml

# Docker Swarm
docker swarm init
docker stack deploy -c docker-compose.yml bcmonitor
```

---

## 🔧 Health Checks & Monitoring

### Backend Health Check:
```bash
curl http://localhost:5000/api/health
```

### Monitor Logs:
```bash
# Real-time backend logs
docker logs -f bcmonitor-backend

# View container stats
docker stats bcmonitor-backend

# Check database size
ls -lh backend/db.json
```

### Alerts Configuration:
Edit `devops/prometheus.yml` to add alert rules:
```yaml
groups:
  - name: blockchain_monitor
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
```

---

## 📝 Database Management

### Backup Database:
```bash
# Manual backup
cp backend/db.json backend/backups/db-backup-$(date +%Y%m%d-%H%M%S).json

# Automated backup (add to cron)
0 2 * * * cp /blockchain-monitor/backend/db.json /backups/db-$(date +\%Y\%m\%d).json
```

### Reset Database:
```bash
# Remove all data and reinitialize
rm backend/db.json
docker restart bcmonitor-backend
```

### Export Data:
```bash
# Convert db.json to CSV for analysis
node backend/scripts/export-to-csv.js
```

---

## ✅ Deployment Checklist

- [ ] Docker installed and running
- [ ] All environment variables set (.env file)
- [ ] Database volume mount configured
- [ ] Prometheus scrape targets configured
- [ ] Health checks passing
- [ ] CI/CD pipeline tested
- [ ] Security audit passed
- [ ] Backup strategy implemented
- [ ] Monitoring dashboard configured
- [ ] Team trained on deployment process

---

## 🆘 Troubleshooting

### Port Already in Use:
```bash
# Find what's using port 5000
lsof -i :5000
# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Container Won't Start:
```bash
docker logs bcmonitor-backend
docker inspect bcmonitor-backend
```

### Out of Disk Space:
```bash
docker system prune
docker system prune -a  # More aggressive
```

### Network Issues:
```bash
docker network ls
docker network inspect bcmonitor-net
```

---

**Next Steps:**
1. ✅ Install Docker Desktop
2. ✅ Run `docker-compose up -d`
3. ✅ Check http://localhost:5000/api/health
4. ✅ Review ML training guide for anomaly detection
