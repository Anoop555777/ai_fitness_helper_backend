/**
 * Feedback Controller
 * 
 * Handles all feedback-related operations including:
 * - Getting feedback by session, ID, type, or severity
 * - Creating, updating, and deleting feedback
 * - Resolving feedback
 * - Getting feedback statistics
 * - Getting critical feedback
 * - Enhancing feedback with AI (optional)
 */

import Feedback from '../models/Feedback.js';
import ExerciseSession from '../models/ExerciseSession.js';
import Exercise from '../models/Exercise.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import {
  HTTP_STATUS,
  API_STATUS,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY_ARRAY,
  FEEDBACK_TYPES,
  FEEDBACK_SEVERITY,
} from '../config/constants.js';
import { logInfo, logError } from '../utils/logger.js';
import { validateObjectId, validateEnum } from '../utils/validators.js';
import { enhanceFeedbackBatch, isConfigured as isAIConfigured } from '../services/aiService.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verify that session exists and belongs to the user
 * @private
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Session object
 */
const verifySessionAccess = async (sessionId, userId) => {
  const session = await ExerciseSession.findById(sessionId);

  if (!session) {
    throw new AppError('Session not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if session belongs to user (unless admin)
  if (session.userId.toString() !== userId.toString()) {
    throw new AppError('You do not have access to this session', HTTP_STATUS.FORBIDDEN);
  }

  return session;
};

/**
 * Build sort object from request query
 * @private
 * @param {string} sortQuery - Sort query string (e.g., "timestamp,-priority")
 * @returns {Object} Mongoose sort object
 */
const buildSortObject = (sortQuery) => {
  if (!sortQuery) {
    return { timestamp: 1, priority: -1 }; // Default: by timestamp, then priority
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

// ============================================
// GET FEEDBACK BY SESSION
// ============================================

/**
 * @route   GET /api/v1/feedback/session/:sessionId
 * @desc    Get all feedback for a session with optional filtering
 * @access  Private
 * @params  sessionId - Session ID
 * @query   type, severity, unresolvedOnly, aiGenerated, sort, limit
 */
export const getFeedbackBySession = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();

  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(sessionId, userId);

  // Build filter options
  const options = {};

  // Filter by type
  if (req.query.type) {
    const typeValidation = validateEnum(req.query.type, FEEDBACK_TYPES_ARRAY, 'type');
    if (!typeValidation.valid) {
      return next(new AppError(typeValidation.error, HTTP_STATUS.BAD_REQUEST));
    }
    options.type = req.query.type;
  }

  // Filter by severity
  if (req.query.severity) {
    const severityValidation = validateEnum(req.query.severity, FEEDBACK_SEVERITY_ARRAY, 'severity');
    if (!severityValidation.valid) {
      return next(new AppError(severityValidation.error, HTTP_STATUS.BAD_REQUEST));
    }
    options.severity = req.query.severity;
  }

  // Filter unresolved only
  if (req.query.unresolvedOnly === 'true') {
    options.unresolvedOnly = true;
  }

  // Filter by AI generated
  if (req.query.aiGenerated !== undefined) {
    options.aiGenerated = req.query.aiGenerated === 'true';
  }

  // Build sort
  const sort = buildSortObject(req.query.sort);
  options.sort = sort;

  // Apply limit if provided
  const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : undefined;
  if (limit) {
    options.limit = limit;
  }

  // Get feedback using static method
  let query = Feedback.findBySession(sessionId, options);
  if (limit) {
    query = query.limit(limit);
  }

  const feedback = await query.lean();

  logInfo('Feedback fetched by session', {
    sessionId,
    count: feedback.length,
    filters: Object.keys(options),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: feedback.length,
    data: {
      feedback,
    },
  });
});

// ============================================
// GET FEEDBACK BY TYPE
// ============================================

/**
 * @route   GET /api/v1/feedback/session/:sessionId/type/:type
 * @desc    Get feedback by type for a session
 * @access  Private
 * @params  sessionId, type
 */
export const getFeedbackByType = catchAsync(async (req, res, next) => {
  const { sessionId, type } = req.params;
  const userId = req.user._id.toString();

  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Validate type
  const typeValidation = validateEnum(type, FEEDBACK_TYPES_ARRAY, 'type');
  if (!typeValidation.valid) {
    return next(new AppError(typeValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(sessionId, userId);

  // Get feedback by type
  const feedback = await Feedback.findBySession(sessionId, {
    type,
    sort: { timestamp: 1, priority: -1 },
  }).lean();

  logInfo('Feedback fetched by type', {
    sessionId,
    type,
    count: feedback.length,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: feedback.length,
    data: {
      feedback,
    },
  });
});

// ============================================
// GET FEEDBACK BY ID
// ============================================

/**
 * @route   GET /api/v1/feedback/:id
 * @desc    Get feedback by ID
 * @access  Private
 * @params  id - Feedback ID
 */
export const getFeedbackById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Find feedback
  const feedback = await Feedback.findById(id).populate('sessionId', 'userId exerciseId');

  if (!feedback) {
    return next(new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify session access
  const session = await ExerciseSession.findById(feedback.sessionId);
  if (!session || session.userId.toString() !== userId.toString()) {
    return next(new AppError('You do not have access to this feedback', HTTP_STATUS.FORBIDDEN));
  }

  logInfo('Feedback fetched by ID', {
    feedbackId: id,
    sessionId: feedback.sessionId.toString(),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      feedback,
    },
  });
});

// ============================================
// GET FEEDBACK STATISTICS
// ============================================

/**
 * @route   GET /api/v1/feedback/stats/:sessionId
 * @desc    Get feedback statistics for a session
 * @access  Private
 * @params  sessionId - Session ID
 */
export const getFeedbackStats = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();

  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(sessionId, userId);

  // Get statistics using static method
  const stats = await Feedback.getSessionStats(sessionId);

  logInfo('Feedback stats fetched', {
    sessionId,
    stats,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      stats,
    },
  });
});

// ============================================
// GET CRITICAL FEEDBACK
// ============================================

/**
 * @route   GET /api/v1/feedback/critical/:sessionId
 * @desc    Get critical feedback (errors) for a session
 * @access  Private
 * @params  sessionId - Session ID
 */
export const getCriticalFeedback = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();

  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(sessionId, userId);

  // Get critical feedback using static method
  const feedback = await Feedback.findCritical(sessionId).lean();

  logInfo('Critical feedback fetched', {
    sessionId,
    count: feedback.length,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: feedback.length,
    data: {
      feedback,
    },
  });
});

