import express from 'express';
import {
  createSession,
  getUserSessions,
  getSessionById,
  updateSession,
  deleteSession,
  getSessionProgress,
  getSessionStats,
  getTopSessions,
  getSessionsByExercise,
  getRecentSessions,
  exportSessions,
  exportSession,
  exportProgressAnalytics,
} from '../controllers/sessionController.js';
import { protect } from '../middleware/auth.js';
import { validateSession, validateUpdateSession } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/v1/sessions
 * @desc    Create a new exercise session
 * @access  Private
 * @body    exerciseId, duration, poseData, overallScore, etc.
 */
router.post('/', validateSession, createSession);

/**
 * @route   GET /api/v1/sessions/top
 * @desc    Get top sessions by score
 * @access  Private
 * @query   limit, exerciseId (optional)
 */
router.get('/top', getTopSessions);

/**
 * @route   GET /api/v1/sessions/recent
 * @desc    Get recent sessions
 * @access  Private
 * @query   limit (default: 10)
 */
router.get('/recent', getRecentSessions);

/**
 * @route   GET /api/v1/sessions/exercise/:exerciseId
 * @desc    Get all sessions for a specific exercise
 * @access  Private
 * @params  exerciseId
 * @query   limit, page, sort
 */
router.get('/exercise/:exerciseId', getSessionsByExercise);

/**
 * @route   GET /api/v1/sessions/export
 * @desc    Export user's sessions as PDF
 * @access  Private
 * @query   exerciseId, startDate, endDate (optional filters)
 */
router.get('/export', exportSessions);

/**
 * @route   GET /api/v1/sessions/progress/export
 * @desc    Export progress analytics report as PDF
 * @access  Private
 * @query   startDate, endDate (optional filters)
 */
router.get('/progress/export', exportProgressAnalytics);

/**
 * @route   GET /api/v1/sessions
 * @desc    Get user's sessions with optional filtering and pagination
 * @access  Private
 * @query   exerciseId, limit, page, sort, startDate, endDate
 */
router.get('/', getUserSessions);

/**
 * @route   GET /api/v1/sessions/:id/export
 * @desc    Export a single session as PDF
 * @access  Private
 * @params  id (session ID)
 */
router.get('/:id/export', exportSession);

/**
 * @route   GET /api/v1/sessions/:id/stats
 * @desc    Get statistics for a specific session
 * @access  Private
 * @params  id (session ID)
 */
router.get('/:id/stats', getSessionStats);

/**
 * @route   GET /api/v1/sessions/:id/progress
 * @desc    Get progress data for a session
 * @access  Private
 * @params  id (session ID)
 */
router.get('/:id/progress', getSessionProgress);

/**
 * @route   GET /api/v1/sessions/:id
 * @desc    Get session by ID with full details
 * @access  Private
 * @params  id (session ID)
 */
router.get('/:id', getSessionById);

/**
 * @route   PUT /api/v1/sessions/:id
 * @desc    Update a session
 * @access  Private
 * @params  id (session ID)
 * @body    notes, tags, isPublic, etc.
 */
router.put('/:id', validateUpdateSession, updateSession);

/**
 * @route   DELETE /api/v1/sessions/:id
 * @desc    Delete a session
 * @access  Private
 * @params  id (session ID)
 */
router.delete('/:id', deleteSession);

export default router;
