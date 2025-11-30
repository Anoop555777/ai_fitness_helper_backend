import mongoose from 'mongoose';
import {
  USERNAME,
  PASSWORD,
  EMAIL,
  VALIDATION_PATTERNS,
  USER_ROLES_ARRAY,
  FITNESS_LEVELS_ARRAY,
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY_ARRAY,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY_ARRAY,
} from '../config/constants.js';

/**
 * Input Validation Utilities
 * 
 * Collection of validation functions for common input types used throughout
 * the application. These validators can be used in middleware, controllers,
 * and services to validate user input before processing.
 */

// ============================================
// EMAIL VALIDATION
// ============================================

/**
 * Validate email address
 * @param {string} email - Email address to validate
 * @returns {Object} Validation result { valid: boolean, error: string|null }
 * @example
 * validateEmail('user@example.com') // { valid: true, error: null }
 * validateEmail('invalid') // { valid: false, error: 'Invalid email format' }
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required and must be a string' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return { valid: false, error: 'Email cannot be empty' };
  }

  if (!EMAIL.PATTERN.test(trimmedEmail)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Additional checks
  if (trimmedEmail.length > 254) {
    return { valid: false, error: 'Email is too long (max 254 characters)' };
  }

  return { valid: true, error: null, normalized: trimmedEmail };
};

// ============================================
// USERNAME VALIDATION
// ============================================

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} Validation result { valid: boolean, error: string|null }
 */
export const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required and must be a string' };
  }

  const trimmedUsername = username.trim();
  if (!trimmedUsername) {
    return { valid: false, error: 'Username cannot be empty' };
  }

  if (trimmedUsername.length < USERNAME.MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${USERNAME.MIN_LENGTH} characters` };
  }

  if (trimmedUsername.length > USERNAME.MAX_LENGTH) {
    return { valid: false, error: `Username cannot exceed ${USERNAME.MAX_LENGTH} characters` };
  }

  if (!USERNAME.PATTERN.test(trimmedUsername)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }

  return { valid: true, error: null, normalized: trimmedUsername };
};

// ============================================
// PASSWORD VALIDATION
// ============================================

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[], strength: string }
 */
export const validatePassword = (password) => {
  const errors = [];
  let strength = 'weak';

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required and must be a string'], strength: 'weak' };
  }

  if (password.length < PASSWORD.MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD.MIN_LENGTH} characters`);
  }

  if (PASSWORD.REQUIRE_UPPERCASE && !VALIDATION_PATTERNS.PASSWORD.HAS_UPPERCASE.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD.REQUIRE_LOWERCASE && !VALIDATION_PATTERNS.PASSWORD.HAS_LOWERCASE.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD.REQUIRE_NUMBER && !VALIDATION_PATTERNS.PASSWORD.HAS_NUMBER.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD.REQUIRE_SPECIAL_CHAR && !VALIDATION_PATTERNS.PASSWORD.HAS_SPECIAL.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Calculate strength
  if (errors.length === 0) {
    if (password.length >= 12) {
      strength = 'strong';
    } else if (password.length >= 10) {
      strength = 'medium';
    } else {
      strength = 'weak';
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
  };
};

/**
 * Validate password confirmation
 * @param {string} password - Original password
 * @param {string} confirmPassword - Confirmation password
 * @returns {Object} Validation result { valid: boolean, error: string|null }
 */
export const validatePasswordConfirmation = (password, confirmPassword) => {
  if (!confirmPassword || typeof confirmPassword !== 'string') {
    return { valid: false, error: 'Password confirmation is required' };
  }

  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match' };
  }

  return { valid: true, error: null };
};

// ============================================
// MONGODB OBJECTID VALIDATION
// ============================================

/**
 * Validate MongoDB ObjectId
 * @param {string|Object} id - ObjectId to validate
 * @returns {Object} Validation result { valid: boolean, error: string|null, objectId: ObjectId|null }
 */
export const validateObjectId = (id) => {
  if (!id) {
    return { valid: false, error: 'ID is required', objectId: null };
  }

  // If already an ObjectId instance
  if (id instanceof mongoose.Types.ObjectId) {
    return { valid: true, error: null, objectId: id };
  }

  // If string, check format and convert
  if (typeof id === 'string') {
    if (!VALIDATION_PATTERNS.OBJECT_ID.test(id)) {
      return { valid: false, error: 'Invalid ID format', objectId: null };
    }

    try {
      const objectId = new mongoose.Types.ObjectId(id);
      return { valid: true, error: null, objectId };
    } catch (error) {
      return { valid: false, error: 'Invalid ObjectId', objectId: null };
    }
  }

  return { valid: false, error: 'ID must be a string or ObjectId', objectId: null };
};

// ============================================
// URL VALIDATION
// ============================================

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireHttps - Require HTTPS (default: false)
 * @param {Array} options.allowedProtocols - Allowed protocols (default: ['http', 'https'])
 * @returns {Object} Validation result { valid: boolean, error: string|null }
 */
