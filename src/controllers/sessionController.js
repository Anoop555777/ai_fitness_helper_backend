/**
 * Session Controller
 *
 * Handles all exercise session-related operations including:
 * - Creating, updating, and deleting sessions
 * - Getting user's sessions with filtering and pagination
 * - Getting sessions by exercise, top sessions, recent sessions
 * - Getting session statistics and progress data
 */

import ExerciseSession from "../models/ExerciseSession.js";
import Exercise from "../models/Exercise.js";
import Feedback from "../models/Feedback.js";
import Goals from "../models/Goals.js";
import User from "../models/User.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import {
  HTTP_STATUS,
  API_STATUS,
  SESSION_DURATION,
  SESSION_SCORE,
} from "../config/constants.js";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import { validateObjectId } from "../utils/validators.js";
import {
  enhanceFeedbackBatch,
  isConfigured as isAIConfigured,
} from "../services/aiService.js";
import {
  deleteFile,
  extractPublicId,
  isConfigured as isCloudinaryConfigured,
} from "../config/cloudinary.js";

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
    throw new AppError("Session not found", HTTP_STATUS.NOT_FOUND);
  }

  // Check if session belongs to user (unless admin)
  if (session.userId.toString() !== userId.toString()) {
    throw new AppError(
      "You do not have access to this session",
      HTTP_STATUS.FORBIDDEN
    );
  }

  return session;
};

/**
 * Build sort object from request query
 * @private
 * @param {string} sortQuery - Sort query string (e.g., "score,-createdAt")
 * @returns {Object} Mongoose sort object
 */
const buildSortObject = (sortQuery) => {
  if (!sortQuery) {
    // Default: sort by recordedAt (when exercise was performed) first, then by createdAt
    return { recordedAt: -1, createdAt: -1 };
  }

  const sortFields = sortQuery.split(",");
  const sortObject = {};

  sortFields.forEach((field) => {
    const trimmedField = field.trim();
    if (trimmedField.startsWith("-")) {
      sortObject[trimmedField.substring(1)] = -1; // Descending
    } else {
      sortObject[trimmedField] = 1; // Ascending
    }
  });

  return sortObject;
};

/**
 * Build pagination options
 * @private
 * @param {Object} query - Request query object
 * @returns {Object} Pagination options { limit, skip, page }
 */
const buildPaginationOptions = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)); // Max 100, default 20
  const skip = (page - 1) * limit;

  return { limit, skip, page };
};

/**
 * Build date range filter
 * @private
 * @param {Object} query - Request query object
 * @returns {Object} Date filter object
 */
const buildDateRangeFilter = (query) => {
  const filter = {};

  if (query.startDate) {
    const startDate = new Date(query.startDate);
    if (isNaN(startDate.getTime())) {
      throw new AppError("Invalid startDate format", HTTP_STATUS.BAD_REQUEST);
    }
    filter.$gte = startDate;
  }

  if (query.endDate) {
    const endDate = new Date(query.endDate);
    if (isNaN(endDate.getTime())) {
      throw new AppError("Invalid endDate format", HTTP_STATUS.BAD_REQUEST);
    }
    // Set to end of day
    endDate.setHours(23, 59, 59, 999);
    filter.$lte = endDate;
  }

  return Object.keys(filter).length > 0 ? filter : null;
};

// ============================================
// CREATE SESSION
// ============================================

/**
 * @route   POST /api/v1/sessions
 * @desc    Create a new exercise session
 * @access  Private
 * @body    exerciseId, duration, poseData, overallScore, etc.
 */
