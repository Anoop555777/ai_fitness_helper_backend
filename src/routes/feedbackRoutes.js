import express from 'express';
import {
  getFeedbackBySession,
  getFeedbackById,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  enhanceFeedback,
  getFeedbackStats,
  getCriticalFeedback,
  resolveFeedback,
  getFeedbackByType,
} from '../controllers/feedbackController.js';
import { protect } from '../middleware/auth.js';
import { validateFeedback, validateEnhanceFeedback } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/v1/feedback/enhance
 * @desc    Generate enhanced feedback using AI (optional OpenAI)
 * @access  Private
 * @body    sessionId, useAI (optional)
 */
router.post('/enhance', protect, validateEnhanceFeedback, enhanceFeedback);

/**
 * @route   GET /api/v1/feedback/stats/:sessionId
 * @desc    Get feedback statistics for a session
 * @access  Private
 * @params  sessionId
 */
router.get('/stats/:sessionId', protect, getFeedbackStats);

/**
 * @route   GET /api/v1/feedback/critical/:sessionId
 * @desc    Get critical feedback (errors) for a session
 * @access  Private
 * @params  sessionId
 */
router.get('/critical/:sessionId', protect, getCriticalFeedback);

/**
 * @route   GET /api/v1/feedback/session/:sessionId
 * @desc    Get all feedback for a session with optional filtering
 * @access  Private
 * @params  sessionId
 * @query   type, severity, unresolvedOnly, aiGenerated, sort, limit
 */
router.get('/session/:sessionId', protect, getFeedbackBySession);

/**
 * @route   GET /api/v1/feedback/session/:sessionId/type/:type
 * @desc    Get feedback by type for a session
 * @access  Private
 * @params  sessionId, type (form_error, improvement, encouragement, etc.)
 */
router.get('/session/:sessionId/type/:type', protect, getFeedbackByType);

/**
 * @route   GET /api/v1/feedback/:id
 * @desc    Get feedback by ID
 * @access  Private
 * @params  id (feedback ID)
 */
router.get('/:id', protect, getFeedbackById);

/**
 * @route   POST /api/v1/feedback
 * @desc    Create new feedback
 * @access  Private
 * @body    sessionId, type, message, severity, etc.
 */
router.post('/', protect, validateFeedback, createFeedback);

/**
 * @route   PUT /api/v1/feedback/:id
 * @desc    Update feedback
 * @access  Private
 * @params  id (feedback ID)
 */
router.put('/:id', protect, updateFeedback);

/**
 * @route   PATCH /api/v1/feedback/:id/resolve
 * @desc    Mark feedback as resolved
 * @access  Private
 * @params  id (feedback ID)
 * @body    userNotes (optional)
 */
router.patch('/:id/resolve', protect, resolveFeedback);

/**
 * @route   DELETE /api/v1/feedback/:id
 * @desc    Delete feedback
 * @access  Private
 * @params  id (feedback ID)
 */
router.delete('/:id', protect, deleteFeedback);

export default router;
