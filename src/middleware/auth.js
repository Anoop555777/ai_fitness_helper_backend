/**
 * JWT Authentication Middleware
 * 
 * Provides middleware functions for protecting routes and implementing
 * role-based access control (RBAC) using JSON Web Tokens.
 * 
 * @module middleware/auth
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import catchAsync from '../utils/catchAsync.js';
import { HTTP_STATUS, API_STATUS } from '../config/constants.js';
import { logAuth, logError } from '../utils/logger.js';

/**
 * Protect routes - Verify JWT token and attach user to request
 * 
 * This middleware:
 * 1. Extracts JWT token from cookie (preferred) or Authorization header (fallback)
 * 2. Verifies the token signature and expiration
 * 3. Fetches the user from database
 * 4. Checks if user account is still active
 * 5. Attaches user object to req.user for use in route handlers
 * 
 * @example
 * router.get('/profile', protect, getProfile);
 * router.use(protect); // Protect all routes in router
 */
export const protect = catchAsync(async (req, res, next) => {
  let token;

  // 1) Get token from cookie (preferred) or Authorization header (fallback for backward compatibility)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', HTTP_STATUS.UNAUTHORIZED)
    );
  }

  // 2) Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logError('JWT token expired', error);
      return next(
        new AppError('Your token has expired! Please log in again.', HTTP_STATUS.UNAUTHORIZED)
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logError('Invalid JWT token', error);
      return next(
        new AppError('Invalid token. Please log in again!', HTTP_STATUS.UNAUTHORIZED)
      );
    }

    // Handle other JWT errors
    logError('JWT verification failed', error);
    return next(
      new AppError('Token verification failed. Please log in again!', HTTP_STATUS.UNAUTHORIZED)
    );
  }

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);

  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token does no longer exist.', HTTP_STATUS.UNAUTHORIZED)
    );
  }

  // 4) Check if user changed password after the token was issued (if passwordChangedAt exists)
  // Note: This field may not exist in all User models, so we check for it
  if (currentUser.passwordChangedAt && decoded.iat) {
    const changedTimestamp = parseInt(
      currentUser.passwordChangedAt.getTime() / 1000,
      10
    );

    if (decoded.iat < changedTimestamp) {
      return next(
        new AppError('User recently changed password! Please log in again.', HTTP_STATUS.UNAUTHORIZED)
      );
    }
  }

  // 5) Check if user account is active
  if (!currentUser.isActive) {
    return next(
      new AppError('Your account has been deactivated. Please contact support.', HTTP_STATUS.FORBIDDEN)
    );
  }

  // 6) Grant access to protected route
  req.user = currentUser;
  next();
});

/**
 * Restrict access to specific roles
 * 
 * This middleware should be used AFTER the protect middleware.
 * It checks if the authenticated user has one of the required roles.
 * 
 * @param {...string} roles - One or more allowed roles
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.delete('/:id', protect, restrictTo('admin'), deleteExercise);
 * router.post('/', protect, restrictTo('admin', 'premium'), createPost);
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Ensure protect middleware was called first
    if (!req.user) {
      return next(
        new AppError('You must be logged in to access this resource.', HTTP_STATUS.UNAUTHORIZED)
      );
    }

    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      logAuth('unauthorized_access', req.user._id, {
        attemptedRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      });

      return next(
        new AppError('You do not have permission to perform this action.', HTTP_STATUS.FORBIDDEN)
      );
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * 
 * Similar to protect, but doesn't fail if no token is provided.
 * Useful for routes that work for both authenticated and anonymous users.
 * 
 * @example
 * router.get('/posts', optionalAuth, getPosts); // Shows different content for logged in users
 */
export const optionalAuth = catchAsync(async (req, res, next) => {
  let token;

  // 1) Get token from cookie (preferred) or Authorization header (fallback)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token, continue without authentication
  if (!token) {
    return next();
  }

  // 2) Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // If token is invalid, continue without authentication
    return next();
  }

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);

  if (currentUser && currentUser.isActive) {
    // Check if user changed password after the token was issued
    if (currentUser.passwordChangedAt) {
      const changedTimestamp = parseInt(
        currentUser.passwordChangedAt.getTime() / 1000,
        10
      );

      if (decoded.iat >= changedTimestamp) {
        req.user = currentUser;
      }
    } else {
      req.user = currentUser;
    }
  }

  next();
});

/**
 * Verify ownership or admin access
 * 
 * Middleware to ensure user owns the resource or is an admin.
 * Expects resource to have a userId field or be passed as parameter.
 * 
 * @param {string} userIdParam - Name of the parameter containing user ID (default: 'userId')
 * @param {Function} getResource - Async function to fetch resource: (id) => Promise<Resource>
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.put('/:id', protect, verifyOwnership('id', ExerciseSession.findById), updateSession);
 */
export const verifyOwnership = (userIdParam = 'userId', getResource) => {
  return catchAsync(async (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError('You must be logged in to access this resource.', HTTP_STATUS.UNAUTHORIZED)
      );
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // Get resource ID from params or body
    const resourceId = req.params[userIdParam] || req.body[userIdParam];

    if (!resourceId) {
      return next(
        new AppError('Resource ID is required.', HTTP_STATUS.BAD_REQUEST)
      );
    }

    // Fetch resource
    if (!getResource || typeof getResource !== 'function') {
      return next(
        new AppError('Resource getter function is required.', HTTP_STATUS.INTERNAL_SERVER_ERROR)
      );
    }

    const resource = await getResource(resourceId);

    if (!resource) {
      return next(
        new AppError('Resource not found.', HTTP_STATUS.NOT_FOUND)
      );
    }

    // Check ownership
    const resourceUserId = resource.userId?.toString() || resource.user?.toString();
    const currentUserId = req.user._id.toString();

    if (resourceUserId !== currentUserId) {
      logAuth('unauthorized_resource_access', req.user._id, {
        resourceId,
        resourceUserId,
        attemptedUserId: currentUserId,
        path: req.path,
        method: req.method,
      });

      return next(
        new AppError('You do not have permission to access this resource.', HTTP_STATUS.FORBIDDEN)
      );
    }

    // Attach resource to request for use in route handler
    req.resource = resource;
    next();
  });
};
