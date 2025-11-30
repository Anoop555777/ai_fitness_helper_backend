/**
 * Request Sanitization Middleware
 * 
 * Sanitizes request data to prevent MongoDB injection attacks (NoSQL injection).
 * 
 * This middleware removes MongoDB operators (like $gt, $ne, $where, etc.) from
 * user input that could be used to manipulate database queries.
 * 
 * XSS protection is handled by:
 * 1. Helmet middleware (HTTP security headers)
 * 2. Frontend HTML escaping when rendering user input
 * 
 * This middleware should be applied after body parsing to sanitize parsed data.
 * 
 * @module middleware/sanitization
 */

import mongoSanitize from 'mongo-sanitize';

/**
 * Recursively sanitize an object to prevent MongoDB injection
 * Removes keys that start with '$' (MongoDB operators) and sanitizes nested objects
 * 
 * @param {*} obj - Object to sanitize
 * @returns {*} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      // Remove keys that start with '$' (MongoDB operators like $gt, $ne, $where, etc.)
      if (key.startsWith('$')) {
        continue;
      }
      sanitized[key] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }

  return obj;
};

/**
 * MongoDB sanitization middleware
 * 
 * Sanitizes:
 * - req.body (request body)
 * - req.query (query parameters)
 * - req.params (route parameters)
 * 
 * Prevents NoSQL injection attacks by:
 * 1. Using mongo-sanitize to remove MongoDB operators
 * 2. Recursively removing any keys starting with '$' from objects
 * 
 * Example attack prevented:
 * - Malicious input: { "$gt": "" } in email field
 * - After sanitization: {} (empty object, safe)
 */
export const sanitizeRequest = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    req.body = mongoSanitize(req.body);
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = mongoSanitize(req.query);
    req.query = sanitizeObject(req.query);
  }

  // Sanitize route parameters
  if (req.params) {
    req.params = mongoSanitize(req.params);
    req.params = sanitizeObject(req.params);
  }

  next();
};

export default sanitizeRequest;

