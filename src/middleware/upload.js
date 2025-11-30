/**
 * Multer File Upload Middleware
 * 
 * Handles file uploads using Multer with memory storage.
 * Files are stored in memory as buffers for processing/uploading to Cloudinary.
 * 
 * Provides multiple upload configurations for different use cases:
 * - Video uploads (single file)
 * - Image uploads (single file)
 * - Avatar uploads (single file, strict validation)
 * - Exercise image uploads (single file)
 * - Multiple file uploads support
 * 
 * Note: Videos are optional - most users don't need to upload videos
 * since pose data is already analyzed in the browser.
 * 
 * @module middleware/upload
 */

import multer from 'multer';
import {
  ALLOWED_VIDEO_TYPES,
  ALLOWED_IMAGE_TYPES,
  FILE_SIZE,
} from '../config/constants.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';

// Configure memory storage (files stored as buffers in memory)
// This is ideal for uploading directly to Cloudinary without saving to disk
const storage = multer.memoryStorage();

/**
 * File filter for video uploads
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const videoFileFilter = (req, file, cb) => {
  // Check if file is a video
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type. Allowed video types: ${ALLOWED_VIDEO_TYPES.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

/**
 * File filter for image uploads
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const imageFileFilter = (req, file, cb) => {
  // Check if file is an allowed image type
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type. Allowed image types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

/**
 * File filter for avatar uploads (strict validation)
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const avatarFileFilter = (req, file, cb) => {
  // Only allow common image formats for avatars
  const allowedAvatarTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedAvatarTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Invalid file type for avatar. Allowed types: ${allowedAvatarTypes.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

// ============================================
// VIDEO UPLOAD CONFIGURATIONS
// ============================================

/**
 * Multer configuration for single video upload
 * 
 * Use for: Session video uploads
 * Limits: 100MB max file size
 * 
 * @example
 * router.post('/upload', uploadVideoFile.single('videoFile'), uploadVideo);
 */
export const uploadVideoFile = multer({
  storage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: FILE_SIZE.VIDEO_MAX, // Max file size (100MB)
  },
});

/**
 * Multer configuration for multiple video uploads
 * 
 * Use for: Bulk video uploads (if needed)
 * Limits: 100MB max per file, max 5 files
 * 
 * @example
 * router.post('/upload-multiple', uploadVideoFiles.array('videoFiles', 5), uploadVideos);
 */
export const uploadVideoFiles = multer({
  storage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: FILE_SIZE.VIDEO_MAX,
    files: 5, // Max 5 files
  },
});

// ============================================
// IMAGE UPLOAD CONFIGURATIONS
// ============================================

/**
 * Multer configuration for single image upload
 * 
 * Use for: General image uploads
 * Limits: 5MB max file size
 * 
 * @example
 * router.post('/upload', uploadImageFile.single('imageFile'), uploadImage);
 */
export const uploadImageFile = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: FILE_SIZE.IMAGE_MAX, // Max file size (5MB)
  },
});

/**
 * Multer configuration for multiple image uploads
 * 
 * Use for: Gallery uploads, bulk image uploads
 * Limits: 5MB max per file, max 10 files
 * 
 * @example
 * router.post('/upload-gallery', uploadImageFiles.array('imageFiles', 10), uploadImages);
 */
export const uploadImageFiles = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: FILE_SIZE.IMAGE_MAX,
    files: 10, // Max 10 files
  },
});

// ============================================
// AVATAR UPLOAD CONFIGURATIONS
// ============================================

/**
 * Multer configuration for avatar upload
 * 
 * Use for: User profile picture uploads
 * Limits: 2MB max file size (smaller than general images)
 * 
 * @example
 * router.post('/avatar', uploadAvatarFile.single('avatar'), uploadAvatar);
 */
export const uploadAvatarFile = multer({
  storage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max for avatars
  },
});

// ============================================
// EXERCISE IMAGE UPLOAD CONFIGURATIONS
// ============================================

/**
 * Multer configuration for exercise image upload
 * 
 * Use for: Exercise demonstration images
 * Limits: 5MB max file size
 * 
 * @example
 * router.post('/exercise-image', uploadExerciseImageFile.single('exerciseImage'), uploadExerciseImage);
 */
export const uploadExerciseImageFile = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: FILE_SIZE.IMAGE_MAX, // Max file size (5MB)
  },
});

// ============================================
// MIXED FILE UPLOAD CONFIGURATIONS
// ============================================

/**
 * Multer configuration for mixed file uploads (images and videos)
 * 
 * Use for: Uploads that may contain both images and videos
 * Limits: 100MB max per file
 * 
 * @example
 * router.post('/upload-mixed', uploadMixedFiles.fields([
 *   { name: 'images', maxCount: 5 },
 *   { name: 'videos', maxCount: 2 }
 * ]), uploadMixedFiles);
 */
export const uploadMixedFiles = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Allow both images and videos
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) || ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          `Invalid file type. Allowed types: images (${ALLOWED_IMAGE_TYPES.join(', ')}) or videos (${ALLOWED_VIDEO_TYPES.join(', ')})`,
          HTTP_STATUS.BAD_REQUEST
        ),
        false
      );
    }
  },
  limits: {
    fileSize: FILE_SIZE.VIDEO_MAX, // Use video max size as it's larger
    files: 10, // Max 10 files total
  },
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create a custom multer upload configuration
 * 
 * @param {Object} options - Upload configuration options
 * @param {Function} options.fileFilter - Custom file filter function
 * @param {number} options.maxFileSize - Max file size in bytes
 * @param {number} options.maxFiles - Max number of files (for array/fields)
 * @param {string[]} options.allowedTypes - Array of allowed MIME types
 * @returns {multer.Multer} Multer instance
 * 
 * @example
 * const customUpload = createUploadConfig({
 *   allowedTypes: ['image/png', 'image/jpeg'],
 *   maxFileSize: 3 * 1024 * 1024, // 3MB
 * });
 */
export const createUploadConfig = (options = {}) => {
  const {
    fileFilter,
    maxFileSize = FILE_SIZE.IMAGE_MAX,
    maxFiles,
    allowedTypes = ALLOWED_IMAGE_TYPES,
  } = options;

  // Create custom file filter if allowedTypes provided
  const customFileFilter = fileFilter || ((req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
          HTTP_STATUS.BAD_REQUEST
        ),
        false
      );
    }
  });

  const limits = {
    fileSize: maxFileSize,
    ...(maxFiles && { files: maxFiles }),
  };

  return multer({
    storage,
    fileFilter: customFileFilter,
    limits,
  });
};

// Default export (single video file upload)
export default uploadVideoFile;