export const createSession = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();
  const { exerciseId } = req.body;

  // Validate exerciseId
  if (!exerciseId) {
    return next(
      new AppError("Exercise ID is required", HTTP_STATUS.BAD_REQUEST)
    );
  }

  const idValidation = validateObjectId(exerciseId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify exercise exists
  const exercise = await Exercise.findById(exerciseId);
  if (!exercise) {
    return next(new AppError("Exercise not found", HTTP_STATUS.NOT_FOUND));
  }

  // Validate duration (model enforces max 3600 seconds = 1 hour)
  if (req.body.duration) {
    if (req.body.duration < SESSION_DURATION.MIN || req.body.duration > 3600) {
      return next(
        new AppError(
          `Duration must be between ${SESSION_DURATION.MIN} and 3600 seconds (1 hour)`,
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }
  }

  // Validate overallScore
  if (req.body.overallScore !== undefined) {
    if (
      req.body.overallScore < SESSION_SCORE.MIN ||
      req.body.overallScore > SESSION_SCORE.MAX
    ) {
      return next(
        new AppError(
          `Score must be between ${SESSION_SCORE.MIN} and ${SESSION_SCORE.MAX}`,
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }
  }

  // Create session
  const session = await ExerciseSession.create({
    ...req.body,
    userId,
    exerciseId,
  });

  // Populate exercise details
  await session.populate("exerciseId", "name category difficulty");

  // Update user stats and streak
  try {
    const user = await User.findById(userId);
    if (user) {
      // Update streak first (based on last activity date)
      await user.updateStreak();

      // Update general stats (total sessions, duration, average score, etc.)
      await user.updateStats({
        duration: session.duration || 0,
        overallScore: session.overallScore,
        exerciseId: exerciseId,
      });

      logInfo("User stats and streak updated", {
        userId,
        newStreak: user.stats.streak,
        totalSessions: user.stats.totalSessions,
      });
    }
  } catch (statsError) {
    // Log error but don't fail the session creation
    logError("Failed to update user stats/streak", statsError);
  }

  logInfo("Session created", {
    sessionId: session._id.toString(),
    userId,
    exerciseId,
    duration: session.duration,
    score: session.overallScore,
  });

  // Extract feedback data from request body (if provided)
  const feedbackData = req.body.feedback || [];
  let createdFeedback = [];
  let enhancedFeedback = [];
  let aiEnhancementSucceeded = false;

  logInfo("Session creation - feedback data received", {
    sessionId: session._id.toString(),
    feedbackCount: feedbackData.length,
    hasFeedback: feedbackData.length > 0,
    feedbackSample:
      feedbackData.length > 0
        ? JSON.stringify(feedbackData[0]).substring(0, 200)
        : "none",
  });

  // Create feedback entries if provided
  if (feedbackData.length > 0) {
    try {
      // Create feedback entries
      // Map frontend feedback types to backend enum values
      // Frontend sends: 'error', 'warning', etc.
      // Backend expects: 'form_error', 'improvement', 'encouragement', 'warning', 'info'
      const mapFeedbackType = (type) => {
        const typeMap = {
          error: "form_error",
          form_error: "form_error",
          warning: "warning",
          improvement: "improvement",
          encouragement: "encouragement",
          info: "info",
        };
        return typeMap[type] || "form_error";
      };

      const feedbackToCreate = feedbackData.map((fb) => ({
        sessionId: session._id,
        type: mapFeedbackType(fb.type),
        severity: fb.severity || "error",
        message: fb.message,
        suggestion: fb.suggestion || null,
        timestamp: fb.timestamp || 0,
        keypoints: fb.keypoints || [],
        aiGenerated: false,
        confidence: fb.confidence || 0.8,
        metadata: fb.metadata || {},
      }));

      createdFeedback = await Feedback.insertMany(feedbackToCreate);

      logInfo("Feedback created for session", {
        sessionId: session._id.toString(),
        feedbackCount: createdFeedback.length,
      });

      // Convert Mongoose documents to plain objects for AI processing
      // This is critical because spread operator (...) doesn't work correctly on Mongoose documents
      const feedbackAsPlainObjects = createdFeedback.map((fb) => ({
        _id: fb._id,
        sessionId: fb.sessionId,
        type: fb.type,
        severity: fb.severity,
        message: fb.message,
        suggestion: fb.suggestion || null,
        timestamp: fb.timestamp,
        keypoints: fb.keypoints || [],
        aiGenerated: fb.aiGenerated,
        confidence: fb.confidence,
        metadata: fb.metadata || {},
      }));

      // Automatically enhance feedback with Groq AI if configured
      if (isAIConfigured()) {
        // AI Enhancement Configuration
        const AI_ENHANCEMENT_CONFIG = {
          TIMEOUT_MS: 15000, // 15 seconds timeout per feedback item
          MAX_RETRIES: 2, // Retry up to 2 times for transient errors
          RETRY_DELAY_MS: 2000, // 2 seconds between retries
          BATCH_SIZE: 5, // Process feedback in batches to manage memory
        };

        try {
          logInfo("Starting AI feedback enhancement", {
            sessionId: session._id.toString(),
            feedbackCount: feedbackAsPlainObjects.length,
            exercise: exercise.name,
            exerciseId: exerciseId,
          });

          // Helper: Create timeout wrapper for AI requests
          const withTimeout = (promise, timeoutMs, operation) => {
            return Promise.race([
              promise,
              new Promise((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `AI enhancement timeout after ${timeoutMs}ms for ${operation}`
                      )
                    ),
                  timeoutMs
                )
              ),
            ]);
          };

          // Helper: Validate AI suggestion before saving
          const isValidSuggestion = (suggestion) => {
            if (!suggestion || typeof suggestion !== "string") return false;
            const trimmed = suggestion.trim();
            // Must have content, reasonable length (10-500 chars), and not just whitespace
            return (
              trimmed.length >= 10 &&
              trimmed.length <= 500 &&
              trimmed.split(/\s+/).length >= 3 // At least 3 words
            );
          };

          // Helper: Categorize errors for better handling
          const categorizeError = (error) => {
            if (error.status === 429) {
              return {
                type: "RATE_LIMIT",
                retryable: true,
                message: "Rate limit exceeded",
              };
            }
            if (
              error.code === "ETIMEDOUT" ||
              error.message?.includes("timeout")
            ) {
              return {
                type: "TIMEOUT",
                retryable: true,
                message: "Request timed out",
              };
            }
            if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
              return {
                type: "NETWORK",
                retryable: true,
                message: "Network error",
              };
            }
            if (error.status >= 500) {
              return {
                type: "SERVER_ERROR",
                retryable: true,
                message: "Server error",
              };
            }
            if (error.status >= 400 && error.status < 500) {
              return {
                type: "CLIENT_ERROR",
                retryable: false,
                message: "Invalid request",
              };
            }
            return {
              type: "UNKNOWN",
              retryable: true,
              message: error.message || "Unknown error",
            };
          };

          // Process feedback with improved error handling and partial success support
          const processedFeedback = [];
          let successCount = 0;
          let failureCount = 0;
          let skippedCount = 0;

          // Process in batches to manage memory and provide better progress tracking
          const batches = [];
          for (
            let i = 0;
            i < feedbackAsPlainObjects.length;
            i += AI_ENHANCEMENT_CONFIG.BATCH_SIZE
          ) {
            batches.push(
              feedbackAsPlainObjects.slice(
                i,
                i + AI_ENHANCEMENT_CONFIG.BATCH_SIZE
              )
            );
          }

          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            logInfo(
              `Processing AI enhancement batch ${batchIndex + 1}/${
                batches.length
              }`,
              {
                sessionId: session._id.toString(),
                batchSize: batch.length,
                totalBatches: batches.length,
              }
            );

            // Process batch with timeout wrapper
            try {
              const batchResults = await withTimeout(
                enhanceFeedbackBatch(batch, {
                  exercise: exercise.toObject ? exercise.toObject() : exercise,
                  session: {
                    duration: session.duration,
                    overallScore: session.overallScore,
                  },
                  parallel: false, // Sequential to respect rate limits (30 req/min)
                }),
                AI_ENHANCEMENT_CONFIG.TIMEOUT_MS * batch.length, // Timeout scaled by batch size
                `batch ${batchIndex + 1}`
              );

              // Process each enhanced result
              for (let i = 0; i < batchResults.length; i++) {
                const enhanced = batchResults[i];
                const original =
                  createdFeedback[
                    batchIndex * AI_ENHANCEMENT_CONFIG.BATCH_SIZE + i
                  ];

                // Check if AI enhancement was successful and suggestion is valid
                if (
                  enhanced.aiGenerated &&
                  isValidSuggestion(enhanced.suggestion) &&
                  enhanced.suggestion !== (original.suggestion || null)
                ) {
                  try {
                    // Update in database - batch update would be better but harder to track individual success
                    const updated = await Feedback.findByIdAndUpdate(
                      original._id,
                      {
                        suggestion: enhanced.suggestion.trim(),
                        aiGenerated: true,
                      },
                      { new: true, lean: true }
                    );
                    processedFeedback.push(updated);
                    successCount++;
                  } catch (updateError) {
                    logError("Failed to update feedback with AI suggestion", {
                      feedbackId: original._id.toString(),
                      error: updateError.message,
                    });
                    // Keep original if update fails
                    processedFeedback.push(
                      original.toObject ? original.toObject() : original
                    );
                    failureCount++;
                  }
                } else {
                  // Keep original feedback if no valid enhancement
                  processedFeedback.push(
                    original.toObject ? original.toObject() : original
                  );
                  if (enhanced.aiError || !enhanced.aiGenerated) {
                    skippedCount++;
                    logInfo("Skipped AI enhancement for feedback", {
                      feedbackId: original._id.toString(),
                      reason:
                        enhanced.aiError || "No valid suggestion generated",
                    });
                  }
                }
              }
            } catch (batchError) {
              // Handle batch-level errors (timeout, network issues)
              const errorInfo = categorizeError(batchError);

              logError("AI enhancement batch failed", {
                sessionId: session._id.toString(),
                batchIndex: batchIndex + 1,
                errorType: errorInfo.type,
                errorMessage: errorInfo.message,
                retryable: errorInfo.retryable,
              });

              // Add original feedback for failed batch items
              batch.forEach((_, index) => {
                const original =
                  createdFeedback[
                    batchIndex * AI_ENHANCEMENT_CONFIG.BATCH_SIZE + index
                  ];
                processedFeedback.push(
                  original.toObject ? original.toObject() : original
                );
                failureCount++;
              });
            }
          }

          // Set final feedback array
          enhancedFeedback = processedFeedback;

          // Determine if AI enhancement succeeded (at least one successful enhancement)
          aiEnhancementSucceeded = successCount > 0;

          logInfo("AI feedback enhancement completed", {
            sessionId: session._id.toString(),
            total: feedbackAsPlainObjects.length,
            successful: successCount,
            failed: failureCount,
            skipped: skippedCount,
            enhancementRate: `${(
              (successCount / feedbackAsPlainObjects.length) *
              100
            ).toFixed(1)}%`,
            aiEnhanced: aiEnhancementSucceeded,
          });
        } catch (aiError) {
          // Catch-all for unexpected errors
          const errorInfo = categorizeError(aiError);

          logError("Critical error during AI feedback enhancement", {
            sessionId: session._id.toString(),
            errorType: errorInfo.type,
            errorMessage: errorInfo.message,
            stack: aiError.stack,
          });

          // Continue with original feedback if critical error occurs
          enhancedFeedback = createdFeedback.map((fb) =>
            fb.toObject ? fb.toObject() : fb
          );
          aiEnhancementSucceeded = false;
        }
      } else {
        // Convert to plain objects for response
        enhancedFeedback = createdFeedback.map((fb) =>
          fb.toObject ? fb.toObject() : fb
        );
        logInfo("Groq AI not configured, skipping feedback enhancement", {
          sessionId: session._id.toString(),
        });
      }
    } catch (feedbackError) {
      logError("Failed to create feedback for session", feedbackError);
      // Don't fail the whole request if feedback creation fails
      // Continue with session creation response
    }
  }

  // Convert session to plain object for response
  const sessionObj = session.toObject ? session.toObject() : session;

  // Prepare final feedback array - ensure it's always properly serialized
  let finalFeedback = [];
  if (enhancedFeedback.length > 0) {
    finalFeedback = enhancedFeedback;
  } else if (createdFeedback.length > 0) {
    finalFeedback = createdFeedback.map((fb) =>
      fb.toObject ? fb.toObject() : fb
    );
  }

  // Calculate AI enhancement statistics for response
  const aiEnhancedCount = finalFeedback.filter(
    (fb) => fb.aiGenerated === true
  ).length;
  const totalFeedbackCount = finalFeedback.length;

  logInfo("Session creation response - feedback summary", {
    sessionId: session._id.toString(),
    createdFeedbackCount: createdFeedback.length,
    enhancedFeedbackCount: enhancedFeedback.length,
    finalFeedbackCount: finalFeedback.length,
    aiEnhancedCount,
    aiEnhanced: aiEnhancementSucceeded,
    aiConfigured: isAIConfigured(),
  });

  // Build informative response message
  let responseMessage = "Session created successfully";
  if (createdFeedback.length > 0) {
    if (isAIConfigured()) {
      if (aiEnhancementSucceeded && aiEnhancedCount > 0) {
        if (aiEnhancedCount === totalFeedbackCount) {
          responseMessage = `Session created with ${totalFeedbackCount} feedback item${
            totalFeedbackCount > 1 ? "s" : ""
          } enhanced with AI`;
        } else {
          responseMessage = `Session created with ${totalFeedbackCount} feedback item${
            totalFeedbackCount > 1 ? "s" : ""
          } (${aiEnhancedCount} enhanced with AI)`;
        }
      } else {
        responseMessage = `Session created with ${totalFeedbackCount} feedback item${
          totalFeedbackCount > 1 ? "s" : ""
        } (AI enhancement unavailable)`;
      }
    } else {
      responseMessage = `Session created with ${totalFeedbackCount} feedback item${
        totalFeedbackCount > 1 ? "s" : ""
      }`;
    }
  }

  // Return session with enhanced feedback
  res.status(HTTP_STATUS.CREATED).json({
    status: API_STATUS.SUCCESS,
    message: responseMessage,
    data: {
      session: sessionObj,
      feedback: finalFeedback,
      aiEnhanced: aiEnhancementSucceeded,
      aiStats:
        isAIConfigured() && createdFeedback.length > 0
          ? {
              total: totalFeedbackCount,
              enhanced: aiEnhancedCount,
              rate:
                totalFeedbackCount > 0
                  ? ((aiEnhancedCount / totalFeedbackCount) * 100).toFixed(1)
                  : 0,
            }
          : null,
    },
  });
});

