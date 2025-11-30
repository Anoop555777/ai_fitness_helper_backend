/**
 * Rate Limiting Middleware
 * 
 * Protects the API from abuse by limiting the number of requests
 * from a single IP address within a specified time window.
 * 
 * Uses express-rate-limit to implement sliding window rate limiting.
 * 
 * Configuration:
 * - Window: 15 minutes (default)
 * - Max requests: 100 per window (default)
 * - Message: Custom error message when limit is exceeded
 * 
 * @module middleware/rateLimiter
 */

import rateLimit from 'express-rate-limit';
import { RATE_LIMIT, API_STATUS } from '../config/constants.js';
import { logInfo } from '../utils/logger.js';

/**
 * Standard rate limiter for general API routes
 * 
 * Limits: 100 requests per 15 minutes per IP
 * 
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes
  max: RATE_LIMIT.MAX_REQUESTS, // Limit each IP to 100 requests per windowMs
  message: {
    status: API_STATUS.FAIL,
    message: RATE_LIMIT.MESSAGE,
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Custom handler for rate limit exceeded
  handler: (req, res, next, options) => {
    logInfo('Rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });

    res.status(429).json({
      status: API_STATUS.FAIL,
      message: options.message.message || RATE_LIMIT.MESSAGE,
      retryAfter: Math.ceil(options.windowMs / 1000), // Retry after in seconds
    });
  },
  // Skip rate limiting for successful requests (optional optimization)
  skipSuccessfulRequests: false,
  // Skip rate limiting for failed requests (optional optimization)
  skipFailedRequests: false,
});

/**
 * Strict rate limiter for authentication routes
 * 
 * Limits: 
 * - Development: 50 requests per 15 minutes per IP (more lenient for testing)
 * - Production: 5 requests per 15 minutes per IP (strict for security)
 * 
 * Use this for login, registration, password reset, etc.
 * 
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 50 : 5, // More lenient in development
  message: {
    status: API_STATUS.FAIL,
    message: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logInfo('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      environment: process.env.NODE_ENV,
    });

    res.status(429).json({
      status: API_STATUS.FAIL,
      message: options.message.message || 'Too many authentication attempts. Please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Lenient rate limiter for logout operations
 * 
 * Limits: 20 requests per 15 minutes per IP
 * - Skip successful requests (don't count successful logouts)
 * - More lenient than authRateLimiter since logout isn't security-sensitive
 * 
 * Use this for logout endpoints to prevent blocking users from logging out.
 * 
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const logoutRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes
  max: 20, // 20 logout attempts per 15 minutes (more lenient)
  message: {
    status: API_STATUS.FAIL,
    message: 'Too many logout attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logInfo('Logout rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });

    res.status(429).json({
      status: API_STATUS.FAIL,
      message: options.message.message || 'Too many logout attempts. Please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
  skipSuccessfulRequests: true, // Don't count successful logouts against rate limit
  skipFailedRequests: false,
});

/**
 * Lenient rate limiter for read-only operations
 * 
 * Limits: 200 requests per 15 minutes per IP
 * 
 * Use this for GET requests that don't modify data.
 * 
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const readRateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    status: API_STATUS.FAIL,
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logInfo('Read rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });

    res.status(429).json({
      status: API_STATUS.FAIL,
      message: options.message.message || 'Too many requests. Please slow down.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Upload rate limiter for file uploads
 * 
 * Limits: 10 uploads per hour per IP
 * 
 * Use this for video/image upload endpoints.
 * 
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: {
    status: API_STATUS.FAIL,
    message: 'Too many file uploads. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logInfo('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });

    res.status(429).json({
      status: API_STATUS.FAIL,
      message: options.message.message || 'Too many file uploads. Please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000),
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Create a custom rate limiter with specified options
 * 
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests
 * @param {string} options.message - Error message
 * @returns {import('express-rate-limit').RateLimitRequestHandler} Rate limiter instance
 */
export const createRateLimiter = (options) => {
  const {
    windowMs = RATE_LIMIT.WINDOW_MS,
    max = RATE_LIMIT.MAX_REQUESTS,
    message = RATE_LIMIT.MESSAGE,
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: {
      status: API_STATUS.FAIL,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, opts) => {
      logInfo('Custom rate limit exceeded', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        windowMs,
        max,
      });

      res.status(429).json({
        status: API_STATUS.FAIL,
        message: opts.message.message || message,
        retryAfter: Math.ceil(opts.windowMs / 1000),
      });
    },
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  });
};

// Default export (standard rate limiter)
export default rateLimiter;
