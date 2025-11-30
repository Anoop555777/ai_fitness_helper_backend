/**
 * Feedback Service
 * 
 * Service layer for feedback-related business logic and database operations.
 * This service abstracts database queries from controllers and provides
 * reusable functions for feedback management.
 * 
 * Features:
 * - CRUD operations for feedback
 * - Advanced querying with filtering, sorting, and pagination
 * - Feedback statistics and analytics
 * - Critical feedback detection
 * - Integration with AI service for enhancement
 * - Feedback resolution management
 */

import Feedback from '../models/Feedback.js';
import ExerciseSession from '../models/ExerciseSession.js';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY,
  FEEDBACK_SEVERITY_ARRAY,
  FEEDBACK_KEYPOINTS_LIMIT,
  FEEDBACK_PRIORITY,
  PAGINATION,
} from '../config/constants.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';

/**
 * Build query filter from options
 * @param {string} sessionId - Session ID (required)
 * @param {Object} options - Filter options
 * @param {string} options.type - Feedback type
 * @param {string} options.severity - Feedback severity
 * @param {boolean} options.unresolvedOnly - Only unresolved feedback
 * @param {boolean} options.aiGenerated - Filter by AI generated status
 * @returns {Object} Mongoose query filter
 */
export const buildFeedbackFilter = (sessionId, options = {}) => {
  const filter = { sessionId };

  // Filter by type
  if (options.type) {
    if (!FEEDBACK_TYPES_ARRAY.includes(options.type)) {
      throw new AppError(
        `Invalid feedback type. Must be one of: ${FEEDBACK_TYPES_ARRAY.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    filter.type = options.type;
  }

  // Filter by severity
  if (options.severity) {
    if (!FEEDBACK_SEVERITY_ARRAY.includes(options.severity)) {
      throw new AppError(
        `Invalid feedback severity. Must be one of: ${FEEDBACK_SEVERITY_ARRAY.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    filter.severity = options.severity;
  }

  // Filter unresolved only
  if (options.unresolvedOnly) {
    filter.isResolved = false;
  }

  // Filter by AI generated
  if (options.aiGenerated !== undefined) {
    filter.aiGenerated = options.aiGenerated === true;
  }

  return filter;
};

/**
 * Build sort object from sort string
 * @param {string} sortQuery - Sort query string (e.g., "timestamp,-priority")
 * @param {Object} defaultSort - Default sort object (default: { timestamp: 1, priority: -1 })
 * @returns {Object} Mongoose sort object
 */
export const buildSortObject = (sortQuery, defaultSort = { timestamp: 1, priority: -1 }) => {
  if (!sortQuery) {
    return defaultSort;
  }

  const sortFields = sortQuery.split(',');
  const sortObject = {};

  sortFields.forEach((field) => {
    const trimmedField = field.trim();
    if (trimmedField.startsWith('-')) {
      sortObject[trimmedField.substring(1)] = -1; // Descending
    } else {
      sortObject[trimmedField] = 1; // Ascending
    }
  });

  return sortObject;
};

/**
 * Build pagination options
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 10, max: 100)
 * @returns {Object} Pagination options { limit, skip, page }
 */
export const buildPaginationOptions = (options = {}) => {
  const page = Math.max(
    PAGINATION.MIN_PAGE,
    parseInt(options.page, 10) || PAGINATION.DEFAULT_PAGE
  );
  const limit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(options.limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { limit, skip, page };
};

/**
 * Calculate pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
export const calculatePaginationMetadata = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Verify session access
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Session object
 * @throws {AppError} If session not found or access denied
 */
export const verifySessionAccess = async (sessionId, userId) => {
  try {
    const session = await ExerciseSession.findById(sessionId);

    if (!session) {
      throw new AppError('Session not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check if session belongs to user (unless admin)
    if (session.userId.toString() !== userId.toString()) {
      throw new AppError('You do not have access to this session', HTTP_STATUS.FORBIDDEN);
    }

    return session;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to verify session access', error);
    throw new AppError('Failed to verify session access', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get feedback by session with filtering, sorting, and pagination
 * @param {string} sessionId - Session ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with feedback array
 */
export const getFeedbackBySession = async (sessionId, options = {}) => {
  try {
    const filter = buildFeedbackFilter(sessionId, options);
    const sort = buildSortObject(options.sort);
    const { limit, skip, page } = buildPaginationOptions(options);

    // Build query with sanitizeFilter for security
    const query = Feedback.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Use lean() for better performance
    const feedback = await query.lean();

    // Get total count
    const total = await Feedback.countDocuments(filter);

    // Calculate pagination metadata
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Feedback fetched by session', {
      sessionId,
      count: feedback.length,
      total,
      page,
      limit,
      filters: Object.keys(filter),
    });

    return {
      feedback,
      pagination,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch feedback by session', error);
    throw new AppError('Failed to fetch feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get feedback by ID
 * @param {string} feedbackId - Feedback ID
 * @param {Object} options - Query options
 * @param {boolean} options.populate - Populate sessionId (default: false)
 * @returns {Promise<Object>} Feedback document
 * @throws {AppError} If feedback not found
 */
export const getFeedbackById = async (feedbackId, options = {}) => {
  try {
    let query = Feedback.findById(feedbackId);

    if (options.populate) {
      query = query.populate('sessionId', 'userId exerciseId');
    }

    const feedback = await query;

    if (!feedback) {
      throw new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND);
    }

    logInfo('Feedback fetched by ID', {
      feedbackId,
      sessionId: feedback.sessionId.toString(),
    });

    return feedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch feedback by ID', error);
    throw new AppError('Failed to fetch feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get feedback by type for a session
 * @param {string} sessionId - Session ID
 * @param {string} type - Feedback type
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of feedback items
 */
export const getFeedbackByType = async (sessionId, type, options = {}) => {
  if (!FEEDBACK_TYPES_ARRAY.includes(type)) {
    throw new AppError(
      `Invalid feedback type. Must be one of: ${FEEDBACK_TYPES_ARRAY.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    const filter = buildFeedbackFilter(sessionId, { ...options, type });
    const sort = buildSortObject(options.sort, { timestamp: 1, priority: -1 });

    const feedback = await Feedback.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .lean();

    logInfo('Feedback fetched by type', {
      sessionId,
      type,
      count: feedback.length,
    });

    return feedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch feedback by type', error);
    throw new AppError('Failed to fetch feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get critical feedback (errors) for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Array of critical feedback items
 */
export const getCriticalFeedback = async (sessionId) => {
  try {
    const feedback = await Feedback.findCritical(sessionId).lean();

    logInfo('Critical feedback fetched', {
      sessionId,
      count: feedback.length,
    });

    return feedback;
  } catch (error) {
    logError('Failed to fetch critical feedback', error);
    throw new AppError('Failed to fetch critical feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get feedback statistics for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Feedback statistics
 */
export const getFeedbackStats = async (sessionId) => {
  try {
    const stats = await Feedback.getSessionStats(sessionId);

    logInfo('Feedback stats fetched', {
      sessionId,
      stats,
    });

    return stats;
  } catch (error) {
    logError('Failed to get feedback statistics', error);
    throw new AppError('Failed to get feedback statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Create new feedback
 * @param {Object} feedbackData - Feedback data
 * @param {Object} options - Create options
 * @returns {Promise<Object>} Created feedback
 * @throws {AppError} If validation fails
 */
export const createFeedback = async (feedbackData, options = {}) => {
  try {
    // Validate keypoints limit
    if (feedbackData.keypoints && feedbackData.keypoints.length > FEEDBACK_KEYPOINTS_LIMIT) {
      throw new AppError(
        `Cannot reference more than ${FEEDBACK_KEYPOINTS_LIMIT} keypoints`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Create feedback
    const feedback = await Feedback.create(feedbackData);

    logInfo('Feedback created', {
      feedbackId: feedback._id.toString(),
      sessionId: feedback.sessionId.toString(),
      type: feedback.type,
      severity: feedback.severity,
      createdBy: options.createdBy,
    });

    return feedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to create feedback', error);
    throw new AppError('Failed to create feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Update feedback
 * @param {string} feedbackId - Feedback ID
 * @param {Object} updateData - Update data
 * @param {Object} options - Update options
 * @returns {Promise<Object>} Updated feedback
 * @throws {AppError} If feedback not found or validation fails
 */
export const updateFeedback = async (feedbackId, updateData, options = {}) => {
  try {
    // Check if feedback exists
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      throw new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND);
    }

    // Validate keypoints limit if being updated
    if (updateData.keypoints && updateData.keypoints.length > FEEDBACK_KEYPOINTS_LIMIT) {
      throw new AppError(
        `Cannot reference more than ${FEEDBACK_KEYPOINTS_LIMIT} keypoints`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Prevent updating certain fields
    const allowedUpdates = { ...updateData };
    delete allowedUpdates.sessionId; // Cannot change session
    delete allowedUpdates._id; // Cannot change ID

    // Update feedback
    const updatedFeedback = await Feedback.findByIdAndUpdate(
      feedbackId,
      allowedUpdates,
      {
        new: true, // Return updated document
        runValidators: true, // Run schema validators
      }
    );

    logInfo('Feedback updated', {
      feedbackId,
      updatedBy: options.updatedBy,
      updatedFields: Object.keys(allowedUpdates),
    });

    return updatedFeedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to update feedback', error);
    throw new AppError('Failed to update feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Resolve feedback
 * @param {string} feedbackId - Feedback ID
 * @param {string} userNotes - Optional user notes
 * @param {Object} options - Resolve options
 * @returns {Promise<Object>} Resolved feedback
 * @throws {AppError} If feedback not found or already resolved
 */
export const resolveFeedback = async (feedbackId, userNotes = '', options = {}) => {
  try {
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      throw new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check if already resolved
    if (feedback.isResolved) {
      throw new AppError('Feedback is already resolved', HTTP_STATUS.BAD_REQUEST);
    }

    // Resolve feedback using instance method
    await feedback.resolve(userNotes);

    logInfo('Feedback resolved', {
      feedbackId,
      resolvedBy: options.resolvedBy,
      hasNotes: !!userNotes,
    });

    return feedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to resolve feedback', error);
    throw new AppError('Failed to resolve feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Delete feedback
 * @param {string} feedbackId - Feedback ID
 * @param {Object} options - Delete options
 * @returns {Promise<void>}
 * @throws {AppError} If feedback not found
 */
export const deleteFeedback = async (feedbackId, options = {}) => {
  try {
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      throw new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND);
    }

    await Feedback.findByIdAndDelete(feedbackId);

    logInfo('Feedback deleted', {
      feedbackId,
      deletedBy: options.deletedBy,
      sessionId: feedback.sessionId.toString(),
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to delete feedback', error);
    throw new AppError('Failed to delete feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get actionable feedback (unresolved form errors)
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} Array of actionable feedback items
 */
export const getActionableFeedback = async (sessionId) => {
  try {
    const feedback = await Feedback.find({
      sessionId,
      type: FEEDBACK_TYPES.FORM_ERROR,
      severity: { $ne: FEEDBACK_SEVERITY.INFO },
      isResolved: false,
    })
      .sort({ timestamp: 1, priority: -1 })
      .lean();

    logInfo('Actionable feedback fetched', {
      sessionId,
      count: feedback.length,
    });

    return feedback;
  } catch (error) {
    logError('Failed to fetch actionable feedback', error);
    throw new AppError('Failed to fetch actionable feedback', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get feedback summary for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Feedback summary
 */
export const getFeedbackSummary = async (sessionId) => {
  try {
    const stats = await getFeedbackStats(sessionId);
    const critical = await getCriticalFeedback(sessionId);
    const actionable = await getActionableFeedback(sessionId);

    return {
      stats,
      criticalCount: critical.length,
      actionableCount: actionable.length,
      hasCritical: critical.length > 0,
      hasActionable: actionable.length > 0,
    };
  } catch (error) {
    logError('Failed to get feedback summary', error);
    throw new AppError('Failed to get feedback summary', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Batch create feedback items
 * @param {Array<Object>} feedbackArray - Array of feedback data objects
 * @param {Object} options - Create options
 * @returns {Promise<Array>} Array of created feedback items
 */
export const createFeedbackBatch = async (feedbackArray, options = {}) => {
  try {
    // Validate all feedback items
    feedbackArray.forEach((feedbackData) => {
      if (feedbackData.keypoints && feedbackData.keypoints.length > FEEDBACK_KEYPOINTS_LIMIT) {
        throw new AppError(
          `Cannot reference more than ${FEEDBACK_KEYPOINTS_LIMIT} keypoints`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    });

    // Create all feedback items
    const feedback = await Feedback.insertMany(feedbackArray);

    logInfo('Feedback batch created', {
      count: feedback.length,
      sessionIds: [...new Set(feedback.map((f) => f.sessionId.toString()))],
      createdBy: options.createdBy,
    });

    return feedback;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to create feedback batch', error);
    throw new AppError('Failed to create feedback batch', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Calculate feedback priority score
 * @param {Object} feedback - Feedback object
 * @returns {number} Priority score (higher = more important)
 */
export const calculatePriority = (feedback) => {
  const severityPriority = FEEDBACK_PRIORITY.SEVERITY[feedback.severity] || 1;
  const typePriority = FEEDBACK_PRIORITY.TYPE[feedback.type] || 1;
  return severityPriority + typePriority;
};

/**
 * Sort feedback by priority
 * @param {Array<Object>} feedbackArray - Array of feedback items
 * @param {string} order - Sort order ('asc' or 'desc', default: 'desc')
 * @returns {Array<Object>} Sorted feedback array
 */
export const sortByPriority = (feedbackArray, order = 'desc') => {
  const sorted = [...feedbackArray].sort((a, b) => {
    const priorityA = calculatePriority(a);
    const priorityB = calculatePriority(b);
    return order === 'desc' ? priorityB - priorityA : priorityA - priorityB;
  });
  return sorted;
};

/**
 * Filter feedback by severity level
 * @param {Array<Object>} feedbackArray - Array of feedback items
 * @param {string|string[]} severity - Severity level(s) to filter
 * @returns {Array<Object>} Filtered feedback array
 */
export const filterBySeverity = (feedbackArray, severity) => {
  const severityArray = Array.isArray(severity) ? severity : [severity];
  return feedbackArray.filter((feedback) => severityArray.includes(feedback.severity));
};

/**
 * Filter feedback by type
 * @param {Array<Object>} feedbackArray - Array of feedback items
 * @param {string|string[]} type - Feedback type(s) to filter
 * @returns {Array<Object>} Filtered feedback array
 */
export const filterByType = (feedbackArray, type) => {
  const typeArray = Array.isArray(type) ? type : [type];
  return feedbackArray.filter((feedback) => typeArray.includes(feedback.type));
};

/**
 * Get unresolved feedback count for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<number>} Count of unresolved feedback
 */
export const getUnresolvedCount = async (sessionId) => {
  try {
    const count = await Feedback.countDocuments({
      sessionId,
      isResolved: false,
    });
    return count;
  } catch (error) {
    logError('Failed to get unresolved feedback count', error);
    return 0;
  }
};

// Default export
export default {
  buildFeedbackFilter,
  buildSortObject,
  buildPaginationOptions,
  calculatePaginationMetadata,
  verifySessionAccess,
  getFeedbackBySession,
  getFeedbackById,
  getFeedbackByType,
  getCriticalFeedback,
  getFeedbackStats,
  createFeedback,
  updateFeedback,
  resolveFeedback,
  deleteFeedback,
  getActionableFeedback,
  getFeedbackSummary,
  createFeedbackBatch,
  calculatePriority,
  sortByPriority,
  filterBySeverity,
  filterByType,
  getUnresolvedCount,
};