// ============================================
// GET USER SESSIONS
// ============================================

/**
 * @route   GET /api/v1/sessions
 * @desc    Get user's sessions with optional filtering and pagination
 * @access  Private
 * @query   exerciseId, limit, page, sort, startDate, endDate
 */
export const getUserSessions = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();

  // Build filter
  const filter = { userId };

  // Filter by exerciseId
  if (req.query.exerciseId) {
    const idValidation = validateObjectId(req.query.exerciseId);
    if (!idValidation.valid) {
      return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
    }
    filter.exerciseId = req.query.exerciseId;
  }

  // Filter by date range
  const dateFilter = buildDateRangeFilter(req.query);
  if (dateFilter) {
    filter.recordedAt = dateFilter;
  }

  // Build sort
  const sort = buildSortObject(req.query.sort);

  // Build pagination
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Execute query
  const sessions = await ExerciseSession.find(filter)
    .populate("exerciseId", "name category difficulty")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await ExerciseSession.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo("User sessions fetched", {
    userId,
    count: sessions.length,
    total,
    page,
    filters: Object.keys(filter),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: sessions.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      sessions,
    },
  });
});

// ============================================
// GET SESSION BY ID
// ============================================

/**
 * @route   GET /api/v1/sessions/:id
 * @desc    Get session by ID with full details
 * @access  Private
 * @params  id - Session ID
 */
export const getSessionById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(id, userId);

  // Find session with populated exercise
  const session = await ExerciseSession.findById(id)
    .populate(
      "exerciseId",
      "name category difficulty description targetMuscles formRules"
    )
    .populate("userId", "username email profile")
    .lean();

  if (!session) {
    return next(new AppError("Session not found", HTTP_STATUS.NOT_FOUND));
  }

  logInfo("Session fetched by ID", {
    sessionId: id,
    userId,
    exerciseId: session.exerciseId?._id?.toString(),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      session,
    },
  });
});

// ============================================
// UPDATE SESSION
// ============================================

/**
 * @route   PUT /api/v1/sessions/:id
 * @desc    Update a session
 * @access  Private
 * @params  id - Session ID
 * @body    notes, tags, isPublic, etc.
 */
export const updateSession = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  await verifySessionAccess(id, userId);

  // Prevent updating certain fields
  const updateData = { ...req.body };
  delete updateData.userId; // Cannot change user
  delete updateData._id; // Cannot change ID

  // Validate overallScore if provided
  if (updateData.overallScore !== undefined) {
    if (
      updateData.overallScore < SESSION_SCORE.MIN ||
      updateData.overallScore > SESSION_SCORE.MAX
    ) {
      return next(
        new AppError(
          `Score must be between ${SESSION_SCORE.MIN} and ${SESSION_SCORE.MAX}`,
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }
  }

  // Update session
  const updatedSession = await ExerciseSession.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true, // Return updated document
      runValidators: true, // Run schema validators
    }
  )
    .populate("exerciseId", "name category difficulty")
    .lean();

  logInfo("Session updated", {
    sessionId: id,
    userId,
    updatedFields: Object.keys(updateData),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      session: updatedSession,
    },
  });
});

// ============================================
// DELETE SESSION
// ============================================

/**
 * @route   DELETE /api/v1/sessions/:id
 * @desc    Delete a session
 * @access  Private
 * @params  id - Session ID
 */
