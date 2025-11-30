/**
 * Goals Controller
 *
 * Handles all fitness goals-related operations including:
 * - Creating and updating user goals
 * - Getting user's goals
 * - Deleting user's goals
 */

import Goals from '../models/Goals.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS, API_STATUS } from '../config/constants.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * @route   GET /api/v1/goals
 * @desc    Get current user's fitness goals
 * @access  Private
 */
export const getUserGoals = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  logInfo(`Fetching goals for user: ${userId}`);

  let goals = await Goals.findByUser(userId);

  // If no goals exist, return null (not an error)
  if (!goals) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: API_STATUS.SUCCESS,
      data: null,
      message: 'No goals set yet',
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    status: API_STATUS.SUCCESS,
    data: goals,
  });
});

/**
 * @route   POST /api/v1/goals
 * @desc    Create new fitness goals for current user
 * @access  Private
 */
export const createUserGoals = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { weeklySessions, monthlySessions, targetScore, improvementRate } =
    req.body;

  // Check if goals already exist
  const existingGoals = await Goals.findByUser(userId);
  if (existingGoals) {
    return next(
      new AppError(
        'Goals already exist. Use PUT to update them.',
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  // Validate monthly goal is at least 4x weekly goal
  if (monthlySessions < weeklySessions * 4) {
    return next(
      new AppError(
        `Monthly goal should be at least ${weeklySessions * 4} (4x weekly goal)`,
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  logInfo(`Creating goals for user: ${userId}`);

  const goals = await Goals.create({
    userId,
    weeklySessions,
    monthlySessions,
    targetScore,
    improvementRate,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    status: API_STATUS.SUCCESS,
    data: goals,
    message: 'Goals created successfully',
  });
});

/**
 * @route   PUT /api/v1/goals/:id
 * @desc    Update existing fitness goals
 * @access  Private
 */
export const updateUserGoals = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { weeklySessions, monthlySessions, targetScore, improvementRate } =
    req.body;

  // Find goals and verify ownership
  const goals = await Goals.findById(id);

  if (!goals) {
    return next(new AppError('Goals not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify the goals belong to the current user
  if (goals.userId.toString() !== userId.toString()) {
    return next(
      new AppError(
        'You do not have permission to update these goals',
        HTTP_STATUS.FORBIDDEN
      )
    );
  }

  // Validate monthly goal is at least 4x weekly goal
  if (monthlySessions < weeklySessions * 4) {
    return next(
      new AppError(
        `Monthly goal should be at least ${weeklySessions * 4} (4x weekly goal)`,
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  logInfo(`Updating goals ${id} for user: ${userId}`);

  // Update goals
  goals.weeklySessions = weeklySessions;
  goals.monthlySessions = monthlySessions;
  goals.targetScore = targetScore;
  goals.improvementRate = improvementRate;

  await goals.save();

  res.status(HTTP_STATUS.OK).json({
    success: true,
    status: API_STATUS.SUCCESS,
    data: goals,
    message: 'Goals updated successfully',
  });
});

/**
 * @route   PUT /api/v1/goals
 * @desc    Create or update user's fitness goals (upsert)
 * @access  Private
 * @note    This is a convenience endpoint that creates if not exists, updates if exists
 */
export const upsertUserGoals = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { weeklySessions, monthlySessions, targetScore, improvementRate } =
    req.body;

  // Validate monthly goal is at least 4x weekly goal
  if (monthlySessions < weeklySessions * 4) {
    return next(
      new AppError(
        `Monthly goal should be at least ${weeklySessions * 4} (4x weekly goal)`,
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  logInfo(`Upserting goals for user: ${userId}`);

  // Find existing goals
  let goals = await Goals.findByUser(userId);

  if (goals) {
    // Update existing goals
    goals.weeklySessions = weeklySessions;
    goals.monthlySessions = monthlySessions;
    goals.targetScore = targetScore;
    goals.improvementRate = improvementRate;
    await goals.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      status: API_STATUS.SUCCESS,
      data: goals,
      message: 'Goals updated successfully',
    });
  } else {
    // Create new goals
    goals = await Goals.create({
      userId,
      weeklySessions,
      monthlySessions,
      targetScore,
      improvementRate,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      status: API_STATUS.SUCCESS,
      data: goals,
      message: 'Goals created successfully',
    });
  }
});

/**
 * @route   DELETE /api/v1/goals/:id
 * @desc    Delete user's fitness goals
 * @access  Private
 */
export const deleteUserGoals = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { id } = req.params;

  // Find goals and verify ownership
  const goals = await Goals.findById(id);

  if (!goals) {
    return next(new AppError('Goals not found', HTTP_STATUS.NOT_FOUND));
  }

  // Verify the goals belong to the current user
  if (goals.userId.toString() !== userId.toString()) {
    return next(
      new AppError(
        'You do not have permission to delete these goals',
        HTTP_STATUS.FORBIDDEN
      )
    );
  }

  logInfo(`Deleting goals ${id} for user: ${userId}`);

  await Goals.findByIdAndDelete(id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    status: API_STATUS.SUCCESS,
    data: { deleted: true },
    message: 'Goals deleted successfully',
  });
});

