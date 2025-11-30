import express from 'express';
import {
  uploadVideo,
  getVideoById,
  getVideosBySession,
  deleteVideo,
  updateVideoMetadata,
  getVideoThumbnail,
  getVideoUrl,
} from '../controllers/videoController.js';
import { protect } from '../middleware/auth.js';
import { uploadVideoFile } from '../middleware/upload.js';
import { validateVideoUpload } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/v1/videos/upload
 * @desc    Upload video for a session (optional - videos are optional)
 * @access  Private
 * @body    FormData: videoFile, sessionId
 * @note    Videos are optional. Most users don't need to upload videos since pose data is already analyzed in browser.
 */
router.post('/upload', uploadVideoFile.single('videoFile'), validateVideoUpload, uploadVideo);

/**
 * @route   GET /api/v1/videos/session/:sessionId
 * @desc    Get videos for a specific session
 * @access  Private
 * @params  sessionId
 */
router.get('/session/:sessionId', getVideosBySession);

/**
 * @route   GET /api/v1/videos/:id/url
 * @desc    Get video URL (for streaming/playback)
 * @access  Private
 * @params  id (video ID or session ID)
 */
router.get('/:id/url', getVideoUrl);

/**
 * @route   GET /api/v1/videos/:id/thumbnail
 * @desc    Get video thumbnail URL
 * @access  Private
 * @params  id (video ID or session ID)
 */
router.get('/:id/thumbnail', getVideoThumbnail);

/**
 * @route   GET /api/v1/videos/:id
 * @desc    Get video metadata by ID
 * @access  Private
 * @params  id (video ID or session ID)
 */
router.get('/:id', getVideoById);

/**
 * @route   PUT /api/v1/videos/:id
 * @desc    Update video metadata (e.g., title, description, isPublic)
 * @access  Private
 * @params  id (video ID)
 */
router.put('/:id', updateVideoMetadata);

/**
 * @route   DELETE /api/v1/videos/:id
 * @desc    Delete video from storage and database
 * @access  Private
 * @params  id (video ID)
 */
router.delete('/:id', deleteVideo);

export default router;