export const validateURL = (url, options = {}) => {
  const { requireHttps = false, allowedProtocols = ['http', 'https'] } = options;

  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  try {
    const urlObj = new URL(trimmedUrl);
    const protocol = urlObj.protocol.replace(':', '');

    if (!allowedProtocols.includes(protocol)) {
      return {
        valid: false,
        error: `URL must use one of the following protocols: ${allowedProtocols.join(', ')}`,
      };
    }

    if (requireHttps && protocol !== 'https') {
      return { valid: false, error: 'URL must use HTTPS' };
    }

    return { valid: true, error: null, normalized: trimmedUrl };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
};

// ============================================
// STRING VALIDATION
// ============================================

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum length
 * @param {number} options.max - Maximum length
 * @param {boolean} options.trim - Trim string before validation (default: true)
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, error: string|null, normalized: string|null }
 */
export const validateStringLength = (value, options = {}) => {
  const { min, max, trim = true, required = true } = options;

  if (required && (!value || typeof value !== 'string')) {
    return { valid: false, error: 'Value is required and must be a string', normalized: null };
  }

  if (!required && (!value || typeof value !== 'string')) {
    return { valid: true, error: null, normalized: value || null };
  }

  const normalized = trim ? value.trim() : value;

  if (required && !normalized) {
    return { valid: false, error: 'Value cannot be empty', normalized: null };
  }

  if (min !== undefined && normalized.length < min) {
    return { valid: false, error: `Value must be at least ${min} characters`, normalized: null };
  }

  if (max !== undefined && normalized.length > max) {
    return { valid: false, error: `Value cannot exceed ${max} characters`, normalized: null };
  }

  return { valid: true, error: null, normalized };
};

// ============================================
// NUMBER VALIDATION
// ============================================

/**
 * Validate number range
 * @param {number|string} value - Number to validate
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Must be an integer (default: false)
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, error: string|null, normalized: number|null }
 */
export const validateNumber = (value, options = {}) => {
  const { min, max, integer = false, required = true } = options;

  if (required && (value === null || value === undefined)) {
    return { valid: false, error: 'Value is required', normalized: null };
  }

  if (!required && (value === null || value === undefined)) {
    return { valid: true, error: null, normalized: null };
  }

  // Convert string to number if needed
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (typeof numValue !== 'number' || isNaN(numValue)) {
    return { valid: false, error: 'Value must be a number', normalized: null };
  }

  if (integer && !Number.isInteger(numValue)) {
    return { valid: false, error: 'Value must be an integer', normalized: null };
  }

  if (min !== undefined && numValue < min) {
    return { valid: false, error: `Value must be at least ${min}`, normalized: null };
  }

  if (max !== undefined && numValue > max) {
    return { valid: false, error: `Value cannot exceed ${max}`, normalized: null };
  }

  return { valid: true, error: null, normalized: integer ? Math.round(numValue) : numValue };
};

// ============================================
// DATE VALIDATION
// ============================================

/**
 * Validate date
 * @param {Date|string|number} value - Date to validate
 * @param {Object} options - Validation options
 * @param {Date} options.min - Minimum date
 * @param {Date} options.max - Maximum date
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, error: string|null, normalized: Date|null }
 */
export const validateDate = (value, options = {}) => {
  const { min, max, required = true } = options;

  if (required && (value === null || value === undefined)) {
    return { valid: false, error: 'Date is required', normalized: null };
  }

  if (!required && (value === null || value === undefined)) {
    return { valid: true, error: null, normalized: null };
  }

  const dateValue = value instanceof Date ? value : new Date(value);

  if (isNaN(dateValue.getTime())) {
    return { valid: false, error: 'Invalid date format', normalized: null };
  }

  if (min && dateValue < min) {
    return { valid: false, error: `Date must be after ${min.toISOString()}`, normalized: null };
  }

  if (max && dateValue > max) {
    return { valid: false, error: `Date must be before ${max.toISOString()}`, normalized: null };
  }

  return { valid: true, error: null, normalized: dateValue };
};

// ============================================
// ENUM VALIDATION
// ============================================

/**
 * Validate enum value
 * @param {string} value - Value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @param {Object} options - Validation options
 * @param {boolean} options.caseSensitive - Case sensitive comparison (default: false)
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, error: string|null, normalized: string|null }
 */
export const validateEnum = (value, allowedValues, options = {}) => {
  const { caseSensitive = false, required = true } = options;

  if (required && (value === null || value === undefined)) {
    return { valid: false, error: 'Value is required', normalized: null };
  }

  if (!required && (value === null || value === undefined)) {
    return { valid: true, error: null, normalized: null };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string', normalized: null };
  }

  const normalized = caseSensitive ? value : value.toLowerCase();
  const normalizedAllowed = caseSensitive
    ? allowedValues
    : allowedValues.map((v) => (typeof v === 'string' ? v.toLowerCase() : v));

  if (!normalizedAllowed.includes(normalized)) {
    return {
      valid: false,
      error: `Value must be one of: ${allowedValues.join(', ')}`,
      normalized: null,
    };
  }

  return { valid: true, error: null, normalized };
};

// ============================================
// SPECIFIC ENUM VALIDATORS
// ============================================

/**
 * Validate user role
 * @param {string} role - Role to validate
 * @returns {Object} Validation result
 */
