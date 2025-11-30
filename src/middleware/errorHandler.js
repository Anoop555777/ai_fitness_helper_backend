/**
 * Global Error Handler Middleware
 * 
 * Centralized error handling for the entire application.
 * This middleware catches all errors and sends appropriate responses
 * based on error type and environment.
 * 
 * Error Types Handled:
 * - AppError (operational errors)
 * - Mongoose validation errors
 * - Mongoose duplicate key errors
 * - Mongoose cast errors (invalid ObjectId)
 * - JWT errors
 * - Multer errors (file upload)
 * - Other unexpected errors
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */

import AppError from '../utils/appError.js';
import { HTTP_STATUS, API_STATUS } from '../config/constants.js';
import { logError } from '../utils/logger.js';

/**
 * Convert technical field names to user-friendly names
 * @param {string} field - Technical field name
 * @returns {string} User-friendly field name
 */
const getFriendlyFieldName = (field) => {
  const fieldMap = {
    email: 'Email address',
    password: 'Password',
    username: 'Username',
    firstName: 'First name',
    lastName: 'Last name',
    height: 'Height',
    weight: 'Weight',
    fitnessLevel: 'Fitness level',
    phone: 'Phone number',
    dateOfBirth: 'Date of birth',
  };
  return fieldMap[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
};

/**
 * Convert technical validation messages to user-friendly messages
 * @param {string} message - Technical validation message
 * @returns {string} User-friendly message
 */
const getUserFriendlyMessage = (message) => {
  // Common Mongoose validation message patterns
  if (message.includes('required')) {
    return 'This field is required';
  }
  if (message.includes('unique')) {
    return 'This value is already taken. Please choose another one.';
  }
  if (message.includes('minlength')) {
    const match = message.match(/minimum length is (\d+)/);
    return match ? `Must be at least ${match[1]} characters long` : 'Too short';
  }
  if (message.includes('maxlength')) {
    const match = message.match(/maximum length is (\d+)/);
    return match ? `Must be no more than ${match[1]} characters long` : 'Too long';
  }
  if (message.includes('enum')) {
    return 'Please select a valid option';
  }
  if (message.includes('email')) {
    return 'Please enter a valid email address';
  }
  if (message.includes('invalid')) {
    return 'Please enter a valid value';
  }
  return message;
};

/**
 * Handle Mongoose validation errors
 * @param {Error} err - Mongoose validation error
 * @returns {AppError} Formatted AppError
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((el) => {
    const fieldName = getFriendlyFieldName(el.path);
    const friendlyMessage = getUserFriendlyMessage(el.message);
    return `${fieldName}: ${friendlyMessage}`;
  });
  
  const message = errors.length === 1 
    ? errors[0]
    : `Please fix the following errors: ${errors.join('. ')}`;
    
  return new AppError(message, HTTP_STATUS.BAD_REQUEST);
};

/**
 * Handle Mongoose duplicate key errors
 * @param {Error} err - Mongoose duplicate key error
 * @returns {AppError} Formatted AppError
 */
const handleDuplicateKeyError = (err) => {
  // Extract field name from error message
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field] || 'value';
  const friendlyFieldName = getFriendlyFieldName(field);
  
  // Special handling for common fields
  if (field === 'email') {
    return new AppError('This email address is already registered. Please use a different email or try logging in.', HTTP_STATUS.CONFLICT);
  }
  if (field === 'username') {
    return new AppError('This username is already taken. Please choose a different username.', HTTP_STATUS.CONFLICT);
  }
  
  const message = `This ${friendlyFieldName.toLowerCase()} is already in use. Please choose a different one.`;
  return new AppError(message, HTTP_STATUS.CONFLICT);
};

/**
 * Handle Mongoose cast errors (invalid ObjectId)
 * @param {Error} err - Mongoose cast error
 * @returns {AppError} Formatted AppError
 */
const handleCastError = (err) => {
  const friendlyPath = getFriendlyFieldName(err.path || 'ID');
  const message = `The ${friendlyPath.toLowerCase()} you provided is not valid. Please check and try again.`;
  return new AppError(message, HTTP_STATUS.BAD_REQUEST);
};

/**
 * Handle JWT errors
 * @param {Error} err - JWT error
 * @returns {AppError} Formatted AppError
 */
