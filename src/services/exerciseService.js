/**
 * Exercise Service
 * 
 * Service layer for exercise-related business logic and database operations.
 * This service abstracts database queries from controllers and provides
 * reusable functions for exercise management.
 * 
 * Features:
 * - CRUD operations for exercises
 * - Advanced querying with filtering, sorting, and pagination
 * - Search functionality
 * - Validation and business logic
 * - Exercise recommendations based on user level
 */

import Exercise from '../models/Exercise.js';
import {
 
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY,
  EXERCISE_DIFFICULTY_ARRAY,
  EXERCISE_EQUIPMENT_ARRAY,
  PAGINATION,
  ANGLES,
} from '../config/constants.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';

/**
 * Build query filter from options
 * @param {Object} options - Filter options
 * @param {string} options.category - Exercise category
 * @param {string} options.difficulty - Exercise difficulty
 * @param {string|string[]} options.equipment - Equipment type(s)
 * @param {boolean} options.isActive - Filter by active status (default: true)
 * @param {boolean} options.includeInactive - Include inactive exercises (default: false)
 * @param {string} options.search - Text search query
 * @returns {Object} Mongoose query filter
 */
export const buildExerciseFilter = (options = {}) => {
  const filter = {};

  // Default to active exercises only
  if (options.includeInactive !== true) {
    filter.isActive = options.isActive !== undefined ? options.isActive : true;
  }

  // Filter by category
  if (options.category) {
    if (!EXERCISE_CATEGORIES_ARRAY.includes(options.category)) {
      throw new AppError(
        `Invalid category. Must be one of: ${EXERCISE_CATEGORIES_ARRAY.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    filter.category = options.category;
  }

  // Filter by difficulty
  if (options.difficulty) {
    if (!EXERCISE_DIFFICULTY_ARRAY.includes(options.difficulty)) {
      throw new AppError(
        `Invalid difficulty. Must be one of: ${EXERCISE_DIFFICULTY_ARRAY.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    filter.difficulty = options.difficulty;
  }

  // Filter by equipment
  if (options.equipment) {
    const equipmentArray = Array.isArray(options.equipment)
      ? options.equipment
      : [options.equipment];
    
    // Validate equipment types
    const invalidEquipment = equipmentArray.filter(
      (eq) => !EXERCISE_EQUIPMENT_ARRAY.includes(eq)
    );
    
    if (invalidEquipment.length > 0) {
      throw new AppError(
        `Invalid equipment: ${invalidEquipment.join(', ')}. Must be one of: ${EXERCISE_EQUIPMENT_ARRAY.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    
    filter.equipment = { $in: equipmentArray };
  }

  // Text search
  if (options.search && options.search.trim()) {
    const searchRegex = new RegExp(options.search.trim(), 'i');
    filter.$or = [
      { name: searchRegex },
      { description: searchRegex },
      { targetMuscles: { $in: [searchRegex] } },
    ];
  }

  return filter;
};

/**
 * Build sort object from sort string
 * @param {string} sortQuery - Sort query string (e.g., "name,-createdAt")
 * @param {Object} defaultSort - Default sort object (default: { createdAt: -1 })
 * @returns {Object} Mongoose sort object
 */
export const buildSortObject = (sortQuery, defaultSort = { createdAt: -1 }) => {
  if (!sortQuery) {
    return defaultSort;
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
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 20, max: 100)
 * @returns {Object} Pagination options { limit, skip, page }
 */
export const buildPaginationOptions = (options = {}) => {
  const page = Math.max(
    PAGINATION.MIN_PAGE,
    parseInt(options.page, 10) || PAGINATION.DEFAULT_PAGE
  );
  const limit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(options.limit, 10) || PAGINATION.DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { limit, skip, page };
};

/**
 * Calculate pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
export const calculatePaginationMetadata = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Get all exercises with filtering, sorting, and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with exercises and pagination metadata
 */
export const getAllExercises = async (options = {}) => {
  try {
    const filter = buildExerciseFilter(options);
    const sort = buildSortObject(options.sort);
    const { limit, skip, page } = buildPaginationOptions(options);

    // Build query with sanitizeFilter for security
    const query = Exercise.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Use lean() for better performance when we don't need Mongoose documents
    const exercises = await query.lean();

    // Get total count
    const total = await Exercise.countDocuments(filter);

    // Calculate pagination metadata
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Exercises fetched', {
      count: exercises.length,
      total,
      page,
      limit,
      filters: Object.keys(filter),
    });

    return {
      exercises,
      pagination,
    };
  } catch (error) {
    logError('Failed to fetch exercises', error);
    throw error;
  }
};

/**
 * Get exercise by ID
 * @param {string} exerciseId - Exercise ID
 * @param {Object} options - Query options
 * @param {boolean} options.includeInactive - Include inactive exercises (default: false)
 * @returns {Promise<Object>} Exercise document
 * @throws {AppError} If exercise not found
 */
export const getExerciseById = async (exerciseId, options = {}) => {
  try {
    const exercise = await Exercise.findById(exerciseId);

    if (!exercise) {
      throw new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND);
    }

    // Check if exercise is active (unless includeInactive is true)
    if (!exercise.isActive && !options.includeInactive) {
      throw new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND);
    }

    logInfo('Exercise fetched by ID', {
      exerciseId,
      name: exercise.name,
    });

    return exercise;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch exercise by ID', error);
    throw new AppError('Failed to fetch exercise', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Search exercises by name, description, or target muscles
 * @param {string} searchQuery - Search query string
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with exercises and pagination metadata
 */
export const searchExercises = async (searchQuery, options = {}) => {
  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
    throw new AppError('Search query is required', HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const filter = buildExerciseFilter({
      ...options,
      search: searchQuery.trim(),
    });
    const sort = buildSortObject(options.sort, { createdAt: -1 });
    const { limit, skip, page } = buildPaginationOptions(options);

    const exercises = await Exercise.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Exercise.countDocuments(filter);
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Exercises searched', {
      query: searchQuery,
      count: exercises.length,
      total,
      page,
    });

    return {
      exercises,
      pagination,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to search exercises', error);
    throw new AppError('Failed to search exercises', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get exercises by category
 * @param {string} category - Exercise category
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with exercises and pagination metadata
 */
export const getExercisesByCategory = async (category, options = {}) => {
  if (!EXERCISE_CATEGORIES_ARRAY.includes(category)) {
    throw new AppError(
      `Invalid category. Must be one of: ${EXERCISE_CATEGORIES_ARRAY.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    const filter = buildExerciseFilter({ ...options, category });
    const sort = buildSortObject(options.sort);
    const { limit, skip, page } = buildPaginationOptions(options);

    const exercises = await Exercise.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Exercise.countDocuments(filter);
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Exercises fetched by category', {
      category,
      count: exercises.length,
      total,
    });

    return {
      exercises,
      pagination,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch exercises by category', error);
    throw new AppError('Failed to fetch exercises', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get exercises by difficulty
 * @param {string} difficulty - Exercise difficulty
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with exercises and pagination metadata
 */
export const getExercisesByDifficulty = async (difficulty, options = {}) => {
  if (!EXERCISE_DIFFICULTY_ARRAY.includes(difficulty)) {
    throw new AppError(
      `Invalid difficulty. Must be one of: ${EXERCISE_DIFFICULTY_ARRAY.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    const filter = buildExerciseFilter({ ...options, difficulty });
    const sort = buildSortObject(options.sort);
    const { limit, skip, page } = buildPaginationOptions(options);

    const exercises = await Exercise.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Exercise.countDocuments(filter);
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Exercises fetched by difficulty', {
      difficulty,
      count: exercises.length,
      total,
    });

    return {
      exercises,
      pagination,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch exercises by difficulty', error);
    throw new AppError('Failed to fetch exercises', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get exercises suitable for user fitness level
 * @param {string} userLevel - User fitness level
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Object with exercises and pagination metadata
 */
export const getExercisesForUserLevel = async (userLevel, options = {}) => {
  // Map user level to exercise difficulties
  const levelToDifficulties = {
    beginner: [EXERCISE_DIFFICULTY.BEGINNER],
    intermediate: [EXERCISE_DIFFICULTY.BEGINNER, EXERCISE_DIFFICULTY.INTERMEDIATE],
    advanced: [
      EXERCISE_DIFFICULTY.BEGINNER,
      EXERCISE_DIFFICULTY.INTERMEDIATE,
      EXERCISE_DIFFICULTY.ADVANCED,
    ],
    expert: [
      EXERCISE_DIFFICULTY.BEGINNER,
      EXERCISE_DIFFICULTY.INTERMEDIATE,
      EXERCISE_DIFFICULTY.ADVANCED,
    ],
  };

  const allowedDifficulties = levelToDifficulties[userLevel] || levelToDifficulties.beginner;

  try {
    // Build base filter without difficulty
    const baseFilter = buildExerciseFilter(options);
    
    // Add difficulty filter with $in for multiple values
    const filter = {
      ...baseFilter,
      difficulty: { $in: allowedDifficulties },
    };

    const sort = buildSortObject(options.sort);
    const { limit, skip, page } = buildPaginationOptions(options);

    const exercises = await Exercise.find(filter)
      .setOptions({ sanitizeFilter: true })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Exercise.countDocuments(filter);
    const pagination = calculatePaginationMetadata(total, page, limit);

    logInfo('Exercises fetched for user level', {
      userLevel,
      count: exercises.length,
      total,
    });

    return {
      exercises,
      pagination,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to fetch exercises for user level', error);
    throw new AppError('Failed to fetch exercises', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Create a new exercise
 * @param {Object} exerciseData - Exercise data
 * @param {Object} options - Create options
 * @returns {Promise<Object>} Created exercise
 * @throws {AppError} If exercise already exists or validation fails
 */
export const createExercise = async (exerciseData, options = {}) => {
  try {
    // Check if exercise with same name already exists (case-insensitive)
    const existingExercise = await Exercise.findOne({
      name: { $regex: new RegExp(`^${exerciseData.name}$`, 'i') },
    });

    if (existingExercise) {
      throw new AppError('Exercise with this name already exists', HTTP_STATUS.CONFLICT);
    }

    // Validate form rules if provided
    if (exerciseData.formRules) {
      validateFormRules(exerciseData.formRules);
    }

    // Create exercise
    const exercise = await Exercise.create(exerciseData);

    logInfo('Exercise created', {
      exerciseId: exercise._id.toString(),
      name: exercise.name,
      category: exercise.category,
      createdBy: options.createdBy,
    });

    return exercise;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to create exercise', error);
    throw new AppError('Failed to create exercise', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Update an exercise
 * @param {string} exerciseId - Exercise ID
 * @param {Object} updateData - Update data
 * @param {Object} options - Update options
 * @returns {Promise<Object>} Updated exercise
 * @throws {AppError} If exercise not found or validation fails
 */
export const updateExercise = async (exerciseId, updateData, options = {}) => {
  try {
    // Check if exercise exists
    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      throw new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND);
    }

    // If name is being updated, check for duplicates
    if (updateData.name && updateData.name !== exercise.name) {
      const existingExercise = await Exercise.findOne({
        name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
        _id: { $ne: exerciseId },
      });

      if (existingExercise) {
        throw new AppError('Exercise with this name already exists', HTTP_STATUS.CONFLICT);
      }
    }

    // Validate form rules if provided
    if (updateData.formRules) {
      validateFormRules(updateData.formRules);
    }

    // Update exercise
    const updatedExercise = await Exercise.findByIdAndUpdate(
      exerciseId,
      updateData,
      {
        new: true, // Return updated document
        runValidators: true, // Run schema validators
      }
    );

    logInfo('Exercise updated', {
      exerciseId,
      name: updatedExercise.name,
      updatedBy: options.updatedBy,
      updatedFields: Object.keys(updateData),
    });

    return updatedExercise;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to update exercise', error);
    throw new AppError('Failed to update exercise', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Delete an exercise (soft delete)
 * @param {string} exerciseId - Exercise ID
 * @param {Object} options - Delete options
 * @returns {Promise<Object>} Deleted exercise
 * @throws {AppError} If exercise not found
 */
export const deleteExercise = async (exerciseId, options = {}) => {
  try {
    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      throw new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND);
    }

    // Soft delete: set isActive to false
    exercise.isActive = false;
    await exercise.save();

    logInfo('Exercise deleted (soft delete)', {
      exerciseId,
      name: exercise.name,
      deletedBy: options.deletedBy,
    });

    return exercise;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to delete exercise', error);
    throw new AppError('Failed to delete exercise', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Restore a deleted exercise
 * @param {string} exerciseId - Exercise ID
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} Restored exercise
 * @throws {AppError} If exercise not found
 */
export const restoreExercise = async (exerciseId, options = {}) => {
  try {
    const exercise = await Exercise.findById(exerciseId);
    if (!exercise) {
      throw new AppError('Exercise not found', HTTP_STATUS.NOT_FOUND);
    }

    exercise.isActive = true;
    await exercise.save();

    logInfo('Exercise restored', {
      exerciseId,
      name: exercise.name,
      restoredBy: options.restoredBy,
    });

    return exercise;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logError('Failed to restore exercise', error);
    throw new AppError('Failed to restore exercise', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Validate form rules
 * @param {Object} formRules - Form rules object
 * @throws {AppError} If form rules are invalid
 */
export const validateFormRules = (formRules) => {
  const angleTypes = ['kneeAngle', 'backAngle', 'hipAngle', 'shoulderAngle'];
  const angleLimits = {
    kneeAngle: ANGLES.KNEE,
    backAngle: ANGLES.BACK,
    hipAngle: ANGLES.HIP,
    shoulderAngle: ANGLES.SHOULDER,
  };

  for (const angleType of angleTypes) {
    if (formRules[angleType]) {
      const { min, max } = formRules[angleType];
      const limits = angleLimits[angleType];

      // Validate min and max are within allowed range
      if (min !== undefined) {
        if (min < limits.MIN || min > limits.MAX) {
          throw new AppError(
            `${angleType} min value must be between ${limits.MIN} and ${limits.MAX}`,
            HTTP_STATUS.BAD_REQUEST
          );
        }
      }

      if (max !== undefined) {
        if (max < limits.MIN || max > limits.MAX) {
          throw new AppError(
            `${angleType} max value must be between ${limits.MIN} and ${limits.MAX}`,
            HTTP_STATUS.BAD_REQUEST
          );
        }
      }

      // Validate min <= max
      if (min !== undefined && max !== undefined && min > max) {
        throw new AppError(
          `${angleType}: min value cannot be greater than max value`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }
  }
};

/**
 * Get exercise statistics
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Exercise statistics
 */
export const getExerciseStats = async (options = {}) => {
  try {
    const filter = buildExerciseFilter(options);

    const stats = await Exercise.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byCategory: {
            $push: '$category',
          },
          byDifficulty: {
            $push: '$difficulty',
          },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        total: 0,
        byCategory: {},
        byDifficulty: {},
      };
    }

    const result = stats[0];

    // Count by category
    const byCategory = {};
    result.byCategory.forEach((category) => {
      byCategory[category] = (byCategory[category] || 0) + 1;
    });

    // Count by difficulty
    const byDifficulty = {};
    result.byDifficulty.forEach((difficulty) => {
      byDifficulty[difficulty] = (byDifficulty[difficulty] || 0) + 1;
    });

    return {
      total: result.total,
      byCategory,
      byDifficulty,
    };
  } catch (error) {
    logError('Failed to get exercise statistics', error);
    throw new AppError('Failed to get exercise statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Check if exercise name exists
 * @param {string} name - Exercise name
 * @param {string} excludeId - Exercise ID to exclude from check
 * @returns {Promise<boolean>} True if name exists
 */
export const exerciseNameExists = async (name, excludeId = null) => {
  try {
    const filter = {
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const count = await Exercise.countDocuments(filter);
    return count > 0;
  } catch (error) {
    logError('Failed to check exercise name', error);
    return false;
  }
};

// Default export
export default {
  buildExerciseFilter,
  buildSortObject,
  buildPaginationOptions,
  calculatePaginationMetadata,
  getAllExercises,
  getExerciseById,
  searchExercises,
  getExercisesByCategory,
  getExercisesByDifficulty,
  getExercisesForUserLevel,
  createExercise,
  updateExercise,
  deleteExercise,
  restoreExercise,
  validateFormRules,
  getExerciseStats,
  exerciseNameExists,
};
