/**
 * Video Service
 *
 * Service layer for video upload, management, and processing.
 * This service abstracts video-related business logic from controllers
 * and provides reusable functions for video management.
 *
 * Features:
 * - Video upload to Cloudinary
 * - Video URL generation with transformations
 * - Thumbnail generation
 * - Video deletion
 * - Video metadata management
 * - File validation
 * - Integration with ExerciseSession model
 *
 * Note: Videos are optional - most users don't need to upload videos
 * since pose data is already analyzed in the browser.
 */

import ExerciseSession from "../models/ExerciseSession.js";
import {
  uploadVideo as uploadVideoToCloudinary,
  deleteFile,
  getVideoUrl as getCloudinaryVideoUrl,
  getVideoThumbnail as getCloudinaryVideoThumbnail,
  extractPublicId,
  getFileInfo,
  SESSION_VIDEO_OPTIONS,
  isConfigured as isCloudinaryConfigured,
} from "../config/cloudinary.js";
import {
  FILE_SIZE,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
} from "../config/constants.js";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import AppError from "../utils/appError.js";
import { HTTP_STATUS } from "../config/constants.js";
import { validateObjectId } from "../utils/validators.js";

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate video file type
 * @param {string} mimeType - MIME type of the file
 * @returns {boolean} True if valid
 */
export const validateVideoType = (mimeType) => {
  if (!mimeType || typeof mimeType !== "string") {
    return false;
  }
  return ALLOWED_VIDEO_TYPES.includes(mimeType);
};

/**
 * Validate video file size
 * @param {number} fileSize - File size in bytes
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
export const validateVideoSize = (fileSize) => {
  if (typeof fileSize !== "number" || fileSize <= 0) {
    return {
      valid: false,
      error: "Invalid file size",
    };
  }

  if (fileSize > FILE_SIZE.VIDEO_MAX) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${
        FILE_SIZE.VIDEO_MAX / (1024 * 1024)
      }MB`,
    };
  }

  return {
    valid: true,
  };
};

/**
 * Validate video file (type and size)
 * @param {Object} file - File object with mimetype and size
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateVideoFile = (file) => {
  const errors = [];

  if (!file) {
    return {
      valid: false,
      errors: ["Video file is required"],
    };
  }

  // Validate file type
  if (!validateVideoType(file.mimetype)) {
    errors.push(
      `Invalid file type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(", ")}`
    );
  }

  // Validate file size
  const sizeValidation = validateVideoSize(file.size);
  if (!sizeValidation.valid) {
    errors.push(sizeValidation.error);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ============================================
// SESSION ACCESS VERIFICATION
// ============================================

/**
 * Verify that session exists and belongs to the user
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Session object
 * @throws {AppError} If session not found or access denied
 */