export const validateUserRole = (role) => {
  return validateEnum(role, USER_ROLES_ARRAY, { caseSensitive: false });
};

/**
 * Validate fitness level
 * @param {string} level - Fitness level to validate
 * @returns {Object} Validation result
 */
export const validateFitnessLevel = (level) => {
  return validateEnum(level, FITNESS_LEVELS_ARRAY, { caseSensitive: false });
};

/**
 * Validate exercise category
 * @param {string} category - Category to validate
 * @returns {Object} Validation result
 */
export const validateExerciseCategory = (category) => {
  return validateEnum(category, EXERCISE_CATEGORIES_ARRAY, { caseSensitive: false });
};

/**
 * Validate exercise difficulty
 * @param {string} difficulty - Difficulty to validate
 * @returns {Object} Validation result
 */
export const validateExerciseDifficulty = (difficulty) => {
  return validateEnum(difficulty, EXERCISE_DIFFICULTY_ARRAY, { caseSensitive: false });
};

/**
 * Validate feedback type
 * @param {string} type - Feedback type to validate
 * @returns {Object} Validation result
 */
export const validateFeedbackType = (type) => {
  return validateEnum(type, FEEDBACK_TYPES_ARRAY, { caseSensitive: false });
};

/**
 * Validate feedback severity
 * @param {string} severity - Severity to validate
 * @returns {Object} Validation result
 */
export const validateFeedbackSeverity = (severity) => {
  return validateEnum(severity, FEEDBACK_SEVERITY_ARRAY, { caseSensitive: false });
};

// ============================================
// ARRAY VALIDATION
// ============================================

/**
 * Validate array
 * @param {Array} value - Array to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum array length
 * @param {number} options.maxLength - Maximum array length
 * @param {Function} options.itemValidator - Function to validate each item
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateArray = (value, options = {}) => {
  const { minLength, maxLength, itemValidator, required = true } = options;
  const errors = [];

  if (required && (!value || !Array.isArray(value))) {
    return { valid: false, errors: ['Value is required and must be an array'] };
  }

  if (!required && (!value || !Array.isArray(value))) {
    return { valid: true, errors: [] };
  }

  if (minLength !== undefined && value.length < minLength) {
    errors.push(`Array must have at least ${minLength} item(s)`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    errors.push(`Array cannot have more than ${maxLength} item(s)`);
  }

  if (itemValidator && typeof itemValidator === 'function') {
    value.forEach((item, index) => {
      const result = itemValidator(item, index);
      if (!result.valid) {
        errors.push(`Item ${index}: ${result.error || result.errors?.join(', ') || 'Invalid'}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ============================================
// BOOLEAN VALIDATION
// ============================================

/**
 * Validate boolean value
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.required - Value is required (default: true)
 * @returns {Object} Validation result { valid: boolean, error: string|null, normalized: boolean|null }
 */
export const validateBoolean = (value, options = {}) => {
  const { required = true } = options;

  if (required && (value === null || value === undefined)) {
    return { valid: false, error: 'Value is required', normalized: null };
  }

  if (!required && (value === null || value === undefined)) {
    return { valid: true, error: null, normalized: null };
  }

  // Handle string booleans
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return { valid: true, error: null, normalized: true };
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return { valid: true, error: null, normalized: false };
    }
    return { valid: false, error: 'Value must be a boolean', normalized: null };
  }

  if (typeof value === 'boolean') {
    return { valid: true, error: null, normalized: value };
  }

  if (typeof value === 'number') {
    return { valid: true, error: null, normalized: value !== 0 };
  }

  return { valid: false, error: 'Value must be a boolean', normalized: null };
};

// ============================================
// COMPOSITE VALIDATORS
// ============================================

/**
 * Validate multiple fields at once
 * @param {Object} data - Data object to validate
 * @param {Object} schema - Validation schema { fieldName: { validator: Function, options: Object } }
 * @returns {Object} Validation result { valid: boolean, errors: Object, normalized: Object }
 */
export const validateMultiple = (data, schema) => {
  const errors = {};
  const normalized = {};

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: { _general: 'Data must be an object' }, normalized: {} };
  }

  Object.keys(schema).forEach((field) => {
    const fieldSchema = schema[field];
    const { validator, options = {} } = fieldSchema;
    const value = data[field];

    if (typeof validator !== 'function') {
      errors[field] = 'Invalid validator function';
      return;
    }

    const result = validator(value, options);
    if (!result.valid) {
      errors[field] = result.error || result.errors || 'Invalid value';
    } else {
      normalized[field] = result.normalized !== undefined ? result.normalized : value;
    }
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Basic validators
  validateEmail,
  validateUsername,
  validatePassword,
  validatePasswordConfirmation,
  validateObjectId,
  validateURL,
  validateStringLength,
  validateNumber,
  validateDate,
  validateEnum,
  validateArray,
  validateBoolean,

  // Specific enum validators
  validateUserRole,
  validateFitnessLevel,
  validateExerciseCategory,
  validateExerciseDifficulty,
  validateFeedbackType,
  validateFeedbackSeverity,

  // Composite validators
  validateMultiple,
};
