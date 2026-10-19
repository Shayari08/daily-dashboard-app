require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const passport = require('./config/passport');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');
const { metricsMiddleware, metricsHandler } = require('./middleware/metrics');
const pool = require('./config/db');
const startLocalDatabase = require('./config/localDb');

const PgSession = connectPgSimple(session);

const initDatabase = require('./scripts/initDatabase');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks-enhanced');
const assistantRoutes = require('./routes/assistant');
const profileRoutes = require('./routes/profile');
const insightsRoutes = require('./routes/insights');
const onboardingRoutes = require('./routes/onboarding');

const chatRoutes = require('./routes/chat');
const archiveRoutes = require('./routes/archive');
const recurringGoalsRoutes = require('./routes/recurring-goals');
const recommendationsRoutes = require('./routes/recommendations');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Metrics middleware (before other middlewares)
app.use(metricsMiddleware);
// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
// Local single-user mode: the dashboard easily exceeds 100 requests/15min on its own
if (process.env.LOCAL_AUTH_BYPASS !== 'true') {
  app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  next();
});

// Session configuration — backed by PostgreSQL so sessions survive server restarts
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true   // auto-creates the session table on first run
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    sameSite: 'lax'
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Local single-user bypass: skips OAuth entirely for local/offline use.
// Leaves passport/OAuth routes untouched for the hosted (Render) deployment.
const LOCAL_USER_EMAIL = 'local@dashboard.local';
if (process.env.LOCAL_AUTH_BYPASS === 'true') {
  app.use(async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [LOCAL_USER_EMAIL]);
      req.user = result.rows[0];
      req.isAuthenticated = () => true;
      next();
    } catch (err) {
      next(err);
    }
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/recurring-goals', recurringGoalsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
// Metrics endpoint
app.get('/metrics', metricsHandler);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
// Serve React frontend static files (production only)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/metrics') return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.logError(err, req);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

let server;
let localDb;
startLocalDatabase()
  .then((db) => {
    localDb = db;
    return initDatabase(pool);
  })
  .then(() => {
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Metrics available at http://localhost:${PORT}/metrics`);
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} signal received: closing HTTP server`);
  const closeDb = async () => {
    await pool.end();
    logger.info('Database pool closed');
    if (localDb) await localDb.stop();
    process.exit(0);
  };
  if (server) server.close(closeDb);
  else closeDb();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