// ============================================
// CREATE FEEDBACK
// ============================================

/**
 * @route   POST /api/v1/feedback
 * @desc    Create new feedback
 * @access  Private
 * @body    sessionId, type, message, severity, suggestion, timestamp, keypoints, etc.
 */
export const createFeedback = catchAsync(async (req, res, next) => {
  const { sessionId } = req.body;
  const userId = req.user._id.toString();

  // Validate sessionId
  if (!sessionId) {
    return next(new AppError('Session ID is required', HTTP_STATUS.BAD_REQUEST));
  }

  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(sessionId, userId);

  // Create feedback
  const feedback = await Feedback.create({
    ...req.body,
    sessionId,
  });

  logInfo('Feedback created', {
    feedbackId: feedback._id.toString(),
    sessionId,
    type: feedback.type,
    severity: feedback.severity,
    createdBy: userId,
  });

  res.status(HTTP_STATUS.CREATED).json({
    status: API_STATUS.SUCCESS,
    data: {
      feedback,
    },
  });
});

// ============================================
// UPDATE FEEDBACK
// ============================================

/**
 * @route   PUT /api/v1/feedback/:id
 * @desc    Update feedback
 * @access  Private
 * @params  id - Feedback ID
 */
export const updateFeedback = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Find feedback
  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return next(new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify session access
  const session = await ExerciseSession.findById(feedback.sessionId);
  if (!session || session.userId.toString() !== userId.toString()) {
    return next(new AppError('You do not have access to this feedback', HTTP_STATUS.FORBIDDEN));
  }

  // Prevent updating certain fields
  const updateData = { ...req.body };
  delete updateData.sessionId; // Cannot change session
  delete updateData._id; // Cannot change ID

  // Update feedback
  const updatedFeedback = await Feedback.findByIdAndUpdate(id, updateData, {
    new: true, // Return updated document
    runValidators: true, // Run schema validators
  });

  logInfo('Feedback updated', {
    feedbackId: id,
    updatedBy: userId,
    updatedFields: Object.keys(updateData),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      feedback: updatedFeedback,
    },
  });
});

// ============================================
// RESOLVE FEEDBACK
// ============================================

