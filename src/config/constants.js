/**
 * Application Constants
 * 
 * Centralized constants used throughout the application.
 * This ensures consistency and makes it easy to update values in one place.
 */

// ============================================
// USER CONSTANTS
// ============================================

/**
 * User Roles
 */
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  PREMIUM: 'premium',
};

/**
 * User Roles Array (for validation)
 */
export const USER_ROLES_ARRAY = Object.values(USER_ROLES);

/**
 * User Fitness Levels
 */
export const FITNESS_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
};

/**
 * User Fitness Levels Array
 */
export const FITNESS_LEVELS_ARRAY = Object.values(FITNESS_LEVELS);

/**
 * Username Constraints
 */
export const USERNAME = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 30,
  PATTERN: /^[a-zA-Z0-9_]+$/, // Only letters, numbers, and underscores
};

/**
 * Password Constraints
 */
export const PASSWORD = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL_CHAR: true,
  SPECIAL_CHARS: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
};

/**
 * Email Constraints
 */
export const EMAIL = {
  PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

// ============================================
// EXERCISE CONSTANTS
// ============================================

/**
 * Exercise Categories
 */
export const EXERCISE_CATEGORIES = {
  STRENGTH: 'strength',
  CARDIO: 'cardio',
  FLEXIBILITY: 'flexibility',
  BALANCE: 'balance',
  ENDURANCE: 'endurance',
};

/**
 * Exercise Categories Array
 */
export const EXERCISE_CATEGORIES_ARRAY = Object.values(EXERCISE_CATEGORIES);

/**
 * Exercise Difficulty Levels
 */
export const EXERCISE_DIFFICULTY = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
};

/**
 * Exercise Difficulty Levels Array
 */
export const EXERCISE_DIFFICULTY_ARRAY = Object.values(EXERCISE_DIFFICULTY);

/**
 * Exercise Equipment Types
 */
export const EXERCISE_EQUIPMENT = {
  NONE: 'none',
  DUMBBELLS: 'dumbbells',
  BARBELL: 'barbell',
  RESISTANCE_BANDS: 'resistance-bands',
  KETTLEBELL: 'kettlebell',
  MACHINE: 'machine',
  OTHER: 'other',
};

/**
 * Exercise Equipment Array
 */
export const EXERCISE_EQUIPMENT_ARRAY = Object.values(EXERCISE_EQUIPMENT);

/**
 * Exercise Name Constraints
 */
export const EXERCISE_NAME = {
  MAX_LENGTH: 100,
};

/**
 * Exercise Description Constraints
 */
export const EXERCISE_DESCRIPTION = {
  MAX_LENGTH: 1000,
};

/**
 * Angle Constraints (for form rules)
 */
export const ANGLES = {
  KNEE: { MIN: 0, MAX: 180 },
  BACK: { MIN: -90, MAX: 90 },
  HIP: { MIN: 0, MAX: 180 },
  SHOULDER: { MIN: 0, MAX: 180 },
};

// ============================================
// FEEDBACK CONSTANTS
// ============================================

/**
 * Feedback Types
 */
export const FEEDBACK_TYPES = {
  FORM_ERROR: 'form_error',
  IMPROVEMENT: 'improvement',
  ENCOURAGEMENT: 'encouragement',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Feedback Types Array
 */
export const FEEDBACK_TYPES_ARRAY = Object.values(FEEDBACK_TYPES);

/**
 * Feedback Severity Levels
 */
export const FEEDBACK_SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success',
};

/**
 * Feedback Severity Array
 */
export const FEEDBACK_SEVERITY_ARRAY = Object.values(FEEDBACK_SEVERITY);

/**
 * Feedback Message Constraints
 */
export const FEEDBACK_MESSAGE = {
  MAX_LENGTH: 500,
};

/**
 * Feedback Suggestion Constraints
 */
export const FEEDBACK_SUGGESTION = {
  MAX_LENGTH: 1000,
};

/**
 * Feedback Keypoints Limit
 */
export const FEEDBACK_KEYPOINTS_LIMIT = 20;

/**
 * Feedback Priority Weights (for sorting)
 */
export const FEEDBACK_PRIORITY = {
  SEVERITY: {
    error: 4,
    warning: 3,
    info: 2,
    success: 1,
  },
  TYPE: {
    form_error: 3,
    improvement: 2,
    encouragement: 1,
  },
};

// ============================================
// SESSION CONSTANTS
// ============================================

/**
 * Session Duration Constraints (in seconds)
 */
export const SESSION_DURATION = {
  MIN: 1, // Minimum 1 second
  MAX: 36000, // Maximum 10 hours (36000 seconds)
};

/**
 * Session Score Constraints
 */
export const SESSION_SCORE = {
  MIN: 0,
  MAX: 100,
};

/**
 * Session Notes Constraints
 */
export const SESSION_NOTES = {
  MAX_LENGTH: 2000,
};

/**
 * Session Tags Limit
 */
export const SESSION_TAGS_LIMIT = 10;

// ============================================
// POSE DATA CONSTANTS
// ============================================

/**
 * Keypoint Confidence Threshold
 */
export const KEYPOINT_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Keypoint Coordinates Constraints
 */
export const KEYPOINT_COORDINATES = {
  X_MIN: 0,
  X_MAX: 1, // Normalized coordinates (0-1)
  Y_MIN: 0,
  Y_MAX: 1,
  CONFIDENCE_MIN: 0,
  CONFIDENCE_MAX: 1,
};

