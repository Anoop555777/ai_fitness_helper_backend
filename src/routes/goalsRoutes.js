import express from 'express';
import {
  getUserGoals,
  createUserGoals,
  updateUserGoals,
  upsertUserGoals,
  deleteUserGoals,
} from '../controllers/goalsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/v1/goals
 * @desc    Get current user's fitness goals
 * @access  Private
 */
router.get('/', getUserGoals);

/**
 * @route   POST /api/v1/goals
 * @desc    Create new fitness goals for current user
 * @access  Private
 */
router.post('/', createUserGoals);

/**
 * @route   PUT /api/v1/goals
 * @desc    Create or update user's fitness goals (upsert - convenience endpoint)
 * @access  Private
 */
router.put('/', upsertUserGoals);

/**
 * @route   PUT /api/v1/goals/:id
 * @desc    Update existing fitness goals
 * @access  Private
 */
router.put('/:id', updateUserGoals);

/**
 * @route   DELETE /api/v1/goals/:id
 * @desc    Delete user's fitness goals
 * @access  Private
 */
router.delete('/:id', deleteUserGoals);

export default router;

