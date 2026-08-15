# 🚀 Blockchain Monitor - Public Deployment Guide

This guide will help you deploy your Blockchain Security Monitor to the public internet using **Railway.app**.

---

## **📋 Prerequisites**

- [GitHub Account](https://github.com) (free)
- [Railway.app Account](https://railway.app) (free tier available)
- Your code pushed to GitHub

---

## **Step 1: Push Your Project to GitHub**

### 1.1 Initialize Git (if not already done)

```powershell
cd c:\Users\Vaishnavi Padashetty\Desktop\BlockChain
git init
git add .
git commit -m "Initial commit: Blockchain monitoring system"
git branch -M main
```

### 1.2 Create GitHub Repo

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository called `blockchain-monitor`
3. Copy the push commands and run them:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/blockchain-monitor.git
git push -u origin main
```

---

## **Step 2: Deploy Backend on Railway**

### 2.1 Sign Up & Create Project

1. Go to **[Railway.app](https://railway.app)**
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway with GitHub
5. Select your `blockchain-monitor` repository

### 2.2 Configure Backend Service

Railway should auto-detect the Dockerfile. If not:

1. Click **"Deploy"** → Let it build automatically
2. Once deployed, go to **Settings** → **Generate Domain**
3. Copy your backend domain (e.g., `blockchain-monitor-prod-xxxx.railway.app`)

### 2.3 Set Environment Variables

In Railway Dashboard:

1. Go to **Variables** tab
2. Add these variables:

```
PORT=5000
NODE_ENV=production
JWT_SECRET=your-super-secret-key-change-this-12345
FRONTEND_URL=https://your-frontend-domain-here.railway.app
```

⚠️ **IMPORTANT:** Change `JWT_SECRET` to something unique!

---

## **Step 3: Deploy Frontend on Railway**

### 3.1 Create Separate Service

In your Railway project:

1. Click **"+ Add Service"**
2. Select **"Blank Service"**
3. Click **"Dockerfile"** → Select your `frontend/Dockerfile`
4. Click **"Deploy"**

### 3.2 Configure Frontend

1. Go to **Variables** tab
2. Set the backend URL:

```
BACKEND_URL=https://your-backend-domain.railway.app/api
PORT=3000
```

Replace `your-backend-domain` with your actual backend Railway domain from Step 2.3

3. Generate a domain for frontend too (click **"Generate Domain"**)

---

## **Step 4: Update CORS in Backend**

Your backend already has `CORS` enabled for all origins. If you want to restrict it:

Edit **[backend/server.js](backend/server.js)** and update:

```javascript
app.use(cors({
  origin: ['https://your-frontend-domain.railway.app'],
  credentials: true
}));
```

Then push to GitHub:

```powershell
git add .
git commit -m "Update CORS for production"
git push
```

Railway will auto-redeploy!

---

## **Step 5: Test Your Deployment**

### 5.1 Test Backend

Visit: `https://your-backend-domain.railway.app/api/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "2026-08-15T...",
  "version": "1.0.0",
  "system": "Blockchain Security Monitor"
}
```

### 5.2 Test Frontend

Visit: `https://your-frontend-domain.railway.app`

You should see the login page!

### 5.3 Login Test

Use credentials:
- **Username:** `admin` or `junaid`
- **Password:** `password`

---

## **Step 6: Access from Mobile/Other Devices**

1. Open your mobile browser
2. Go to: `https://your-frontend-domain.railway.app`
3. Login and use the app!

✅ **It works from anywhere with internet!**

---

## **🔐 Security Checklist**

Before going live:

- [ ] Change `JWT_SECRET` in backend `.env`
- [ ] Change default passwords (`admin/password`, `junaid/password`)
- [ ] Enable CORS only for your frontend domain
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (Railway provides this automatically ✅)
- [ ] Set up rate limiting (already configured ✅)

---

## **📱 Share Public Link**

Your frontend URL is your public link:

```
https://your-frontend-domain.railway.app
```

Share this link with anyone to access your blockchain monitor!

---

## **💰 Cost & Limitations**

| Plan | Cost | Usage |
|------|------|-------|
| **Free Tier** | $0/month | 5GB bandwidth/month |
| **Pro** | $5/month (credit) | More resources |

✅ Free tier is perfect for development/demo!

---

## **🔧 Troubleshooting**

### **Frontend says "Cannot connect to backend"**

1. Check backend domain is correct in `BACKEND_URL`
2. Check backend is running (visit `/api/health`)
3. Check CORS settings in backend/server.js

### **Login doesn't work**

1. Check backend logs in Railway dashboard
2. Verify JWT_SECRET is set correctly
3. Check database (`db.json`) exists

### **Deployment stuck or failed**

1. Check Railway **Build Logs** for errors
2. Check **Deployment** tab for status
3. Redeploy manually if needed

---

## **🎉 Congratulations!**

Your blockchain monitor is now **live on the internet!** 🌐

Celebrate with your team! 🚀

---

## **Next Steps**

- Set up custom domain (e.g., blockchain.example.com)
- Monitor analytics in Railway dashboard
- Set up automated backups for db.json
- Add more features and push to GitHub!

For help: [Railway Docs](https://docs.railway.app)
