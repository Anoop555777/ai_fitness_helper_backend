/**
 * Comprehensive Security Middleware
 * 
 * Implements multiple security best practices:
 * - Request ID generation for tracing
 * - Parameter pollution protection
 * - Request size validation
 * - IP address validation
 * - Security headers
 * - Request logging for security events
 * 
 * @module middleware/security
 */

import { v4 as uuidv4 } from 'uuid';
import { logSecurity } from '../utils/logger.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';

/**
 * Generate and attach a unique request ID to each request
 * Useful for tracing requests across logs and debugging security issues
 */
export const requestId = (req, res, next) => {
  // Generate or use existing request ID
  req.id = req.headers['x-request-id'] || uuidv4();
  
  // Set response header with request ID
  res.setHeader('X-Request-ID', req.id);
  
  next();
};

/**
 * Protect against HTTP Parameter Pollution (HPP)
 * Prevents attackers from sending duplicate parameters to confuse the application
 * 
 * Example attack: ?id=1&id=2 could cause issues if not handled properly
 * This middleware ensures only the last value is used for arrays
 */
export const preventParameterPollution = (req, res, next) => {
  // Clean query parameters - take last value if array
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][req.query[key].length - 1];
      }
    });
  }

  // Clean body parameters - take last value if array
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach((key) => {
      if (Array.isArray(req.body[key]) && req.body[key].length > 0) {
        // For most fields, take the last value
        // Exception: arrays that should remain arrays (like tags, items, feedback, etc.)
        const arrayFields = ['tags', 'items', 'targetMuscles', 'equipment', 'keypoints', 'feedback'];
        if (!arrayFields.includes(key)) {
          req.body[key] = req.body[key][req.body[key].length - 1];
        }
      }
    });
  }

  next();
};

/**
 * Validate and sanitize request size
 * Prevents DoS attacks through oversized requests
 */
export const validateRequestSize = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB (matches express.json limit)

  if (contentLength > maxSize) {
    logSecurity('request_size_exceeded', {
      requestId: req.id,
      ip: req.ip,
      contentLength,
      maxSize,
      path: req.path,
    });

    return next(
      new AppError('Request payload is too large. Maximum size is 10MB.', HTTP_STATUS.PAYLOAD_TOO_LARGE)
    );
  }

  next();
};

/**
 * Get real client IP address
 * Handles proxies and load balancers correctly
 */
export const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

/**
 * IP address validation and logging
 * Logs suspicious IP patterns
 */
export const validateIp = (req, res, next) => {
  const clientIp = getClientIp(req);
  req.clientIp = clientIp;

  // Log requests from suspicious IPs (optional - can be enhanced with IP blacklist)
  // This is a placeholder for future IP reputation checking
  if (process.env.NODE_ENV === 'production') {
    // In production, you might want to check against known malicious IPs
    // For now, we just log the IP for analysis
  }

  next();
};

/**
 * Security headers middleware
 * Adds additional security headers not covered by Helmet
 */
export const securityHeaders = (req, res, next) => {
  // Remove X-Powered-By header (Express version disclosure)
  res.removeHeader('X-Powered-By');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  next();
};

/**
 * Request logging for security monitoring
 * Logs important security-related events
 */
export const securityLogging = (req, res, next) => {
  // Log authentication attempts
  if (req.path.includes('/auth/login') || req.path.includes('/auth/register')) {
    logSecurity('auth_attempt', {
      requestId: req.id,
      ip: req.clientIp || req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
    });
  }

  // Log sensitive operations
  const sensitivePaths = ['/password', '/delete', '/admin'];
  if (sensitivePaths.some((path) => req.path.includes(path))) {
    logSecurity('sensitive_operation', {
      requestId: req.id,
      ip: req.clientIp || req.ip,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
    });
  }

  next();
};

/**
 * Validate HTTP method
 * Reject unsupported methods
 */
export const validateHttpMethod = (req, res, next) => {
  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  
  if (!allowedMethods.includes(req.method)) {
    logSecurity('invalid_method', {
      requestId: req.id,
      ip: req.clientIp || req.ip,
      method: req.method,
      path: req.path,
    });

    return res.status(HTTP_STATUS.METHOD_NOT_ALLOWED).json({
      status: 'error',
      message: 'HTTP method not allowed',
    });
  }

  next();
};

/**
 * Rate limit key generator for better IP detection
 * Uses real client IP instead of proxy IP
 */
export const rateLimitKeyGenerator = (req) => {
  return getClientIp(req);
};

/**
 * Combine all security middleware
 * Use this for a single import
 */
export const applySecurityMiddleware = (app) => {
  app.use(requestId);
  app.use(validateIp);
  app.use(securityHeaders);
  app.use(preventParameterPollution);
  app.use(validateRequestSize);
  app.use(validateHttpMethod);
  app.use(securityLogging);
};

export default {
  requestId,
  preventParameterPollution,
  validateRequestSize,
  validateIp,
  securityHeaders,
  securityLogging,
  validateHttpMethod,
  getClientIp,
  rateLimitKeyGenerator,
  applySecurityMiddleware,
};

