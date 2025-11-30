/**
 * Video Controller
 * 
 * Handles all video-related operations including:
 * - Uploading videos to Cloudinary
 * - Getting video URLs and thumbnails
 * - Updating video metadata
 * - Deleting videos
 * 
 * Note: Videos are optional - most users don't need to upload videos
 * since pose data is already analyzed in the browser.
 */

import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import {
  HTTP_STATUS,
  API_STATUS,
} from '../config/constants.js';
import { logInfo } from '../utils/logger.js';
import * as videoService from '../services/videoService.js';

// ============================================
// UPLOAD VIDEO
// ============================================

/**
 * @route   POST /api/v1/videos/upload
 * @desc    Upload video for a session (optional - videos are optional)
 * @access  Private
 * @body    FormData: videoFile, sessionId
 */
export const uploadVideo = catchAsync(async (req, res, next) => {
  const userId = req.user._id.toString();
  const { sessionId } = req.body;

  // Validate sessionId
  if (!sessionId) {
    return next(new AppError('Session ID is required', HTTP_STATUS.BAD_REQUEST));
  }

  // Check if file was uploaded
  if (!req.file) {
    return next(new AppError('Video file is required', HTTP_STATUS.BAD_REQUEST));
  }

  // Upload video using service
  const result = await videoService.uploadVideo(sessionId, userId, req.file);

  logInfo('Video uploaded', {
    sessionId,
    userId,
    publicId: result.video.publicId,
    fileSize: req.file.size,
  });

  res.status(HTTP_STATUS.CREATED).json({
    status: API_STATUS.SUCCESS,
    message: 'Video uploaded successfully',
    data: {
      video: result.video,
    },
  });
});

// ============================================
// GET VIDEO BY ID (or Session ID)
// ============================================

/**
 * @route   GET /api/v1/videos/:id
 * @desc    Get video metadata by ID (session ID)
 * @access  Private
 * @params  id - Session ID
 */
export const getVideoById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Get video metadata using service
  const video = await videoService.getVideoMetadataBySessionId(id, userId);

  logInfo('Video metadata fetched', {
    sessionId: id,
    userId,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      video,
    },
  });
});

// ============================================
// GET VIDEOS BY SESSION
// ============================================

/**
 * @route   GET /api/v1/videos/session/:sessionId
 * @desc    Get videos for a specific session
 * @access  Private
 * @params  sessionId - Session ID
 */
export const getVideosBySession = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();

  try {
    // Get video metadata using service
    const video = await videoService.getVideoMetadataBySessionId(sessionId, userId);

    logInfo('Videos fetched by session', {
      sessionId,
      userId,
    });

    res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      results: 1,
      data: {
        videos: [video],
      },
    });
  } catch (error) {
    // If video not found, return empty array
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(HTTP_STATUS.OK).json({
        status: API_STATUS.SUCCESS,
        results: 0,
        message: 'No video found for this session',
        data: {
          videos: [],
        },
      });
    }
    throw error;
  }
});

// ============================================
// GET VIDEO URL
// ============================================

/**
 * @route   GET /api/v1/videos/:id/url
 * @desc    Get video URL (for streaming/playback)
 * @access  Private
 * @params  id - Session ID
 * @query   format, quality, startOffset, duration (optional transformation params)
 */
export const getVideoUrl = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Build transformation options from query params
  const transformations = {};
  if (req.query.format) transformations.format = req.query.format;
  if (req.query.quality) transformations.quality = req.query.quality;
  if (req.query.startOffset) transformations.startOffset = parseFloat(req.query.startOffset);
  if (req.query.duration) transformations.duration = parseFloat(req.query.duration);
  if (req.query.width) transformations.width = parseInt(req.query.width, 10);
  if (req.query.height) transformations.height = parseInt(req.query.height, 10);

  // Get video URL using service
  const result = await videoService.getVideoUrl(id, userId, transformations);

  logInfo('Video URL generated', {
    sessionId: id,
    userId,
    hasTransformations: Object.keys(transformations).length > 0,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      videoUrl: result.videoUrl,
      transformations: result.transformations,
    },
  });
});

// ============================================
// GET VIDEO THUMBNAIL
// ============================================

/**
 * @route   GET /api/v1/videos/:id/thumbnail
 * @desc    Get video thumbnail URL
 * @access  Private
 * @params  id - Session ID
 * @query   width, height, timeOffset (optional)
 */
export const getVideoThumbnail = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Build thumbnail options from query params
  const thumbnailOptions = {
    width: req.query.width ? parseInt(req.query.width, 10) : 300,
    height: req.query.height ? parseInt(req.query.height, 10) : 300,
    timeOffset: req.query.timeOffset ? parseFloat(req.query.timeOffset) : 1,
    format: req.query.format || 'jpg',
  };

  // Get thumbnail using service
  const result = await videoService.getVideoThumbnail(id, userId, thumbnailOptions);

  logInfo('Video thumbnail generated', {
    sessionId: id,
    userId,
    options: result.options,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      thumbnailUrl: result.thumbnailUrl,
      options: result.options,
    },
  });
});

// ============================================
// UPDATE VIDEO METADATA
// ============================================

/**
 * @route   PUT /api/v1/videos/:id
 * @desc    Update video metadata (e.g., title, description, isPublic)
 * @access  Private
 * @params  id - Session ID
 * @body    notes, tags, isPublic (session metadata)
 */
export const updateVideoMetadata = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Update video metadata using service
  const result = await videoService.updateVideoMetadata(id, userId, req.body);

  logInfo('Video metadata updated', {
    sessionId: id,
    userId,
    updatedFields: result.updatedFields,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: 'Video metadata updated successfully',
    data: {
      video: result.video,
    },
  });
});

// ============================================
// DELETE VIDEO
// ============================================

/**
 * @route   DELETE /api/v1/videos/:id
 * @desc    Delete video from storage and database
 * @access  Private
 * @params  id - Session ID
 */
export const deleteVideo = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  // Delete video using service
  const result = await videoService.deleteVideo(id, userId);

  logInfo('Video deleted', {
    sessionId: id,
    userId,
    deletedFromStorage: result.deletedFromStorage,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: result.message,
  });
});