/**
 * Pose Quality Thresholds
 */
export const POSE_QUALITY = {
  GOOD: 0.7,
  FAIR: 0.5,
  POOR: 0.3,
};

// ============================================
// FILE UPLOAD CONSTANTS
// ============================================

/**
 * File Size Limits (in bytes)
 */
export const FILE_SIZE = {
  IMAGE_MAX: 5 * 1024 * 1024, // 5MB
  VIDEO_MAX: 100 * 1024 * 1024, // 100MB
  VIDEO_CHUNK_SIZE: 7 * 1024 * 1024, // 7MB (for Cloudinary chunked uploads)
};

/**
 * Allowed Image MIME Types
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Allowed Video MIME Types
 */
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo', // .avi
];

/**
 * Allowed File Extensions
 */
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi'];

// ============================================
// PAGINATION CONSTANTS
// ============================================

/**
 * Default Pagination Values
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_PAGE: 1,
};

// ============================================
// JWT & AUTH CONSTANTS
// ============================================

/**
 * JWT Token Expiration Times
 */
export const JWT_EXPIRATION = {
  ACCESS_TOKEN: '24h', // 24 hours - extended for better user experience (prevents auto-logout during idle time)
  REFRESH_TOKEN: '30d', // 30 days - extended refresh token
  EMAIL_VERIFICATION: '24h', // 24 hours
  PASSWORD_RESET: '1h', // 1 hour
};

/**
 * OAuth Providers
 */
export const OAUTH_PROVIDERS = {
  GOOGLE: 'google',
  // Add more providers as needed
};

// ============================================
// API CONSTANTS
// ============================================

/**
 * API Response Status Messages
 */
export const API_STATUS = {
  SUCCESS: 'success',
  FAIL: 'fail',
  ERROR: 'error',
};

/**
 * HTTP Status Codes (commonly used)
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
};

/**
 * Rate Limiting
 */
export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100, // 100 requests per window
  MESSAGE: 'Too many requests from this IP, please try again later.',
};

// ============================================
// VALIDATION CONSTANTS
// ============================================

/**
 * Common Validation Patterns
 */
export const VALIDATION_PATTERNS = {
  USERNAME: /^[a-zA-Z0-9_]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: {
    HAS_UPPERCASE: /[A-Z]/,
    HAS_LOWERCASE: /[a-z]/,
    HAS_NUMBER: /[0-9]/,
    HAS_SPECIAL: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
  },
  OBJECT_ID: /^[0-9a-fA-F]{24}$/, // MongoDB ObjectId pattern
};

// ============================================
// CLOUDINARY CONSTANTS
// ============================================

/**
 * Cloudinary Upload Folders
 */
export const CLOUDINARY_FOLDERS = {
  ROOT: 'fitness-form-helper',
  EXERCISES: 'fitness-form-helper/exercises',
  SESSIONS: 'fitness-form-helper/sessions',
  AVATARS: 'fitness-form-helper/avatars',
  VIDEOS: 'aifitnesshelpervideos',
};

/**
 * Cloudinary Transformation Presets
 */
export const CLOUDINARY_TRANSFORMATIONS = {
  THUMBNAIL: {
    width: 300,
    height: 300,
    crop: 'fill',
    quality: 'auto:good',
    format: 'auto',
  },
  EXERCISE_IMAGE: {
    width: 800,
    height: 600,
    crop: 'fill',
    quality: 'auto:good',
    format: 'auto',
  },
  AVATAR: {
    width: 200,
    height: 200,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto:good',
    format: 'auto',
  },
};

// ============================================
// EXPORT ALL CONSTANTS
// ============================================

export default {
  // User
  USER_ROLES,
  USER_ROLES_ARRAY,
  FITNESS_LEVELS,
  FITNESS_LEVELS_ARRAY,
  USERNAME,
  PASSWORD,
  EMAIL,
  
  // Exercise
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY,
  EXERCISE_DIFFICULTY_ARRAY,
  EXERCISE_EQUIPMENT,
  EXERCISE_EQUIPMENT_ARRAY,
  EXERCISE_NAME,
  EXERCISE_DESCRIPTION,
  ANGLES,
  
  // Feedback
  FEEDBACK_TYPES,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY,
  FEEDBACK_SEVERITY_ARRAY,
  FEEDBACK_MESSAGE,
  FEEDBACK_SUGGESTION,
  FEEDBACK_KEYPOINTS_LIMIT,
  FEEDBACK_PRIORITY,
  
  // Session
  SESSION_DURATION,
  SESSION_SCORE,
  SESSION_NOTES,
  SESSION_TAGS_LIMIT,
  
  // Pose Data
  KEYPOINT_CONFIDENCE_THRESHOLD,
  KEYPOINT_COORDINATES,
  POSE_QUALITY,
  
  // File Upload
  FILE_SIZE,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  
  // Pagination
  PAGINATION,
  
  // JWT & Auth
  JWT_EXPIRATION,
  OAUTH_PROVIDERS,
  
  // API
  API_STATUS,
  HTTP_STATUS,
  RATE_LIMIT,
  
  // Validation
  VALIDATION_PATTERNS,
  
  // Cloudinary
  CLOUDINARY_FOLDERS,
  CLOUDINARY_TRANSFORMATIONS,
};
