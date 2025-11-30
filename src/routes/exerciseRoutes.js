import express from 'express';
import {
  getAllExercises,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  getExercisesByCategory,
  getExercisesByDifficulty,
  searchExercises,
} from '../controllers/exerciseController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validateExercise, validateUpdateExercise } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   GET /api/v1/exercises
 * @desc    Get all exercises with optional filtering and pagination
 * @access  Public
 * @query   category, difficulty, limit, page, sort, search
 */
router.get('/', getAllExercises);

/**
 * @route   GET /api/v1/exercises/search
 * @desc    Search exercises by name or description
 * @access  Public
 * @query   q (search query), limit, page
 */
router.get('/search', searchExercises);

/**
 * @route   GET /api/v1/exercises/category/:category
 * @desc    Get exercises by category
 * @access  Public
 * @params  category (strength, cardio, flexibility, balance, endurance)
 */
router.get('/category/:category', getExercisesByCategory);

/**
 * @route   GET /api/v1/exercises/difficulty/:difficulty
 * @desc    Get exercises by difficulty level
 * @access  Public
 * @params  difficulty (beginner, intermediate, advanced)
 */
router.get('/difficulty/:difficulty', getExercisesByDifficulty);

/**
 * @route   GET /api/v1/exercises/:id
 * @desc    Get exercise by ID
 * @access  Public
 * @params  id (exercise ID)
 */
router.get('/:id', getExerciseById);

/**
 * @route   POST /api/v1/exercises
 * @desc    Create a new exercise (Admin only)
 * @access  Private (Admin)
 */
router.post('/', protect, restrictTo('admin'), validateExercise, createExercise);

/**
 * @route   PUT /api/v1/exercises/:id
 * @desc    Update an exercise (Admin only)
 * @access  Private (Admin)
 * @params  id (exercise ID)
 */
router.put('/:id', protect, restrictTo('admin'), validateUpdateExercise, updateExercise);

/**
 * @route   DELETE /api/v1/exercises/:id
 * @desc    Delete an exercise (Admin only)
 * @access  Private (Admin)
 * @params  id (exercise ID)
 */
router.delete('/:id', protect, restrictTo('admin'), deleteExercise);

export default router;
