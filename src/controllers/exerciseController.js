/**
 * Exercise Controller
 * 
 * Handles all exercise-related operations including:
 * - Getting all exercises with filtering, pagination, and sorting
 * - Getting exercises by ID, category, or difficulty
 * - Searching exercises
 * - Creating, updating, and deleting exercises (Admin only)
 */

import Exercise from '../models/Exercise.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/appError.js';
import {
  HTTP_STATUS,
  API_STATUS,
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY_ARRAY,
} from '../config/constants.js';
import { logInfo, logError } from '../utils/logger.js';
import { validateObjectId, validateEnum } from '../utils/validators.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build query filter from request query parameters
 * @private
 * @param {Object} query - Request query object
 * @returns {Object} Mongoose query filter
 */
const buildQueryFilter = (query) => {
  const filter = { isActive: true }; // Only show active exercises by default

  // Filter by category
  if (query.category) {
    const categoryValidation = validateEnum(query.category, EXERCISE_CATEGORIES_ARRAY, 'category');
    if (!categoryValidation.valid) {
      throw new AppError(categoryValidation.error, HTTP_STATUS.BAD_REQUEST);
    }
    filter.category = query.category;
  }

  // Filter by difficulty
  if (query.difficulty) {
    const difficultyValidation = validateEnum(query.difficulty, EXERCISE_DIFFICULTY_ARRAY, 'difficulty');
    if (!difficultyValidation.valid) {
      throw new AppError(difficultyValidation.error, HTTP_STATUS.BAD_REQUEST);
    }
    filter.difficulty = query.difficulty;
  }

  // Filter by equipment (if provided as array or single value)
  if (query.equipment) {
    const equipmentArray = Array.isArray(query.equipment) ? query.equipment : [query.equipment];
    filter.equipment = { $in: equipmentArray };
  }

  // Include inactive exercises if admin requests them
  if (query.includeInactive === 'true') {
    delete filter.isActive;
  }

  return filter;
};

/**
 * Build sort object from request query
 * @private
 * @param {string} sortQuery - Sort query string (e.g., "name,-createdAt")
 * @returns {Object} Mongoose sort object
 */
const buildSortObject = (sortQuery) => {
  if (!sortQuery) {
    return { createdAt: -1 }; // Default: newest first
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

// ============================================
// GET ALL EXERCISES
// ============================================

/**
 * @route   GET /api/v1/exercises
 * @desc    Get all exercises with optional filtering, pagination, and sorting
 * @access  Public
 * @query   category, difficulty, equipment, limit, page, sort, includeInactive, search
 */
export const getAllExercises = catchAsync(async (req, res, next) => {
  // Build query filter
  const filter = buildQueryFilter(req.query);

  // Handle search query
  if (req.query.search) {
    filter.$text = { $search: req.query.search };
  }

  // Build sort object
  const sort = buildSortObject(req.query.sort);

  // Build pagination options
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Execute query with pagination
  const exercises = await Exercise.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean(); // Use lean() for better performance when we don't need Mongoose documents

  // Get total count for pagination
  const total = await Exercise.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo('Exercises fetched', {
    count: exercises.length,
    total,
    page,
    limit,
    filters: Object.keys(filter),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: exercises.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      exercises,
    },
  });
});

// ============================================
// GET EXERCISE BY ID
// ============================================

/**
 * @route   GET /api/v1/exercises/:id
 * @desc    Get exercise by ID
 * @access  Public
 * @params  id - Exercise ID
 */
export const getExerciseById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Find exercise (include inactive for admin if needed)
  const exercise = await Exercise.findById(id);

  if (!exercise) {
    return next(new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND));
  }

  // Check if exercise is active (unless admin)
  if (!exercise.isActive && (!req.user || req.user.role !== 'admin')) {
    return next(new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND));
  }

  logInfo('Exercise fetched by ID', { exerciseId: id, name: exercise.name });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      exercise,
    },
  });
});

// ============================================
// SEARCH EXERCISES
// ============================================

/**
 * @route   GET /api/v1/exercises/search
 * @desc    Search exercises by name or description
 * @access  Public
 * @query   q - Search query, limit, page
 */
export const searchExercises = catchAsync(async (req, res, next) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return next(new AppError('Search query is required', HTTP_STATUS.BAD_REQUEST));
  }

  // Build pagination options
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Build search filter
  const searchRegex = new RegExp(q.trim(), 'i'); // Case-insensitive search
  const filter = {
    isActive: true,
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { targetMuscles: { $in: [searchRegex] } },
    ],
  };

  // Execute search query
  const exercises = await Exercise.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await Exercise.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo('Exercises searched', {
    query: q,
    count: exercises.length,
    total,
    page,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: exercises.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      exercises,
    },
  });
});

// ============================================
// GET EXERCISES BY CATEGORY
// ============================================

/**
 * @route   GET /api/v1/exercises/category/:category
 * @desc    Get exercises by category
 * @access  Public
 * @params  category - Exercise category
 */
