const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const transactionRoutes = require('./routes/transactions');
const adminRoutes = require('./routes/admin');
const alertRoutes = require('./routes/alerts');
const helpRoutes = require('./routes/help');
const postgresRoutes = require('./routes/postgres');
const database = require('./utils/database');
const realtime = require('./utils/realtime');
const { getChainStatus } = require('./utils/blockchain');
const clientMetrics = require('prom-client');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const requestCounter = new clientMetrics.Counter({ name: 'tranzsafely_http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] });
clientMetrics.collectDefaultMetrics({ prefix: 'tranzsafely_' });
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: '*', // Allow all origins for development
  credentials: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

// Stricter limit on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' }
});
app.use('/api/auth/', authLimiter);

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.on('finish', () => requestCounter.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode }));
  next();
});

if (database.isEnabled()) app.use('/api', postgresRoutes);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/help', helpRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    system: 'Blockchain Security Monitor'
  });
});

app.get('/api/blockchain/status', async (req, res) => {
  try {
    res.json(await getChainStatus());
  } catch (error) {
    res.status(503).json({ enabled: true, status: 'unavailable', error: error.message });
  }
});

app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', clientMetrics.register.contentType);
  res.end(await clientMetrics.register.metrics());
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

realtime.attach(server);

database.initializeDatabase()
  .then(() => server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Blockchain Monitor Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://<YOUR_IP>:${PORT}/api/health`);
  console.log(`\n🔑 Default Credentials:`);
  console.log(`   Admin  → username: admin     | password: password`);
  console.log(`   User 1 → username: junaid    | password: password`);
  console.log(`   User 2 → username: rajesh    | password: password`);
  console.log(`   User 3 → username: sharanagouda | password: password\n`);
  console.log(`   Database → ${database.isEnabled() ? 'PostgreSQL (shared)' : 'LowDB (local fallback)'}`);
  }))
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

module.exports = app;
