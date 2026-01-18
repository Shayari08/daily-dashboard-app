const promClient = require('prom-client');
const responseTime = require('response-time');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const llmRequestDuration = new promClient.Histogram({
  name: 'llm_request_duration_seconds',
  help: 'Duration of LLM requests in seconds',
  labelNames: ['model', 'operation'],
  buckets: [1, 3, 5, 10, 15, 30, 60]
});

const llmRequestTotal = new promClient.Counter({
  name: 'llm_requests_total',
  help: 'Total number of LLM requests',
  labelNames: ['model', 'operation', 'status']
});

const tasksCreatedTotal = new promClient.Counter({
  name: 'tasks_created_total',
  help: 'Total number of tasks created',
  labelNames: ['created_by']
});

const tasksCompletedTotal = new promClient.Counter({
  name: 'tasks_completed_total',
  help: 'Total number of tasks completed'
});

const habitsTrackedTotal = new promClient.Counter({
  name: 'habits_tracked_total',
  help: 'Total number of habit logs recorded'
});

const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of currently active users'
});

const databaseConnectionPool = new promClient.Gauge({
  name: 'database_connection_pool',
  help: 'Database connection pool status',
  labelNames: ['status']
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(llmRequestDuration);
register.registerMetric(llmRequestTotal);
register.registerMetric(tasksCreatedTotal);
register.registerMetric(tasksCompletedTotal);
register.registerMetric(habitsTrackedTotal);
register.registerMetric(activeUsers);
register.registerMetric(databaseConnectionPool);

// Middleware to track HTTP metrics
const metricsMiddleware = responseTime((req, res, time) => {
  if (req.route) {
    const route = req.route.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Record request duration
    httpRequestDuration
      .labels(method, route, statusCode)
      .observe(time / 1000); // Convert to seconds

    // Increment request counter
    httpRequestTotal
      .labels(method, route, statusCode)
      .inc();
  }
});

// Track LLM requests
function trackLLMRequest(model, operation, duration, status) {
  llmRequestDuration
    .labels(model, operation)
    .observe(duration);
  
  llmRequestTotal
    .labels(model, operation, status)
    .inc();
}

// Track task operations
function trackTaskCreated(createdBy) {
  tasksCreatedTotal
    .labels(createdBy)
    .inc();
}

function trackTaskCompleted() {
  tasksCompletedTotal.inc();
}

// Track habit logs
function trackHabitLogged() {
  habitsTrackedTotal.inc();
}

// Update active users count
function updateActiveUsers(count) {
  activeUsers.set(count);
}

// Update database connection pool
function updateDatabasePool(idle, total) {
  databaseConnectionPool.labels('idle').set(idle);
  databaseConnectionPool.labels('total').set(total);
}

// Metrics endpoint handler
async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  trackLLMRequest,
  trackTaskCreated,
  trackTaskCompleted,
  trackHabitLogged,
  updateActiveUsers,
  updateDatabasePool,
  register
};