export const getExercisesByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;

  // Validate category
  const categoryValidation = validateEnum(category, EXERCISE_CATEGORIES_ARRAY, 'category');
  if (!categoryValidation.valid) {
    return next(new AppError(categoryValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Build pagination options
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Build filter
  const filter = {
    category,
    isActive: true,
  };

  // Build sort
  const sort = buildSortObject(req.query.sort);

  // Execute query
  const exercises = await Exercise.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await Exercise.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo('Exercises fetched by category', {
    category,
    count: exercises.length,
    total,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: exercises.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      exercises,
    },
  });
});

// ============================================
// GET EXERCISES BY DIFFICULTY
// ============================================

/**
 * @route   GET /api/v1/exercises/difficulty/:difficulty
 * @desc    Get exercises by difficulty level
 * @access  Public
 * @params  difficulty - Exercise difficulty
 */
export const getExercisesByDifficulty = catchAsync(async (req, res, next) => {
  const { difficulty } = req.params;

  // Validate difficulty
  const difficultyValidation = validateEnum(difficulty, EXERCISE_DIFFICULTY_ARRAY, 'difficulty');
  if (!difficultyValidation.valid) {
    return next(new AppError(difficultyValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Build pagination options
  const { limit, skip, page } = buildPaginationOptions(req.query);

  // Build filter
  const filter = {
    difficulty,
    isActive: true,
  };

  // Build sort
  const sort = buildSortObject(req.query.sort);

  // Execute query
  const exercises = await Exercise.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count
  const total = await Exercise.countDocuments(filter);

  // Calculate pagination metadata
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logInfo('Exercises fetched by difficulty', {
    difficulty,
    count: exercises.length,
    total,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    results: exercises.length,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
    data: {
      exercises,
    },
  });
});

// ============================================
// CREATE EXERCISE (ADMIN ONLY)
// ============================================

/**
 * @route   POST /api/v1/exercises
 * @desc    Create a new exercise
 * @access  Private (Admin only)
 */
export const createExercise = catchAsync(async (req, res, next) => {
  // Check if exercise with same name already exists
  const existingExercise = await Exercise.findOne({
    name: { $regex: new RegExp(`^${req.body.name}$`, 'i') }, // Case-insensitive
  });

  if (existingExercise) {
    return next(new AppError('Exercise with this name already exists', HTTP_STATUS.CONFLICT));
  }

  // Create new exercise
  const exercise = await Exercise.create(req.body);

  logInfo('Exercise created', {
    exerciseId: exercise._id.toString(),
    name: exercise.name,
    category: exercise.category,
    createdBy: req.user?._id?.toString(),
  });

  res.status(HTTP_STATUS.CREATED).json({
    status: API_STATUS.SUCCESS,
    data: {
      exercise,
    },
  });
});

// ============================================
// UPDATE EXERCISE (ADMIN ONLY)
// ============================================

/**
 * @route   PUT /api/v1/exercises/:id
 * @desc    Update an exercise
 * @access  Private (Admin only)
 * @params  id - Exercise ID
 */
export const updateExercise = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Check if exercise exists
  const exercise = await Exercise.findById(id);
  if (!exercise) {
    return next(new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND));
  }

  // If name is being updated, check for duplicates
  if (req.body.name && req.body.name !== exercise.name) {
    const existingExercise = await Exercise.findOne({
      name: { $regex: new RegExp(`^${req.body.name}$`, 'i') }, // Case-insensitive
      _id: { $ne: id }, // Exclude current exercise
    });

    if (existingExercise) {
      return next(new AppError('Exercise with this name already exists', HTTP_STATUS.CONFLICT));
    }
  }

  // Update exercise
  const updatedExercise = await Exercise.findByIdAndUpdate(id, req.body, {
    new: true, // Return updated document
    runValidators: true, // Run schema validators
  });

  logInfo('Exercise updated', {
    exerciseId: id,
    name: updatedExercise.name,
    updatedBy: req.user?._id?.toString(),
    updatedFields: Object.keys(req.body),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      exercise: updatedExercise,
    },
  });
});

// ============================================
// DELETE EXERCISE (ADMIN ONLY)
// ============================================

/**
 * @route   DELETE /api/v1/exercises/:id
 * @desc    Delete an exercise (soft delete by setting isActive to false)
 * @access  Private (Admin only)
 * @params  id - Exercise ID
 */
export const deleteExercise = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId format
  const idValidation = validateObjectId(id);
  if (!idValidation.valid) {
    return next(new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST));
  }

  // Check if exercise exists
  const exercise = await Exercise.findById(id);
  if (!exercise) {
    return next(new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND));
  }

  // Soft delete: set isActive to false instead of actually deleting
  // This preserves data integrity and allows recovery if needed
  exercise.isActive = false;
  await exercise.save();

  logInfo('Exercise deleted (soft delete)', {
    exerciseId: id,
    name: exercise.name,
    deletedBy: req.user?._id?.toString(),
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: 'Exercise deleted successfully',
  });
});