export const verifySessionAccess = async (sessionId, userId) => {
  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

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

// ============================================
// VIDEO METADATA
// ============================================

/**
 * Get video metadata from session
 * @param {Object} session - ExerciseSession object
 * @returns {Object|null} Video metadata or null
 */
export const getVideoMetadata = (session) => {
  if (!session || !session.videoUrl) {
    return null;
  }

  const publicId = extractPublicId(session.videoUrl);

  return {
    id: session._id.toString(),
    sessionId: session._id.toString(),
    videoUrl: session.videoUrl,
    thumbnailUrl: session.thumbnailUrl || null,
    publicId,
    duration: session.duration,
    recordedAt: session.recordedAt,
    exerciseId: session.exerciseId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    notes: session.notes,
    tags: session.tags,
    isPublic: session.isPublic,
  };
};

/**
 * Get video metadata by session ID
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Video metadata
 * @throws {AppError} If session not found or access denied
 */
export const getVideoMetadataBySessionId = async (sessionId, userId) => {
  const session = await verifySessionAccess(sessionId, userId);
  const video = getVideoMetadata(session);

  if (!video) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return video;
};

// ============================================
// VIDEO UPLOAD
// ============================================

/**
 * Upload video for a session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} file - File object (from multer)
 * @param {Object} options - Upload options
 * @param {string} options.publicId - Custom public ID (optional)
 * @returns {Promise<Object>} Upload result with video URLs
 * @throws {AppError} If upload fails
 */
export const uploadVideo = async (sessionId, userId, file, options = {}) => {
  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      "Video upload service is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }

  // Validate session access
  const session = await verifySessionAccess(sessionId, userId);

  // Validate file
  const fileValidation = validateVideoFile(file);
  if (!fileValidation.valid) {
    throw new AppError(
      fileValidation.errors.join(", "),
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    // Validate file buffer exists
    if (!file || !file.buffer) {
      throw new AppError("File buffer is missing", HTTP_STATUS.BAD_REQUEST);
    }

    // Ensure buffer is actually a Buffer
    if (!Buffer.isBuffer(file.buffer)) {
      throw new AppError("Invalid file buffer format", HTTP_STATUS.BAD_REQUEST);
    }

    // Validate buffer is not empty
    if (file.buffer.length === 0) {
      throw new AppError("File buffer is empty", HTTP_STATUS.BAD_REQUEST);
    }

    // Generate unique public ID for the video
    const publicId =
      options.publicId ||
      `${SESSION_VIDEO_OPTIONS.folder}/${sessionId}_${Date.now()}`;

    logInfo("Starting video upload to Cloudinary", {
      sessionId,
      userId,
      fileSize: file.size,
      bufferSize: file.buffer.length,
      mimetype: file.mimetype,
      publicId,
    });

    // Upload video to Cloudinary
    const uploadResult = await uploadVideoToCloudinary(file.buffer, {
      ...SESSION_VIDEO_OPTIONS,
      publicId,
    });

    // Generate thumbnail URL
    const thumbnailUrl = getCloudinaryVideoThumbnail(uploadResult.public_id, {
      width: 300,
      height: 300,
      timeOffset: 1,
    });

    // Update session with video URLs
    session.videoUrl = uploadResult.secure_url;
    session.thumbnailUrl = thumbnailUrl;
    await session.save();

    logInfo("Video uploaded", {
      sessionId,
      userId,
      publicId: uploadResult.public_id,
      fileSize: file.size,
      duration: uploadResult.duration || "unknown",
    });

    return {
      video: {
        id: session._id.toString(),
        sessionId,
        videoUrl: session.videoUrl,
        thumbnailUrl: session.thumbnailUrl,
        publicId: uploadResult.public_id,
      },
      uploadResult,
    };
  } catch (error) {
    logError("Video upload failed", { error, sessionId, userId });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `Failed to upload video: ${error.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

// ============================================
// VIDEO URL GENERATION
// ============================================

/**
 * Get video URL with optional transformations
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} transformations - Transformation options
 * @param {string} transformations.format - Output format (mp4, webm, etc.)
 * @param {string} transformations.quality - Quality (auto, auto:good, auto:best, or 1-100)
 * @param {number} transformations.startOffset - Start time in seconds
 * @param {number} transformations.duration - Duration in seconds
 * @param {number} transformations.width - Video width
 * @param {number} transformations.height - Video height
 * @returns {Promise<Object>} Video URL and transformations
 * @throws {AppError} If video not found
 */
export const getVideoUrl = async (sessionId, userId, transformations = {}) => {
  const session = await verifySessionAccess(sessionId, userId);

  if (!session.videoUrl) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Extract public ID from video URL
  const publicId = extractPublicId(session.videoUrl);

  if (!publicId) {
    throw new AppError("Invalid video URL", HTTP_STATUS.BAD_REQUEST);
  }

  // Generate video URL with transformations
  const videoUrl = getCloudinaryVideoUrl(publicId, transformations);

  return {
    videoUrl,
    transformations:
      Object.keys(transformations).length > 0 ? transformations : null,
    publicId,
  };
};

/**
 * Get video thumbnail URL
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} options - Thumbnail options
 * @param {number} options.width - Thumbnail width (default: 300)
 * @param {number} options.height - Thumbnail height (default: 300)
 * @param {number} options.timeOffset - Time offset in seconds (default: 1)
 * @param {string} options.format - Format (default: 'jpg')
 * @returns {Promise<Object>} Thumbnail URL and options
 * @throws {AppError} If video not found
 */
export const getVideoThumbnail = async (sessionId, userId, options = {}) => {
  const session = await verifySessionAccess(sessionId, userId);

  if (!session.videoUrl) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Extract public ID from video URL
  const publicId = extractPublicId(session.videoUrl);

  if (!publicId) {
    throw new AppError("Invalid video URL", HTTP_STATUS.BAD_REQUEST);
  }

  // Build thumbnail options
  const thumbnailOptions = {
    width: options.width || 300,
    height: options.height || 300,
    timeOffset: options.timeOffset || 1,
    format: options.format || "jpg",
  };

  // Generate thumbnail URL
  const thumbnailUrl = getCloudinaryVideoThumbnail(publicId, thumbnailOptions);

  return {
    thumbnailUrl,
    options: thumbnailOptions,
    publicId,
  };
};

// ============================================
// VIDEO DELETION
// ============================================

/**
 * Delete video from storage and database
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} options - Deletion options
 * @param {boolean} options.keepSession - Keep session even if video is deleted (default: true)
 * @returns {Promise<Object>} Deletion result
 * @throws {AppError} If deletion fails
 */
export const deleteVideo = async (sessionId, userId, options = {}) => {
  const { keepSession = true } = options;

  const session = await verifySessionAccess(sessionId, userId);

  if (!session.videoUrl) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    // If Cloudinary is not configured, just remove URLs from session
    session.videoUrl = undefined;
    session.thumbnailUrl = undefined;
    await session.save();

    logInfo("Video URLs removed (Cloudinary not configured)", {
      sessionId,
      userId,
    });

    return {
      message: "Video URLs removed from session",
      deletedFromStorage: false,
    };
  }

  try {
    // Extract public ID from video URL
    const publicId = extractPublicId(session.videoUrl);

    if (publicId) {
      // Delete video from Cloudinary
      await deleteFile(publicId, "video");
    }

    // Remove video URLs from session
    session.videoUrl = undefined;
    session.thumbnailUrl = undefined;
    await session.save();

    logInfo("Video deleted", {
      sessionId,
      userId,
      publicId: publicId || "unknown",
    });

    return {
      message: "Video deleted successfully",
      deletedFromStorage: true,
      publicId: publicId || null,
    };
  } catch (error) {
    logError("Video deletion failed", { error, sessionId, userId });

    // Even if Cloudinary deletion fails, remove URLs from session
    session.videoUrl = undefined;
    session.thumbnailUrl = undefined;
    await session.save();

    throw new AppError(
      `Video deleted from session, but Cloudinary deletion failed: ${error.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

// ============================================
// VIDEO METADATA UPDATE
// ============================================

/**
 * Update video metadata (session metadata)
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} updateData - Update data
 * @param {string} updateData.notes - Session notes
 * @param {Array<string>} updateData.tags - Session tags
 * @param {boolean} updateData.isPublic - Public visibility
 * @returns {Promise<Object>} Updated video metadata
 * @throws {AppError} If update fails
 */
export const updateVideoMetadata = async (sessionId, userId, updateData) => {
  const session = await verifySessionAccess(sessionId, userId);

  if (!session.videoUrl) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Build update object
  const updateObject = {};
  if (updateData.notes !== undefined) updateObject.notes = updateData.notes;
  if (updateData.tags !== undefined) updateObject.tags = updateData.tags;
  if (updateData.isPublic !== undefined)
    updateObject.isPublic = updateData.isPublic;

  if (Object.keys(updateObject).length === 0) {
    throw new AppError("No valid fields to update", HTTP_STATUS.BAD_REQUEST);
  }

  // Update session
  const updatedSession = await ExerciseSession.findByIdAndUpdate(
    sessionId,
    updateObject,
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  // Get updated video metadata
  const video = getVideoMetadata(updatedSession);

  logInfo("Video metadata updated", {
    sessionId,
    userId,
    updatedFields: Object.keys(updateObject),
  });

  return {
    video,
    updatedFields: Object.keys(updateObject),
  };
};

// ============================================
// VIDEO INFORMATION
// ============================================

/**
 * Get video information from Cloudinary
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Video information
 * @throws {AppError} If video not found or Cloudinary not configured
 */
export const getVideoInfo = async (sessionId, userId) => {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      "Cloudinary is not configured",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }

  const session = await verifySessionAccess(sessionId, userId);

  if (!session.videoUrl) {
    throw new AppError(
      "No video found for this session",
      HTTP_STATUS.NOT_FOUND
    );
  }

  // Extract public ID from video URL
  const publicId = extractPublicId(session.videoUrl);

  if (!publicId) {
    throw new AppError("Invalid video URL", HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const fileInfo = await getFileInfo(publicId, "video");

    return {
      publicId,
      ...fileInfo,
    };
  } catch (error) {
    logError("Error getting video info", {
      error,
      sessionId,
      userId,
      publicId,
    });
    throw new AppError(
      `Failed to get video information: ${error.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Get videos for multiple sessions
 * @param {Array<string>} sessionIds - Array of session IDs
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of video metadata
 */
export const getVideosBySessions = async (sessionIds, userId) => {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return [];
  }

  // Validate all session IDs
  const validSessionIds = sessionIds.filter((id) => {
    const validation = validateObjectId(id);
    return validation.valid;
  });

  if (validSessionIds.length === 0) {
    return [];
  }

  try {
    // Get sessions that belong to the user and have videos
    const sessions = await ExerciseSession.find({
      _id: { $in: validSessionIds },
      userId,
      videoUrl: { $exists: true, $ne: null },
    }).lean();

    const videos = sessions
      .map((session) => getVideoMetadata(session))
      .filter((video) => video !== null);

    return videos;
  } catch (error) {
    logError("Error getting videos by sessions", { error, sessionIds, userId });
    throw new AppError(
      "Failed to get videos",
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * Delete videos for multiple sessions
 * @param {Array<string>} sessionIds - Array of session IDs
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deletion results
 */
export const deleteVideosBatch = async (sessionIds, userId) => {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return {
      deleted: 0,
      failed: 0,
      results: [],
    };
  }

  const results = [];
  let deleted = 0;
  let failed = 0;

  for (const sessionId of sessionIds) {
    try {
      await deleteVideo(sessionId, userId);
      results.push({ sessionId, success: true });
      deleted++;
    } catch (error) {
      logError("Error deleting video in batch", { error, sessionId, userId });
      results.push({ sessionId, success: false, error: error.message });
      failed++;
    }
  }

  return {
    deleted,
    failed,
    total: sessionIds.length,
    results,
  };
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if Cloudinary is configured
 * @returns {boolean} True if configured
 */
export const isConfigured = () => {
  return isCloudinaryConfigured();
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null
 */
export const extractPublicIdFromUrl = (url) => {
  return extractPublicId(url);
};

/**
 * Check if session has a video
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if session has video
 */
export const sessionHasVideo = async (sessionId, userId) => {
  try {
    const session = await verifySessionAccess(sessionId, userId);
    return !!session.videoUrl;
  } catch (error) {
    return false;
  }
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Validation
  validateVideoType,
  validateVideoSize,
  validateVideoFile,

  // Session access
  verifySessionAccess,

  // Metadata
  getVideoMetadata,
  getVideoMetadataBySessionId,

  // Upload
  uploadVideo,

  // URL generation
  getVideoUrl,
  getVideoThumbnail,

  // Deletion
  deleteVideo,

  // Metadata update
  updateVideoMetadata,

  // Information
  getVideoInfo,

  // Batch operations
  getVideosBySessions,
  deleteVideosBatch,

  // Utilities
  isConfigured,
  extractPublicIdFromUrl,
  sessionHasVideo,
};