/**
 * @route   PATCH /api/v1/feedback/:id/resolve
 * @desc    Mark feedback as resolved
 * @access  Private
 * @params  id - Feedback ID
 * @body    userNotes (optional)
 */
export const resolveFeedback = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();
  const { userNotes } = req.body;

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Find feedback
  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return next(new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify session access
  const session = await ExerciseSession.findById(feedback.sessionId);
  if (!session || session.userId.toString() !== userId.toString()) {
    return next(new AppError('You do not have access to this feedback', HTTP_STATUS.FORBIDDEN));
  }

  // Check if already resolved
  if (feedback.isResolved) {
    return next(new AppError('Feedback is already resolved', HTTP_STATUS.BAD_REQUEST));
  }

  // Resolve feedback using instance method
  await feedback.resolve(userNotes || '');

  logInfo('Feedback resolved', {
    feedbackId: id,
    resolvedBy: userId,
    hasNotes: !!userNotes,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: 'Feedback resolved successfully',
    data: {
      feedback,
    },
  });
});

// ============================================
// DELETE FEEDBACK
// ============================================

/**
 * @route   DELETE /api/v1/feedback/:id
 * @desc    Delete feedback
 * @access  Private
 * @params  id - Feedback ID
 */
export const deleteFeedback = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Find feedback
  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return next(new AppError('Feedback not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify session access
  const session = await ExerciseSession.findById(feedback.sessionId);
  if (!session || session.userId.toString() !== userId.toString()) {
    return next(new AppError('You do not have access to this feedback', HTTP_STATUS.FORBIDDEN));
  }

  // Delete feedback
  await Feedback.findByIdAndDelete(id);

  logInfo('Feedback deleted', {
    feedbackId: id,
    deletedBy: userId,
    sessionId: feedback.sessionId.toString(),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: 'Feedback deleted successfully',
  });
});

// ============================================
// ENHANCE FEEDBACK (AI)
// ============================================

/**
 * @route   POST /api/v1/feedback/enhance
 * @desc    Generate enhanced feedback using AI (Groq)
 * @access  Private
 * @body    sessionId, useAI (optional)
 */
export const enhanceFeedback = catchAsync(async (req, res, next) => {
  const { sessionId, useAI = false } = req.body;
  const userId = req.user._id.toString();

  // Validate sessionId
  if (!sessionId) {
    return next(new AppError('Session ID is required', HTTP_STATUS.BAD_REQUEST));
  }

  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  const session = await verifySessionAccess(sessionId, userId);

  // Get existing feedback for the session
  const existingFeedback = await Feedback.findBySession(sessionId, {
    unresolvedOnly: true,
    sort: { timestamp: 1, priority: -1 },
  }).lean();

  if (existingFeedback.length === 0) {
    return next(new AppError('No unresolved feedback found for this session', HTTP_STATUS.BAD_REQUEST));
  }

  // Get exercise information for context
  const exercise = session.exerciseId
    ? await Exercise.findById(session.exerciseId).lean()
    : null;

  let enhancedFeedback = existingFeedback;

  // Enhance feedback with AI if requested and configured
  if (useAI) {
    if (!isAIConfigured()) {
      logInfo('Groq AI not configured, returning feedback without AI enhancement', {
        sessionId,
      });
    } else {
      try {
        enhancedFeedback = await enhanceFeedbackBatch(existingFeedback, {
          exercise,
          session: {
            duration: session.duration,
            overallScore: session.overallScore,
          },
          parallel: false, // Process sequentially to avoid rate limits (30 req/min)
        });

        logInfo('Feedback enhanced with Groq AI', {
          sessionId,
          count: enhancedFeedback.length,
          enhancedBy: userId,
        });
      } catch (error) {
        logError('Failed to enhance feedback with Groq AI', error);
        // Continue with original feedback if AI enhancement fails
        enhancedFeedback = existingFeedback;
      }
    }
  }

  logInfo('Feedback enhanced', {
    sessionId,
    useAI,
    aiConfigured: isAIConfigured(),
    count: enhancedFeedback.length,
    enhancedBy: userId,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: useAI && isAIConfigured()
      ? 'Feedback enhanced with Groq AI suggestions'
      : useAI && !isAIConfigured()
      ? 'Feedback retrieved (Groq AI not configured)'
      : 'Feedback retrieved',
    results: enhancedFeedback.length,
    data: {
      feedback: enhancedFeedback,
    },
  });
});
