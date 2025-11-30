import { API_STATUS, HTTP_STATUS } from '../config/constants.js';

/**
 * AppError - Custom Error Class for Operational Errors
 * 
 * Extends the native Error class to create custom application errors
 * with status codes and operational flags. These errors are expected
 * and can be handled gracefully by the error handling middleware.
 * 
 * @class AppError
 * @extends Error
 * 
 * @example
 * // Throw a 404 error
 * throw new AppError('User not found', 404);
 * 
 * @example
 * // Throw a 400 error
 * throw new AppError('Invalid input data', 400);
 * 
 * @example
 * // Use with constants
 * import { HTTP_STATUS } from '../config/constants.js';
 * throw new AppError('Unauthorized access', HTTP_STATUS.UNAUTHORIZED);
 */
class AppError extends Error {
  /**
   * Creates an instance of AppError
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   */
  constructor(message, statusCode) {
    super(message);
    
    this.statusCode = statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    
    // Determine status based on status code
    // 4xx = 'fail', 5xx = 'error'
    this.status = `${this.statusCode}`.startsWith('4') 
      ? API_STATUS.FAIL 
      : API_STATUS.ERROR;
    
    // Mark as operational error (expected, can be handled)
    this.isOperational = true;
    
    // Capture stack trace (exclude this constructor from stack)
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;

