import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Winston Logger Configuration
 * 
 * Lightweight logger setup for the application with:
 * - Console logging in development
 * - File logging in production
 * - Different log levels (error, warn, info, debug)
 * - Colorized output for better readability
 * - Timestamp formatting
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format (for development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define transports
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? format : consoleFormat,
  }),
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      format: format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file (all levels)
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      format: format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create a stream object for Morgan HTTP request logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Logger utility functions
 * 
 * Provides convenient methods for logging at different levels
 */
export const logError = (message, error = null) => {
  if (error) {
    logger.error(message, {
      error: error.message,
      stack: error.stack,
      ...(error.statusCode && { statusCode: error.statusCode }),
    });
  } else {
    logger.error(message);
  }
};

export const logWarn = (message, meta = {}) => {
  logger.warn(message, Object.keys(meta).length > 0 ? meta : undefined);
};

export const logInfo = (message, meta = {}) => {
  logger.info(message, Object.keys(meta).length > 0 ? meta : undefined);
};

export const logDebug = (message, meta = {}) => {
  logger.debug(message, Object.keys(meta).length > 0 ? meta : undefined);
};

export const logHttp = (message, meta = {}) => {
  logger.http(message, Object.keys(meta).length > 0 ? meta : undefined);
};

/**
 * Log API request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in ms
 */
export const logRequest = (req, res, responseTime) => {
  const { method, url, ip } = req;
  const { statusCode } = res;
  const message = `${method} ${url} ${statusCode} - ${responseTime}ms - ${ip}`;
  
  if (statusCode >= 500) {
    logger.error(message, { method, url, statusCode, responseTime, ip });
  } else if (statusCode >= 400) {
    logger.warn(message, { method, url, statusCode, responseTime, ip });
  } else {
    logger.http(message, { method, url, statusCode, responseTime, ip });
  }
};

/**
 * Log database operation
 * @param {string} operation - Operation type (e.g., 'find', 'create', 'update')
 * @param {string} model - Model name
 * @param {Object} meta - Additional metadata
 */
export const logDatabase = (operation, model, meta = {}) => {
  const message = `DB ${operation.toUpperCase()}: ${model}`;
  logger.debug(message, { operation, model, ...meta });
};

/**
 * Log authentication event
 * @param {string} event - Event type (e.g., 'login', 'logout', 'register')
 * @param {string} userId - User ID
 * @param {Object} meta - Additional metadata
 */
export const logAuth = (event, userId, meta = {}) => {
  const message = `AUTH ${event.toUpperCase()}: User ${userId}`;
  logger.info(message, { event, userId, ...meta });
};

/**
 * Log security event
 * @param {string} event - Security event type (e.g., 'auth_attempt', 'suspicious_activity')
 * @param {Object} meta - Additional metadata (ip, requestId, path, etc.)
 */
export const logSecurity = (event, meta = {}) => {
  const message = `SECURITY ${event.toUpperCase()}`;
  logger.warn(message, { event, ...meta });
};

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export const logErrorWithContext = (error, context = {}) => {
  logger.error(error.message, {
    error: error.message,
    stack: error.stack,
    ...(error.statusCode && { statusCode: error.statusCode }),
    ...(error.isOperational && { isOperational: error.isOperational }),
    ...context,
  });
};

// Export default logger instance
export default logger;

