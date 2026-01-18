const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),
  
  // Error log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Combined log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true
  }),
  
  // Access log file
  new DailyRotateFile({
    filename: path.join(logsDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    format: logFormat,
    maxSize: '20m',
    maxFiles: '7d',
    zippedArchive: true
  })
];

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
});

// Add custom log levels
logger.addColors = winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
});

// Stream for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Helper functions
logger.logRequest = (req, res, duration) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
};

logger.logError = (error, req = null) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  };
  
  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      user: req.user?.id
    };
  }
  
  logger.error('Application Error', errorLog);
};

logger.logLLM = (operation, duration, status) => {
  logger.info('LLM Request', {
    operation,
    duration: `${duration}ms`,
    status
  });
};

logger.logDatabaseQuery = (query, duration) => {
  logger.debug('Database Query', {
    query: query.substring(0, 100),
    duration: `${duration}ms`
  });
};

module.exports = logger;
