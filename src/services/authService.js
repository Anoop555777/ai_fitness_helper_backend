/**
 * Authentication Service
 * 
 * Centralized authentication utilities for JWT token management,
 * password operations, and token generation/hashing.
 * 
 * This service provides:
 * - JWT token generation and verification
 * - Token hashing for secure storage
 * - Random token generation
 * - Password validation utilities
 * - Token response creation
 * 
 * Environment Variables Required:
 * - JWT_SECRET: Secret key for signing JWT tokens
 * 
 * Optional:
 * - JWT_EXPIRES_IN: Default token expiration (default: '15m')
 * - JWT_REFRESH_EXPIRES_IN: Refresh token expiration (default: '7d')
 * - JWT_ISSUER: Token issuer (optional)
 * - JWT_AUDIENCE: Token audience (optional)
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_EXPIRATION } from '../config/constants.js';

/**
 * Check if JWT secret is configured
 * @returns {boolean} True if JWT_SECRET is set
 */
export const isConfigured = () => {
  return !!process.env.JWT_SECRET;
};

/**
 * Get JWT secret from environment
 * @returns {string} JWT secret
 * @throws {Error} If JWT_SECRET is not configured
 */
const getJWTSecret = () => {
  if (!isConfigured()) {
    throw new Error('JWT_SECRET is not configured. Please set it in your environment variables.');
  }
  return process.env.JWT_SECRET;
};

/**
 * Default JWT options
 */
const DEFAULT_JWT_OPTIONS = {
  issuer: process.env.JWT_ISSUER,
  audience: process.env.JWT_AUDIENCE,
};

/**
 * Generate JWT token
 * @param {string|Object} payload - User ID or payload object
 * @param {Object} options - JWT options
 * @param {string} options.expiresIn - Token expiration time (default: '15m')
 * @param {string} options.issuer - Token issuer (optional)
 * @param {string} options.audience - Token audience (optional)
 * @param {string} options.subject - Token subject (optional)
 * @param {string} options.jwtid - Unique token ID (optional)
 * @returns {string} JWT token
 * @throws {Error} If JWT_SECRET is not configured
 */
export const signToken = (payload, options = {}) => {
  const secret = getJWTSecret();
  
  // If payload is a string (user ID), convert to object
  const tokenPayload = typeof payload === 'string' 
    ? { id: payload } 
    : payload;

  const jwtOptions = {
    expiresIn: options.expiresIn || JWT_EXPIRATION.ACCESS_TOKEN,
    ...DEFAULT_JWT_OPTIONS,
    ...options,
  };

  // Remove undefined values
  Object.keys(jwtOptions).forEach(key => {
    if (jwtOptions[key] === undefined) {
      delete jwtOptions[key];
    }
  });

  return jwt.sign(tokenPayload, secret, jwtOptions);
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {Object} options - Verification options
 * @param {string[]} options.algorithms - Allowed algorithms (default: ['HS256'])
 * @param {string} options.issuer - Expected issuer (optional)
 * @param {string} options.audience - Expected audience (optional)
 * @param {boolean} options.ignoreExpiration - Ignore expiration (default: false)
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export const verifyToken = (token, options = {}) => {
  const secret = getJWTSecret();
  
  const verifyOptions = {
    algorithms: options.algorithms || ['HS256'],
    ...DEFAULT_JWT_OPTIONS,
    ...options,
  };

  // Remove undefined values
  Object.keys(verifyOptions).forEach(key => {
    if (verifyOptions[key] === undefined) {
      delete verifyOptions[key];
    }
  });

  try {
    return jwt.verify(token, secret, verifyOptions);
  } catch (error) {
    // Re-throw with more context
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded payload or null if invalid
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    return null;
  }
};

/**
 * Generate access token (short-lived)
 * @param {string} userId - User ID
 * @param {Object} options - Additional options
 * @returns {string} Access token
 */
export const generateAccessToken = (userId, options = {}) => {
  return signToken(userId, {
    expiresIn: options.expiresIn || JWT_EXPIRATION.ACCESS_TOKEN,
    ...options,
  });
};

/**
 * Generate refresh token (long-lived)
 * @param {string} userId - User ID
 * @param {Object} options - Additional options
 * @returns {string} Refresh token
 */
export const generateRefreshToken = (userId, options = {}) => {
  return signToken(userId, {
    expiresIn: options.expiresIn || JWT_EXPIRATION.REFRESH_TOKEN,
    ...options,
  });
};

/**
 * Generate email verification token
 * @param {string} userId - User ID
 * @param {Object} options - Additional options
 * @returns {string} Verification token
 */
export const generateEmailVerificationToken = (userId, options = {}) => {
  return signToken(userId, {
    expiresIn: options.expiresIn || JWT_EXPIRATION.EMAIL_VERIFICATION,
    ...options,
  });
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @param {Object} options - Additional options
 * @returns {string} Password reset token
 */
export const generatePasswordResetToken = (userId, options = {}) => {
  return signToken(userId, {
    expiresIn: options.expiresIn || JWT_EXPIRATION.PASSWORD_RESET,
    ...options,
  });
};

/**
 * Generate random secure token (for email verification, password reset, etc.)
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Random hex token
 */
export const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash token for secure storage in database
 * @param {string} token - Token to hash
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {string} Hashed token
 */
export const hashToken = (token, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(token).digest('hex');
};

/**
 * Verify hashed token
 * @param {string} token - Plain token
 * @param {string} hashedToken - Hashed token from database
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {boolean} True if tokens match
 */
export const verifyHashedToken = (token, hashedToken, algorithm = 'sha256') => {
  const tokenHash = hashToken(token, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash),
    Buffer.from(hashedToken)
  );
};

/**
 * Create token response object
 * @param {Object} user - User object
 * @param {Object} options - Response options
 * @param {string} options.token - Custom token (optional, will generate if not provided)
 * @param {string} options.expiresIn - Token expiration (optional)
 * @returns {Object} Response object with token and user data
 */
export const createTokenResponse = (user, options = {}) => {
  const token = options.token || generateAccessToken(user._id.toString(), {
    expiresIn: options.expiresIn,
  });

  // Remove sensitive fields from user object
  const userData = { ...user.toObject ? user.toObject() : user };
  delete userData.password;
  delete userData.passwordResetToken;
  delete userData.emailVerificationToken;
  delete userData.oauth?.google?.accessToken;
  delete userData.oauth?.google?.refreshToken;

  return {
    token,
    user: userData,
  };
};

/**
 * Extract token from Authorization header
 * @param {Object} headers - Request headers
 * @returns {string|null} Token or null if not found
 */
export const extractTokenFromHeader = (headers) => {
  if (!headers.authorization) {
    return null;
  }

  const authHeader = headers.authorization;
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  return null;
};

/**
 * Check if token is expired (without verification)
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return true; // No expiration means invalid
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    return true; // Invalid token is considered expired
  }
};

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null if invalid
 */
export const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
};