export const deleteSession = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  const session = await verifySessionAccess(id, userId);

  // Delete video from Cloudinary if it exists
  if (session.videoUrl) {

    try {
      // Check if Cloudinary is configured
      if (isCloudinaryConfigured()) {
        // Extract public ID from video URL
        const publicId = extractPublicId(session.videoUrl);

        if (publicId) {
          // Delete video from Cloudinary

          await deleteFile(publicId, "video");

          logInfo("Session video deleted from Cloudinary", {
            sessionId: id,
            userId,
            publicId,
          });
        } else {

          logWarn("Could not extract public ID from video URL", {
            sessionId: id,
            userId,
            videoUrl: session.videoUrl,
          });
        }
      } else {

        logInfo("Cloudinary not configured, skipping video deletion", {
          sessionId: id,
          userId,
        });
      }
    } catch (videoError) {
      // Log error but don't fail the entire deletion
      // The session and feedback will still be deleted

      logError("Failed to delete video from Cloudinary", {
        error: videoError.message,
        sessionId: id,
        userId,
        videoUrl: session.videoUrl,
        stack: videoError.stack,
      });
      // Continue with session deletion even if video deletion fails
    }
  }

  // Delete associated feedback first (optional, but good practice)
  await Feedback.deleteMany({ sessionId: id });

  // Delete session
  await ExerciseSession.findByIdAndDelete(id);

  logInfo("Session deleted", {
    sessionId: id,
    userId,
    exerciseId: session.exerciseId.toString(),
    hadVideo: !!session.videoUrl,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: "Session deleted successfully",
  });
});

// ============================================
// GET SESSION STATISTICS
// ============================================

/**
 * @route   GET /api/v1/sessions/:id/stats
 * @desc    Get statistics for a specific session
 * @access  Private
 * @params  id - Session ID
 */
export const getSessionStats = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  const session = await verifySessionAccess(id, userId);

  // Get stats using instance method
  const stats = await session.getStats();

  // Get average angles if pose data exists
  const averageAngles = {};
  if (session.poseData?.keypoints?.length > 0) {
    const angleTypes = [
      "kneeAngle",
      "hipAngle",
      "backAngle",
      "shoulderAngle",
      "ankleAngle",
    ];
    angleTypes.forEach((angleType) => {
      const avgAngle = session.getAverageAngle(angleType);
      if (avgAngle !== null) {
        averageAngles[angleType] = avgAngle;
      }
    });
  }

  logInfo("Session stats fetched", {
    sessionId: id,
    userId,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      stats: {
        ...stats,
        averageAngles,
      },
    },
  });
});

// ============================================
// GET SESSION PROGRESS
// ============================================

/**
 * @route   GET /api/v1/sessions/:id/progress
 * @desc    Get progress data for a session
 * @access  Private
 * @params  id - Session ID
 */
export const getSessionProgress = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  const session = await verifySessionAccess(id, userId);

  // Get all sessions for the same exercise by this user
  const allExerciseSessions = await ExerciseSession.find({
    userId,
    exerciseId: session.exerciseId,
    _id: { $ne: id }, // Exclude current session
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("overallScore createdAt duration")
    .lean();

  // Build score history (current session + previous sessions)
  const scoreHistory = [
    session.overallScore,
    ...allExerciseSessions.map((s) => s.overallScore),
  ].reverse(); // Oldest to newest

  // Calculate improvements
  const improvements = [];
  if (allExerciseSessions.length > 0) {
    const previousScore = allExerciseSessions[0].overallScore;
    const currentScore = session.overallScore;

    if (currentScore > previousScore) {
      improvements.push(
        `Score improved by ${(currentScore - previousScore).toFixed(1)} points`
      );
    }

    // Check for consistency
    const recentScores = allExerciseSessions
      .slice(0, 5)
      .map((s) => s.overallScore);
    const avgRecentScore =
      recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    if (Math.abs(currentScore - avgRecentScore) < 5) {
      improvements.push("Consistent performance");
    }
  }

  // Calculate trends
  const trends = {
    score: "stable",
    consistency: "good",
  };

  if (scoreHistory.length >= 3) {
    const recent = scoreHistory.slice(-3);
    const isImproving = recent[2] > recent[0];
    const isDeclining = recent[2] < recent[0];

    if (isImproving) {
      trends.score = "improving";
    } else if (isDeclining) {
      trends.score = "declining";
    }

    // Check consistency
    const variance =
      recent.reduce((acc, score) => acc + Math.pow(score - recent[1], 2), 0) /
      recent.length;
    if (variance > 100) {
      trends.consistency = "needs-improvement";
    }
  }

  logInfo("Session progress fetched", {
    sessionId: id,
    userId,
    exerciseId: session.exerciseId.toString(),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      progress: {
        sessionId: id,
        scoreHistory,
        improvements,
        trends,
        previousSessions: allExerciseSessions.length,
      },
    },
  });
});

// ============================================
// GET TOP SESSIONS
// ============================================

/**
 * @route   GET /api/v1/sessions/top
 * @desc    Get top sessions by score
 * @access  Private
 * @query   limit, exerciseId (optional)
 */
export const getTopSessions = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10)); // Max 50, default 10

  // Build filter - only user's sessions
  const filter = { userId };

  // Filter by exerciseId if provided
  if (req.query.exerciseId) {
    const idValidation = validateObjectId(req.query.exerciseId);
    if (!idValidation.valid) {
      return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
    }
    filter.exerciseId = req.query.exerciseId;
  }

  // Get top sessions - filter by user first, then by exercise if provided
  let query = ExerciseSession.find({ userId, overallScore: { $gte: 0 } });

  if (filter.exerciseId) {
    query = query.where("exerciseId").equals(filter.exerciseId);
  }

  const sessions = await query
    .sort({ overallScore: -1, createdAt: -1 })
    .limit(limit)
    .populate("exerciseId", "name category difficulty")
    .lean();

  logInfo("Top sessions fetched", {
    userId,
    count: sessions.length,
    exerciseId: filter.exerciseId || "all",
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: sessions.length,
    data: {
      sessions,
    },
  });
});

// ============================================
// GET RECENT SESSIONS
// ============================================

/**
 * @route   GET /api/v1/sessions/recent
 * @desc    Get recent sessions
 * @access  Private
 * @query   limit (default: 10)
 */
export const getRecentSessions = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10)); // Max 50, default 10

  // Get recent sessions sorted by recordedAt (when exercise was performed) first,
  // then by createdAt as fallback. This ensures exercises are sorted by actual performance date.
  const sessions = await ExerciseSession.findByUser(userId, {
    limit,
    sort: { recordedAt: -1, createdAt: -1 }, // Sort by recorded date first (newest first), then by created date
  })
    .populate("exerciseId", "name category difficulty")
    .lean();

  logInfo("Recent sessions fetched", {
    userId,
    count: sessions.length,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: sessions.length,
    data: {
      sessions,
    },
  });
});

// ============================================
// GET SESSIONS BY EXERCISE
// ============================================

/**
 * @route   GET /api/v1/sessions/exercise/:exerciseId
 * @desc    Get all sessions for a specific exercise
 * @access  Private
 * @params  exerciseId - Exercise ID
 * @query   limit, page, sort
 */
export const getSessionsByExercise = catchAsync(async (req, res, next) => {
  const { exerciseId } = req.params;
  const userId = req.user._id.toString();

  // Validate exerciseId
  const idValidation = validateObjectId(exerciseId);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify exercise exists
  const exercise = await Exercise.findById(exerciseId);
  if (!exercise) {
    return next(new AppError("Exercise not found", HTTP_STATUS.NOT_FOUND));
  }

  // Build sort
  const sort = buildSortObject(req.query.sort);

  // Build pagination
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Build filter
  const filter = {
    userId,
    exerciseId,
  };

  // Execute query
  const sessions = await ExerciseSession.find(filter)
    .populate("exerciseId", "name category difficulty")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await ExerciseSession.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo("Sessions fetched by exercise", {
    userId,
    exerciseId,
    count: sessions.length,
    total,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: sessions.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      sessions,
    },
  });
});