const handleJWTError = () => {
  return new AppError('Your session is invalid. Please log in again.', HTTP_STATUS.UNAUTHORIZED);
};

/**
 * Handle JWT expired errors
 * @param {Error} err - JWT expired error
 * @returns {AppError} Formatted AppError
 */
const handleJWTExpiredError = () => {
  return new AppError('Your session has expired. Please log in again to continue.', HTTP_STATUS.UNAUTHORIZED);
};

/**
 * Handle Multer errors (file upload)
 * @param {Error} err - Multer error
 * @returns {AppError} Formatted AppError
 */
const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('The file you uploaded is too large. Please choose a smaller file.', HTTP_STATUS.BAD_REQUEST);
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('You can only upload one file at a time. Please try again with a single file.', HTTP_STATUS.BAD_REQUEST);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('There was an issue with the file upload. Please try again.', HTTP_STATUS.BAD_REQUEST);
  }
  return new AppError('Unable to upload the file. Please check the file format and try again.', HTTP_STATUS.BAD_REQUEST);
};

/**
 * Send error response in development mode
 * @param {Error} err - Error object
 * @param {Object} res - Express response object
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    status: err.status || API_STATUS.ERROR,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Convert technical error messages to user-friendly messages in production
 * @param {string} message - Technical error message
 * @returns {string} User-friendly message
 */
const sanitizeErrorMessage = (message) => {
  // Remove technical details that users don't need to see
  let sanitized = message;
  
  // Remove stack traces or file paths if accidentally included
  sanitized = sanitized.replace(/at\s+.*/g, '');
  sanitized = sanitized.replace(/\(.*:\d+:\d+\)/g, '');
  
  // Remove technical prefixes
  sanitized = sanitized.replace(/^Error:\s*/i, '');
  sanitized = sanitized.replace(/^ValidationError:\s*/i, '');
  
  // Clean up common technical patterns
  sanitized = sanitized.replace(/Cast to.*failed/gi, 'Invalid value provided');
  sanitized = sanitized.replace(/Path\s+`(\w+)`\s+is\s+required/gi, (match, field) => {
    return `${getFriendlyFieldName(field)} is required`;
  });
  
  return sanitized.trim();
};

/**
 * Send error response in production mode
 * @param {Error} err - Error object (AppError or generic Error)
 * @param {Object} res - Express response object
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send user-friendly message to client
  if (err.isOperational) {
    // Sanitize the message to ensure it's user-friendly
    const userMessage = sanitizeErrorMessage(err.message);
    
    res.status(err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: err.status || API_STATUS.ERROR,
      message: userMessage,
    });
  } else {
    // Programming or other unknown error: don't leak error details
    // Log error for debugging (with full technical details)
    logError('Unexpected error', {
      error: err.message,
      stack: err.stack,
      name: err.name,
    });

    // Send generic, user-friendly message
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: API_STATUS.ERROR,
      message: 'We encountered an unexpected error. Please try again later or contact support if the problem persists.',
    });
  }
};

/**
 * Global Error Handler Middleware
 * 
 * This middleware must be placed after all routes and middleware.
 * It catches all errors and processes them appropriately.
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function (required for Express to recognize this as error handler)
 */
const globalErrorHandler = (err, req, res, next) => {
  // Set default status code and status
  err.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  err.status = err.status || API_STATUS.ERROR;

  // Log error for debugging
  logError('Error occurred', {
    error: err.message,
    statusCode: err.statusCode,
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
    name: err.name,
    isOperational: err.isOperational,
  });

  // Handle different error types
  let error = { ...err };
  error.message = err.message;

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  }
  // Handle Mongoose cast errors (invalid ObjectId)
  else if (err.name === 'CastError') {
    error = handleCastError(err);
  }
  // Handle duplicate key errors
  else if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }
  // Handle JWT expired errors
  else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }
  // Handle Multer errors (file upload)
  else if (err.name === 'MulterError') {
    error = handleMulterError(err);
  }

  // Send error response based on environment
  if (process.env.NODE_ENV === 'development') {
    // In development, send detailed error information including stack trace
    sendErrorDev(error, res);
  } else {
    // In production, send sanitized error messages
    sendErrorProd(error, res);
  }
};

export default globalErrorHandler;