/**
 * Get time until token expires
 * @param {string} token - JWT token
 * @returns {number|null} Milliseconds until expiration or null if invalid
 */
export const getTimeUntilExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const timeUntilExpiration = expirationTime - currentTime;
    
    return timeUntilExpiration > 0 ? timeUntilExpiration : 0;
  } catch (error) {
    return null;
  }
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} rules - Validation rules
 * @param {number} rules.minLength - Minimum length (default: 8)
 * @param {boolean} rules.requireUppercase - Require uppercase (default: true)
 * @param {boolean} rules.requireLowercase - Require lowercase (default: true)
 * @param {boolean} rules.requireNumber - Require number (default: true)
 * @param {boolean} rules.requireSpecial - Require special char (default: true)
 * @returns {Object} Validation result with isValid and errors
 */
export const validatePassword = (password, rules = {}) => {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = true,
  } = rules;

  const errors = [];

  if (!password || password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Generate token pair (access + refresh)
 * @param {string} userId - User ID
 * @param {Object} options - Token options
 * @returns {Object} Object with accessToken and refreshToken
 */
export const generateTokenPair = (userId, options = {}) => {
  return {
    accessToken: generateAccessToken(userId, options),
    refreshToken: generateRefreshToken(userId, options),
  };
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {Object} options - Verification options
 * @returns {Object} New access token and user ID
 * @throws {Error} If refresh token is invalid
 */
export const refreshAccessToken = (refreshToken, options = {}) => {
  const decoded = verifyToken(refreshToken, {
    ...options,
    ignoreExpiration: false,
  });

  if (!decoded.id) {
    throw new Error('Invalid token payload: missing user ID');
  }

  const newAccessToken = generateAccessToken(decoded.id, options);

  return {
    accessToken: newAccessToken,
    userId: decoded.id,
  };
};

// Default export
export default {
  isConfigured,
  signToken,
  verifyToken,
  decodeToken,
  generateAccessToken,
  generateRefreshToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  generateRandomToken,
  hashToken,
  verifyHashedToken,
  createTokenResponse,
  extractTokenFromHeader,
  isTokenExpired,
  getTokenExpiration,
  getTimeUntilExpiration,
  validatePassword,
  generateTokenPair,
  refreshAccessToken,
};