// ============================================
// EXPORT SESSIONS AS PDF
// ============================================

/**
 * @route   GET /api/v1/sessions/export
 * @desc    Export user's sessions as PDF
 * @access  Private
 * @query   exerciseId, startDate, endDate (optional filters)
 */
export const exportSessions = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();

  // Build filter (same as getUserSessions)
  const filter = { userId };

  // Filter by exerciseId
  if (req.query.exerciseId) {
    const idValidation = validateObjectId(req.query.exerciseId);
    if (!idValidation.valid) {
      return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
    }
    filter.exerciseId = req.query.exerciseId;
  }

  // Filter by date range
  const dateFilter = buildDateRangeFilter(req.query);
  if (dateFilter) {
    filter.recordedAt = dateFilter;
  }

  // Fetch all sessions (no pagination for export)
  const sessions = await ExerciseSession.find(filter)
    .populate("exerciseId", "name category difficulty")
    .sort({ recordedAt: -1, createdAt: -1 })
    .lean();

  if (sessions.length === 0) {
    return next(
      new AppError("No sessions found to export", HTTP_STATUS.NOT_FOUND)
    );
  }

  // Generate PDF
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  // Set response headers
  res.setHeader("Content-Type", "application/pdf");
  const filename = `Exercise_History_${
    new Date().toISOString().split("T")[0]
  }.pdf`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Pipe PDF to response
  doc.pipe(res);

  // Page dimensions
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const maxY = pageHeight - margin;

  // Logo settings
  const logoSize = 60;
  const logoY = margin;
  let currentY = margin;

  // Try to add logo at the top
  try {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const { dirname } = path;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Try multiple possible logo paths
    const logoPaths = [
      path.join(__dirname, "../../../frontend/public/assets/logo.jpg"),
      path.join(__dirname, "../../public/assets/logo.jpg"),
      path.join(process.cwd(), "public/assets/logo.jpg"),
      path.join(process.cwd(), "../frontend/public/assets/logo.jpg"),
    ];

    let logoPath = null;
    for (const logoPathCandidate of logoPaths) {
      try {
        if (fs.existsSync(logoPathCandidate)) {
          logoPath = logoPathCandidate;
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }

    if (logoPath) {
      // Add logo centered at the top
      doc.image(logoPath, pageWidth / 2 - logoSize / 2, logoY, {
        width: logoSize,
        height: logoSize,
      });
      // Set Y position below logo with spacing
      currentY = logoY + logoSize + 20;
    } else {
      // If logo not found, start from margin
      currentY = margin + 10;
    }
  } catch (error) {
    // If logo loading fails, continue without it
    logInfo("Could not load logo for PDF", { error: error.message });
    currentY = margin + 10;
  }

  // Set Y position for title (below logo)
  doc.y = currentY;

  // Add title
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("Exercise History", { align: "center" });
  doc.moveDown(0.5);

  // Add export date
  const exportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Exported on: ${exportDate}`, { align: "center" });
  doc.moveDown(2);

  // Helper function to format duration
  const formatDuration = (seconds) => {
    if (!seconds || typeof seconds !== "number") return "0 min";
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  };

  // Helper function to get exercise name
  const getExerciseName = (exerciseId) => {
    if (!exerciseId) return "Unknown Exercise";
    if (typeof exerciseId === "string") return "Loading...";
    if (typeof exerciseId === "object" && exerciseId.name)
      return exerciseId.name;
    return "Unknown Exercise";
  };

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      return "N/A";
    }
  };

  // Table settings
  const startX = margin;
  currentY = doc.y; // Use current Y position after title
  const rowHeight = 20;
  const colWidths = [100, 120, 60, 50, 60];
  const headers = ["Exercise", "Date & Time", "Duration", "Score", "Status"];

  // Draw table header
  doc.fontSize(10).font("Helvetica-Bold");
  let x = startX;
  headers.forEach((header, i) => {
    doc.text(header, x, currentY, { width: colWidths[i] });
    x += colWidths[i];
  });

  // Draw header underline
  doc
    .moveTo(startX, currentY + 15)
    .lineTo(startX + colWidths.reduce((a, b) => a + b, 0), currentY + 15)
    .stroke();

  // Draw table rows
  doc.font("Helvetica").fontSize(9);
  currentY += rowHeight;

  sessions.forEach((session) => {
    // Check if we need a new page (leave space for at least one more row)
    if (currentY + rowHeight > maxY) {
      doc.addPage();
      currentY = margin;

      // Redraw header on new page
      doc.fontSize(10).font("Helvetica-Bold");
      x = startX;
      headers.forEach((header, i) => {
        doc.text(header, x, currentY, { width: colWidths[i] });
        x += colWidths[i];
      });
      doc
        .moveTo(startX, currentY + 15)
        .lineTo(startX + colWidths.reduce((a, b) => a + b, 0), currentY + 15)
        .stroke();
      doc.font("Helvetica").fontSize(9);
      currentY += rowHeight;
    }

    const exerciseName = getExerciseName(session.exerciseId);
    const dateTime = formatDate(session.recordedAt || session.createdAt);
    const duration = formatDuration(session.duration);
    const score = Math.round(session.overallScore || 0);
    const status = "Completed";

    const rowData = [
      exerciseName,
      dateTime,
      duration,
      score.toString(),
      status,
    ];

    x = startX;
    rowData.forEach((cell, i) => {
      // Truncate long text
      const cellText =
        String(cell).length > 20
          ? String(cell).substring(0, 17) + "..."
          : String(cell);
      doc.text(cellText, x, currentY, { width: colWidths[i] });
      x += colWidths[i];
    });

    currentY += rowHeight;
  });

  // Add summary at the end (only if there's space, otherwise new page)
  if (currentY + 100 > maxY) {
    doc.addPage();
    currentY = margin;
  } else {
    currentY += 20; // Add some spacing
  }

  doc.fontSize(16).font("Helvetica-Bold").text("Summary", startX, currentY);
  currentY += 25;
  doc.fontSize(12).font("Helvetica");
  doc.text(`Total Sessions: ${sessions.length}`, startX, currentY);
  currentY += 15;
  doc.text(
    `Date Range: ${
      sessions.length > 0
        ? formatDate(
            sessions[sessions.length - 1].recordedAt ||
              sessions[sessions.length - 1].createdAt
          )
        : "N/A"
    } - ${
      sessions.length > 0
        ? formatDate(sessions[0].recordedAt || sessions[0].createdAt)
        : "N/A"
    }`,
    startX,
    currentY
  );
  currentY += 15;

  // Calculate average score
  const avgScore =
    sessions.reduce((sum, s) => sum + (s.overallScore || 0), 0) /
    sessions.length;
  doc.text(`Average Score: ${Math.round(avgScore)}`, startX, currentY);

  // Finalize PDF
  doc.end();

  logInfo("Sessions exported as PDF", {
    userId,
    count: sessions.length,
    filters: Object.keys(filter),
  });
});

// ============================================
// EXPORT SINGLE SESSION AS PDF
// ============================================

/**
 * @route   GET /api/v1/sessions/:id/export
 * @desc    Export a single session as PDF with all details
 * @access  Private
 * @params  id - Session ID
 */
export const exportSession = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Verify session access
  const session = await verifySessionAccess(id, userId);

  // Populate exercise and user data
  const populatedSession = await ExerciseSession.findById(id)
    .populate(
      "exerciseId",
      "name category difficulty description targetMuscles"
    )
    .populate("userId", "username email profile")
    .lean();

  if (!populatedSession) {
    return next(new AppError("Session not found", HTTP_STATUS.NOT_FOUND));
  }

  // Fetch session stats
  let stats = null;
  try {
    const sessionInstance = await ExerciseSession.findById(id);
    if (sessionInstance) {
      stats = await sessionInstance.getStats();
    }
  } catch (error) {
    // Stats are optional
    logInfo("Could not fetch session stats for PDF", { sessionId: id });
  }

  // Fetch feedback
  let feedback = [];
  try {
    const feedbackList = await Feedback.find({ sessionId: id })
      .sort({ timestamp: 1 })
      .limit(100)
      .lean();
    feedback = feedbackList || [];
  } catch (error) {
    // Feedback is optional
    logInfo("Could not fetch feedback for PDF", { sessionId: id });
  }

  // Extract exercise name before PDF generation (needed for filename and content)
  const exerciseName = populatedSession.exerciseId?.name || "Exercise";
  const sessionDate = new Date(
    populatedSession.recordedAt || populatedSession.createdAt
  )
    .toISOString()
    .split("T")[0];
  const filename = `Session_${exerciseName.replace(
    /\s+/g,
    "_"
  )}_${sessionDate}.pdf`;

  // Generate PDF with error handling
  let doc;
  try {
    const PDFDocument = (await import("pdfkit")).default;
    doc = new PDFDocument({ margin: 50, size: "A4" });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);
  } catch (initError) {
    logError("Error initializing PDF", initError);
    return next(
      new AppError(
        "Failed to initialize PDF generation",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }

  // Page dimensions
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const maxY = pageHeight - margin;

  // Logo settings
  const logoSize = 60;
  const logoY = margin;
  let currentY = margin;

  // Try to add logo at the top
  try {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const { dirname } = path;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const logoPaths = [
      path.join(__dirname, "../../../frontend/public/assets/logo.jpg"),
      path.join(__dirname, "../../public/assets/logo.jpg"),
      path.join(process.cwd(), "public/assets/logo.jpg"),
      path.join(process.cwd(), "../frontend/public/assets/logo.jpg"),
    ];

    let logoPath = null;
    for (const logoPathCandidate of logoPaths) {
      try {
        if (fs.existsSync(logoPathCandidate)) {
          logoPath = logoPathCandidate;
          break;
        }
      } catch (e) {
        // Continue to next path
      }
    }

    if (logoPath) {
      doc.image(logoPath, pageWidth / 2 - logoSize / 2, logoY, {
        width: logoSize,
        height: logoSize,
      });
      currentY = logoY + logoSize + 20;
    } else {
      currentY = margin + 10;
    }
  } catch (error) {
    logInfo("Could not load logo for PDF", { error: error.message });
    currentY = margin + 10;
  }

  // Helper function to ensure currentY is valid
  const ensureValidY = (y) => {
    if (typeof y !== "number" || isNaN(y) || y <= 0) {
      return margin + 10;
    }
    return y;
  };

  // Set Y position for title - ensure it's valid
  currentY = ensureValidY(currentY);
  doc.y = currentY;

  // Add title
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("Session Report", { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(16)
    .font("Helvetica")
    .text(exerciseName || "Exercise Session", { align: "center" });
  doc.moveDown(1);

  // Update currentY after title - use doc.y or fallback
  currentY = ensureValidY(doc.y);

  // Helper functions
  const formatDuration = (seconds) => {
    if (!seconds || typeof seconds !== "number") return "0 min";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes === 0) return `${secs}s`;
    if (secs === 0) return `${minutes} min`;
    return `${minutes} min ${secs}s`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      return "N/A";
    }
  };

  // Session Overview Section
  currentY = ensureValidY(doc.y);
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Session Overview", margin, currentY);
  currentY += 20;

  const overviewData = [
    ["Overall Score", `${Math.round(populatedSession.overallScore || 0)}/100`],
    ["Duration", formatDuration(populatedSession.duration)],
    [
      "Date & Time",
      formatDate(populatedSession.recordedAt || populatedSession.createdAt),
    ],
    ["Quality Rating", (populatedSession.qualityRating || "N/A").toUpperCase()],
  ];

  doc.fontSize(10).font("Helvetica");
  overviewData.forEach(([label, value]) => {
    // Ensure currentY is valid
    currentY = ensureValidY(currentY);

    if (currentY + 15 > maxY) {
      doc.addPage();
      currentY = margin;
    }

    // Ensure value is a string
    const safeValue = value != null ? String(value) : "N/A";
    try {
      doc.text(`${label}:`, margin, currentY, { continued: false });
      doc.font("Helvetica-Bold").text(safeValue, margin + 100, currentY);
      doc.font("Helvetica");
      currentY += 15;
    } catch (textError) {
      logError("Error writing text to PDF", {
        error: textError.message,
        label,
        value,
        currentY,
      });
      // Skip this item and continue
      currentY += 15;
    }
  });

  currentY += 10;

  // Exercise Information Section
  if (populatedSession.exerciseId) {
    // Ensure currentY is valid
    currentY = ensureValidY(currentY);

    if (currentY + 40 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Exercise Information", margin, currentY);
    currentY += 20;

    const exercise = populatedSession.exerciseId;
    doc.fontSize(10).font("Helvetica");

    if (exercise.category) {
      doc.text(`Category: ${String(exercise.category)}`, margin, currentY);
      currentY += 15;
    }
    if (exercise.difficulty) {
      doc.text(`Difficulty: ${String(exercise.difficulty)}`, margin, currentY);
      currentY += 15;
    }
    if (
      exercise.targetMuscles &&
      Array.isArray(exercise.targetMuscles) &&
      exercise.targetMuscles.length > 0
    ) {
      doc.text(
        `Target Muscles: ${exercise.targetMuscles.join(", ")}`,
        margin,
        currentY
      );
      currentY += 15;
    }
    if (exercise.description) {
      doc.text(exercise.description || "", margin, currentY, {
        width: pageWidth - 2 * margin,
      });
      // Estimate height for description (roughly 12px per line)
      const estimatedLines = Math.ceil(
        (exercise.description || "").length / 80
      );
      currentY += estimatedLines * 12 + 5;
    }
    currentY += 10;
  }

  // Statistics Section
  if (stats) {
    // Ensure currentY is a valid number
    currentY = ensureValidY(currentY);

    if (currentY + 40 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Statistics", margin, currentY);
    currentY += 20;

    doc.fontSize(10).font("Helvetica");
    if (stats.totalFrames !== undefined && stats.totalFrames != null) {
      const totalFrames =
        typeof stats.totalFrames === "number"
          ? stats.totalFrames
          : parseInt(stats.totalFrames) || 0;
      doc.text(`Total Frames: ${totalFrames}`, margin, currentY);
      currentY += 15;
    }
    if (stats.averageAngles && Object.keys(stats.averageAngles).length > 0) {
      doc.text("Average Angles:", margin, currentY);
      currentY += 15;
      Object.entries(stats.averageAngles).forEach(([angle, value]) => {
        currentY = ensureValidY(currentY);

        if (currentY + 15 > maxY) {
          doc.addPage();
          currentY = margin;
        }
        const angleName = angle.replace(/([A-Z])/g, " $1").trim();
        const angleValue =
          typeof value === "number" && !isNaN(value) ? value.toFixed(1) : "N/A";
        try {
          doc.text(`  ${angleName}: ${angleValue}°`, margin + 10, currentY);
          currentY += 15;
        } catch (textError) {
          logError("Error writing angle to PDF", {
            error: textError.message,
            angle,
            value,
            currentY,
          });
          currentY += 15;
        }
      });
    }
    currentY += 10;
  }

  // Feedback Section
  if (feedback.length > 0) {
    currentY = ensureValidY(currentY);

    if (currentY + 40 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Feedback & Analysis", margin, currentY);
    currentY += 20;

    doc.fontSize(10).font("Helvetica");
    feedback.forEach((item, index) => {
      currentY = ensureValidY(currentY);

      // Check if we need a new page (leave space for feedback item)
      if (currentY + 50 > maxY) {
        doc.addPage();
        currentY = margin;
      }

      try {
        const severity = item.severity || "info";
        const severityColors = {
          error: [255, 0, 0],
          warning: [255, 165, 0],
          info: [0, 0, 255],
          success: [0, 128, 0],
        };
        const color = severityColors[severity] || [0, 0, 0];

        // Draw severity indicator
        doc
          .fillColor(`rgb(${color[0]}, ${color[1]}, ${color[2]})`)
          .circle(margin + 5, currentY + 5, 3)
          .fill();
        doc.fillColor("black");

        // Calculate text width for wrapping
        const textWidth = pageWidth - 2 * margin - 20;
        const message = item.message ? String(item.message) : "No message";

        // Get the height of the message text (accounts for wrapping)
        const messageHeight = doc.heightOfString(message, {
          width: textWidth,
        });

        // Draw message text
        doc.text(message, margin + 15, currentY, {
          width: textWidth,
        });

        // Move Y position based on actual text height
        currentY += messageHeight + 5;

        // Add suggestion if present
        if (item.suggestion) {
          // Check if we need a new page for suggestion
          if (currentY + 30 > maxY) {
            doc.addPage();
            currentY = margin;
          }

          const suggestion = String(item.suggestion);
          const suggestionText = `  Suggestion: ${suggestion}`;

          // Get height of suggestion text
          doc.fontSize(9);
          const suggestionHeight = doc.heightOfString(suggestionText, {
            width: textWidth,
          });

          doc.text(suggestionText, margin + 15, currentY, {
            width: textWidth,
          });

          currentY += suggestionHeight + 5;
          doc.fontSize(10);
        }

        // Add spacing between feedback items
        currentY += 10;
      } catch (feedbackError) {
        logError("Error writing feedback to PDF", {
          error: feedbackError.message,
          index,
          currentY,
        });
        // Skip this feedback item and continue with safe spacing
        currentY += 30;
      }
    });
  }

  // Finalize PDF with error handling
  try {
    doc.end();
  } catch (pdfError) {
    logError("Error finalizing PDF", pdfError);
    // If headers already sent, we can't send error response
    if (!res.headersSent) {
      return next(
        new AppError(
          "Failed to generate PDF",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
    }
    // Otherwise, just log the error - response stream is already closed
  }

  logInfo("Session exported as PDF", {
    sessionId: id,
    userId,
  });
});

// ============================================
// EXPORT PROGRESS ANALYTICS AS PDF
// ============================================

/**
 * @route   GET /api/v1/sessions/progress/export
 * @desc    Export progress analytics report as PDF
 * @access  Private
 * @query   startDate, endDate (optional filters)
 */
export const exportProgressAnalytics = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();

  // Build date range filter
  const dateFilter = buildDateRangeFilter(req.query);
  const filter = { userId };
  if (dateFilter) {
    filter.recordedAt = dateFilter;
  }

  // Fetch all sessions for analytics
  const sessions = await ExerciseSession.find(filter)
    .populate("exerciseId", "name category")
    .sort({ recordedAt: 1, createdAt: 1 }) // Oldest to newest for trend analysis
    .lean();

  if (sessions.length === 0) {
    return next(
      new AppError(
        "No sessions found for progress analysis",
        HTTP_STATUS.NOT_FOUND
      )
    );
  }

  // Fetch user goals
  const goals = await Goals.findByUser(userId);

  // Calculate analytics
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  );

  // Calculate statistics
  const totalSessions = sessions.length;
  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgScore =
    sessions.reduce((sum, s) => sum + (s.overallScore || 0), 0) / totalSessions;
  const maxScore = Math.max(...sessions.map((s) => s.overallScore || 0));
  const minScore = Math.min(...sessions.map((s) => s.overallScore || 0));

  // Weekly/Monthly progress
  const thisWeekSessions = sessions.filter((s) => {
    const date = new Date(s.recordedAt || s.createdAt);
    return date >= currentWeekStart;
  }).length;

  const thisMonthSessions = sessions.filter((s) => {
    const date = new Date(s.recordedAt || s.createdAt);
    return date >= currentMonthStart;
  }).length;

  const lastMonthSessions = sessions.filter((s) => {
    const date = new Date(s.recordedAt || s.createdAt);
    return date >= lastMonthStart && date <= lastMonthEnd;
  }).length;

  // Score trends (last 10 sessions)
  const recentSessions = sessions.slice(-10);
  const scoreTrend = recentSessions.map((s) => s.overallScore || 0);
  const isImproving =
    scoreTrend.length >= 2 && scoreTrend[scoreTrend.length - 1] > scoreTrend[0];

  // Exercise distribution
  const exerciseCounts = {};
  sessions.forEach((session) => {
    const exerciseName = session.exerciseId?.name || "Unknown";
    exerciseCounts[exerciseName] = (exerciseCounts[exerciseName] || 0) + 1;
  });

  // Score distribution
  const scoreRanges = {
    excellent: sessions.filter((s) => (s.overallScore || 0) >= 80).length,
    good: sessions.filter(
      (s) => (s.overallScore || 0) >= 60 && (s.overallScore || 0) < 80
    ).length,
    fair: sessions.filter(
      (s) => (s.overallScore || 0) >= 40 && (s.overallScore || 0) < 60
    ).length,
    poor: sessions.filter((s) => (s.overallScore || 0) < 40).length,
  };

  // Goals vs Actual
  let goalsComparison = null;
  if (goals) {
    const weeklyGoalProgress =
      goals.weeklySessions > 0
        ? Math.round((thisWeekSessions / goals.weeklySessions) * 100)
        : 0;
    const monthlyGoalProgress =
      goals.monthlySessions > 0
        ? Math.round((thisMonthSessions / goals.monthlySessions) * 100)
        : 0;
    const scoreGoalProgress =
      goals.targetScore > 0
        ? Math.round((avgScore / goals.targetScore) * 100)
        : 0;

    goalsComparison = {
      weekly: {
        goal: goals.weeklySessions,
        actual: thisWeekSessions,
        progress: weeklyGoalProgress,
      },
      monthly: {
        goal: goals.monthlySessions,
        actual: thisMonthSessions,
        progress: monthlyGoalProgress,
      },
      score: {
        goal: goals.targetScore,
        actual: Math.round(avgScore),
        progress: scoreGoalProgress,
      },
      improvementRate: goals.improvementRate,
    };
  }

  // Generate PDF
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  // Set response headers
  res.setHeader("Content-Type", "application/pdf");
  const filename = `Progress_Report_${
    new Date().toISOString().split("T")[0]
  }.pdf`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Pipe PDF to response
  doc.pipe(res);

  // Page dimensions
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const maxY = pageHeight - margin;

  // Logo settings
  const logoSize = 60;
  const logoY = margin;
  let currentY = margin;

  // Try to add logo
  try {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const { dirname } = path;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const logoPaths = [
      path.join(__dirname, "../../../frontend/public/assets/logo.jpg"),
      path.join(__dirname, "../../public/assets/logo.jpg"),
      path.join(process.cwd(), "public/assets/logo.jpg"),
      path.join(process.cwd(), "../frontend/public/assets/logo.jpg"),
    ];

    let logoPath = null;
    for (const logoPathCandidate of logoPaths) {
      try {
        if (fs.existsSync(logoPathCandidate)) {
          logoPath = logoPathCandidate;
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (logoPath) {
      doc.image(logoPath, pageWidth / 2 - logoSize / 2, logoY, {
        width: logoSize,
        height: logoSize,
      });
      currentY = logoY + logoSize + 20;
    } else {
      currentY = margin + 10;
    }
  } catch (error) {
    logInfo("Could not load logo for progress PDF", { error: error.message });
    currentY = margin + 10;
  }

  // Helper function to ensure valid Y
  const ensureValidY = (y) => {
    if (typeof y !== "number" || isNaN(y) || y <= 0) {
      return margin + 10;
    }
    return y;
  };

  // Title
  currentY = ensureValidY(currentY);
  doc.y = currentY;
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("Progress Analytics Report", { align: "center" });
  doc.moveDown(0.5);
  const exportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc
    .fontSize(10)
    .font("Helvetica")
    .text(`Generated on: ${exportDate}`, { align: "center" });
  doc.moveDown(2);
  currentY = ensureValidY(doc.y);

  // Overall Statistics Section
  if (currentY + 100 > maxY) {
    doc.addPage();
    currentY = margin;
  }
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Overall Statistics", margin, currentY);
  currentY = ensureValidY(doc.y + 10);
  doc.fontSize(10).font("Helvetica");

  const stats = [
    `Total Sessions: ${totalSessions}`,
    `Total Duration: ${Math.round(totalDuration / 60)} minutes`,
    `Average Score: ${Math.round(avgScore)}%`,
    `Highest Score: ${Math.round(maxScore)}%`,
    `Lowest Score: ${Math.round(minScore)}%`,
  ];

  stats.forEach((stat) => {
    if (currentY + 15 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    doc.text(stat, margin + 10, currentY);
    currentY = ensureValidY(doc.y + 5);
  });

  currentY += 10;

  // Weekly/Monthly Progress Section
  if (currentY + 80 > maxY) {
    doc.addPage();
    currentY = margin;
  }
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Weekly & Monthly Progress", margin, currentY);
  currentY = ensureValidY(doc.y + 10);
  doc.fontSize(10).font("Helvetica");

  doc.text(`This Week: ${thisWeekSessions} sessions`, margin + 10, currentY);
  currentY = ensureValidY(doc.y + 5);
  doc.text(`This Month: ${thisMonthSessions} sessions`, margin + 10, currentY);
  currentY = ensureValidY(doc.y + 5);
  doc.text(`Last Month: ${lastMonthSessions} sessions`, margin + 10, currentY);
  currentY = ensureValidY(doc.y + 5);
  const monthlyChange =
    lastMonthSessions > 0
      ? Math.round(
          ((thisMonthSessions - lastMonthSessions) / lastMonthSessions) * 100
        )
      : thisMonthSessions > 0
      ? 100
      : 0;
  doc.text(
    `Month-over-Month Change: ${
      monthlyChange >= 0 ? "+" : ""
    }${monthlyChange}%`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 10);

  // Goals vs Actual Section
  if (goalsComparison) {
    if (currentY + 100 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Goals vs Actual Performance", margin, currentY);
    currentY = ensureValidY(doc.y + 10);
    doc.fontSize(10).font("Helvetica");

    doc.text(
      `Weekly Sessions: ${goalsComparison.weekly.actual}/${goalsComparison.weekly.goal} (${goalsComparison.weekly.progress}%)`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 5);
    doc.text(
      `Monthly Sessions: ${goalsComparison.monthly.actual}/${goalsComparison.monthly.goal} (${goalsComparison.monthly.progress}%)`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 5);
    doc.text(
      `Average Score: ${goalsComparison.score.actual}% / ${goalsComparison.score.goal}% (${goalsComparison.score.progress}%)`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 5);
    doc.text(
      `Target Improvement Rate: ${goalsComparison.improvementRate}%`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 10);
  }

  // Score Distribution Section
  if (currentY + 80 > maxY) {
    doc.addPage();
    currentY = margin;
  }
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Score Distribution", margin, currentY);
  currentY = ensureValidY(doc.y + 10);
  doc.fontSize(10).font("Helvetica");

  doc.text(
    `Excellent (80-100%): ${scoreRanges.excellent} sessions`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 5);
  doc.text(
    `Good (60-79%): ${scoreRanges.good} sessions`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 5);
  doc.text(
    `Fair (40-59%): ${scoreRanges.fair} sessions`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 5);
  doc.text(
    `Needs Improvement (<40%): ${scoreRanges.poor} sessions`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 10);

  // Exercise Distribution Section
  if (currentY + 100 > maxY) {
    doc.addPage();
    currentY = margin;
  }
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Exercise Distribution", margin, currentY);
  currentY = ensureValidY(doc.y + 10);
  doc.fontSize(10).font("Helvetica");

  const sortedExercises = Object.entries(exerciseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 exercises

  sortedExercises.forEach(([exercise, count]) => {
    if (currentY + 15 > maxY) {
      doc.addPage();
      currentY = margin;
    }
    const percentage = Math.round((count / totalSessions) * 100);
    doc.text(
      `${exercise}: ${count} sessions (${percentage}%)`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 5);
  });

  currentY += 10;

  // Trend Analysis Section
  if (currentY + 60 > maxY) {
    doc.addPage();
    currentY = margin;
  }
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Trend Analysis", margin, currentY);
  currentY = ensureValidY(doc.y + 10);
  doc.fontSize(10).font("Helvetica");

  doc.text(
    `Recent Trend: ${isImproving ? "Improving" : "Declining or Stable"}`,
    margin + 10,
    currentY
  );
  currentY = ensureValidY(doc.y + 5);
  if (scoreTrend.length >= 2) {
    const firstScore = scoreTrend[0];
    const lastScore = scoreTrend[scoreTrend.length - 1];
    const change = lastScore - firstScore;
    doc.text(
      `Score Change (Last 10 Sessions): ${
        change >= 0 ? "+" : ""
      }${change.toFixed(1)}%`,
      margin + 10,
      currentY
    );
    currentY = ensureValidY(doc.y + 5);
  }

  // Finalize PDF
  doc.end();

  logInfo("Progress analytics exported as PDF", {
    userId,
    totalSessions,
    dateRange: dateFilter ? "filtered" : "all",
  });
});
