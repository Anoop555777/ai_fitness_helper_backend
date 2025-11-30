/**
 * Request Validation Middleware
 * 
 * Validates request body, params, and query parameters before
 * processing requests. Uses validation utilities from validators.js
 * and throws AppError if validation fails.
 * 
 * @module middleware/validation
 */

import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';
import {
  validateEmail,
  validateUsername,
  validatePassword as validatePasswordStrength,
  validatePasswordConfirmation,
  validateObjectId,
  validateEnum,
  validateStringLength,
  validateNumber,
  validateArray,
  validateBoolean,
} from '../utils/validators.js';
import {
  USER_ROLES_ARRAY,
  FITNESS_LEVELS_ARRAY,
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY_ARRAY,
  EXERCISE_EQUIPMENT_ARRAY,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY_ARRAY,
  EXERCISE_NAME,
  EXERCISE_DESCRIPTION,
  FEEDBACK_MESSAGE,
  FEEDBACK_SUGGESTION,
  SESSION_DURATION,
  SESSION_SCORE,
  SESSION_NOTES,
} from '../config/constants.js';

// ============================================
// AUTH VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate user registration
 */
export const validateRegister = (req, res, next) => {
  const { username, email, password, confirmPassword } = req.body;
  const errors = [];

  // Validate username
  if (!username) {
    errors.push('Username is required');
  } else {
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      errors.push(usernameValidation.error);
    }
  }

  // Validate email
  if (!email) {
    errors.push('Email is required');
  } else {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.error);
    }
  }

  // Validate password
  if (!password) {
    errors.push('Password is required');
  } else {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }
  }

  // Validate password confirmation
  if (!confirmPassword) {
    errors.push('Password confirmation is required');
  } else if (password) {
    const confirmValidation = validatePasswordConfirmation(password, confirmPassword);
    if (!confirmValidation.valid) {
      errors.push(confirmValidation.error);
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate user login
 */
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  // Validate email
  if (!email) {
    errors.push('Email is required');
  } else {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.error);
    }
  }

  // Validate password
  if (!password) {
    errors.push('Password is required');
  } else if (typeof password !== 'string' || password.trim().length === 0) {
    errors.push('Password cannot be empty');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate profile update
 */
export const validateUpdateProfile = (req, res, next) => {
  const { username, email, fitnessLevel, profile } = req.body;
  const errors = [];

  // Handle FormData - profile fields come as nested strings like "profile[firstName]"
  // Parse them into a proper profile object for validation
  let profileToValidate = profile;
  if (req.body && typeof req.body === 'object' && !profile) {
    // Check if this is FormData (has nested profile fields)
    const profileKeys = Object.keys(req.body).filter(key => key.startsWith('profile['));
    if (profileKeys.length > 0) {
      profileToValidate = {};
      profileKeys.forEach(key => {
        const fieldName = key.match(/profile\[(.+)\]/)?.[1];
        if (fieldName) {
          let value = req.body[key];
          // Convert numeric fields
          if (fieldName === 'age' || fieldName === 'height' || fieldName === 'weight') {
            const numValue = parseFloat(value);
            value = !isNaN(numValue) && value !== '' && value !== undefined ? numValue : undefined;
          }
          // Only add non-empty values
          if (value !== '' && value !== undefined && value !== null) {
            profileToValidate[fieldName] = value;
          }
        }
      });
    }
  }

  // Validate username (if provided)
  if (username !== undefined && username !== '') {
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      errors.push(usernameValidation.error);
    }
  }

  // Validate email (if provided)
  if (email !== undefined && email !== '') {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      errors.push(emailValidation.error);
    }
  }

  // Validate fitness level (if provided)
  if (fitnessLevel !== undefined && fitnessLevel !== '') {
    const fitnessValidation = validateEnum(fitnessLevel, FITNESS_LEVELS_ARRAY, 'fitnessLevel');
    if (!fitnessValidation.valid) {
      errors.push(fitnessValidation.error);
    }
  }

  // Validate profile fields (if provided)
  if (profileToValidate) {
    // Validate firstName
    if (profileToValidate.firstName !== undefined && profileToValidate.firstName !== '') {
      const firstNameValidation = validateStringLength(profileToValidate.firstName, { max: 50 }, 'firstName');
      if (!firstNameValidation.valid) {
        errors.push(firstNameValidation.error);
      }
    }

    // Validate lastName
    if (profileToValidate.lastName !== undefined && profileToValidate.lastName !== '') {
      const lastNameValidation = validateStringLength(profileToValidate.lastName, { max: 50 }, 'lastName');
      if (!lastNameValidation.valid) {
        errors.push(lastNameValidation.error);
      }
    }

    // Validate age (1-150 years)
    if (profileToValidate.age !== undefined && profileToValidate.age !== '') {
      const ageValidation = validateNumber(profileToValidate.age, { min: 1, max: 150 });
      if (!ageValidation.valid) {
        errors.push(ageValidation.error);
      }
    }

    // Validate height (in cm: 50-250 cm)
    if (profileToValidate.height !== undefined && profileToValidate.height !== '') {
      const heightValidation = validateNumber(profileToValidate.height, { min: 50, max: 250 });
      if (!heightValidation.valid) {
        errors.push(heightValidation.error);
      }
    }

    // Validate weight (in kg: 20-300 kg)
    if (profileToValidate.weight !== undefined && profileToValidate.weight !== '') {
      const weightValidation = validateNumber(profileToValidate.weight, { min: 20, max: 300 });
      if (!weightValidation.valid) {
        errors.push(weightValidation.error);
      }
    }

    // Validate fitnessLevel
    if (profileToValidate.fitnessLevel !== undefined && profileToValidate.fitnessLevel !== '') {
      const fitnessValidation = validateEnum(profileToValidate.fitnessLevel, FITNESS_LEVELS_ARRAY, 'fitnessLevel');
      if (!fitnessValidation.valid) {
        errors.push(fitnessValidation.error);
      }
    }

    // Validate bio (max 500 characters)
    if (profileToValidate.bio !== undefined && profileToValidate.bio !== '') {
      const bioValidation = validateStringLength(profileToValidate.bio, { max: 500 }, 'bio');
      if (!bioValidation.valid) {
        errors.push(bioValidation.error);
      }
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate password update
 */
export const validatePassword = (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const errors = [];

  // Validate current password
  if (!currentPassword) {
    errors.push('Current password is required');
  }

  // Validate new password
  if (!newPassword) {
    errors.push('New password is required');
  } else {
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }
  }

  // Validate password confirmation
  if (!confirmPassword) {
    errors.push('Password confirmation is required');
  } else if (newPassword) {
    const confirmValidation = validatePasswordConfirmation(newPassword, confirmPassword);
    if (!confirmValidation.valid) {
      errors.push(confirmValidation.error);
    }
  }

  // Check if new password is different from current
  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push('New password must be different from current password');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

// ============================================
// EXERCISE VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate exercise creation/update
 */
export const validateExercise = (req, res, next) => {
  const { name, category, difficulty, description, targetMuscles, formRules, equipment } = req.body;
  const errors = [];

  // Validate name (required)
  if (!name) {
    errors.push('Exercise name is required');
  } else {
    const nameValidation = validateStringLength(name, {
      min: 1,
      max: EXERCISE_NAME.MAX_LENGTH,
      fieldName: 'Exercise name',
    });
    if (!nameValidation.valid) {
      errors.push(nameValidation.error);
    }
  }

  // Validate category (required)
  if (!category) {
    errors.push('Exercise category is required');
  } else {
    const categoryValidation = validateEnum(category, EXERCISE_CATEGORIES_ARRAY, 'category');
    if (!categoryValidation.valid) {
      errors.push(categoryValidation.error);
    }
  }

  // Validate difficulty (required)
  if (!difficulty) {
    errors.push('Exercise difficulty is required');
  } else {
    const difficultyValidation = validateEnum(difficulty, EXERCISE_DIFFICULTY_ARRAY, 'difficulty');
    if (!difficultyValidation.valid) {
      errors.push(difficultyValidation.error);
    }
  }

  // Validate description (optional)
  if (description !== undefined) {
    const descValidation = validateStringLength(description, {
      max: EXERCISE_DESCRIPTION.MAX_LENGTH,
      fieldName: 'Description',
    });
    if (!descValidation.valid) {
      errors.push(descValidation.error);
    }
  }

  // Validate target muscles (optional, but if provided must be array)
  if (targetMuscles !== undefined) {
    const musclesValidation = validateArray(targetMuscles, { minLength: 1 });
    if (!musclesValidation.valid) {
      errors.push(musclesValidation.error);
    }
  }

  // Validate equipment (optional)
  if (equipment !== undefined) {
    const equipmentValidation = validateArray(equipment, {
      allowedValues: EXERCISE_EQUIPMENT_ARRAY,
      fieldName: 'Equipment',
    });
    if (!equipmentValidation.valid) {
      errors.push(equipmentValidation.error);
    }
  }

  // Validate form rules (optional, but if provided must have valid structure)
  if (formRules !== undefined && typeof formRules === 'object') {
    // Basic structure validation - detailed validation happens in model
    const angleTypes = ['kneeAngle', 'hipAngle', 'backAngle', 'shoulderAngle', 'ankleAngle'];
    for (const angleType of angleTypes) {
      if (formRules[angleType]) {
        if (formRules[angleType].min !== undefined) {
          const minValidation = validateNumber(formRules[angleType].min, { min: 0, max: 180 });
          if (!minValidation.valid) {
            errors.push(`Invalid ${angleType}.min: ${minValidation.error}`);
          }
        }
        if (formRules[angleType].max !== undefined) {
          const maxValidation = validateNumber(formRules[angleType].max, { min: 0, max: 180 });
          if (!maxValidation.valid) {
            errors.push(`Invalid ${angleType}.max: ${maxValidation.error}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate exercise update (all fields optional)
 */
export const validateUpdateExercise = (req, res, next) => {
  const { name, category, difficulty, description, targetMuscles, formRules, equipment, isActive } = req.body;
  const errors = [];

  // Validate name (if provided)
  if (name !== undefined) {
    const nameValidation = validateStringLength(name, {
      min: 1,
      max: EXERCISE_NAME.MAX_LENGTH,
      fieldName: 'Exercise name',
    });
    if (!nameValidation.valid) {
      errors.push(nameValidation.error);
    }
  }

  // Validate category (if provided)
  if (category !== undefined) {
    const categoryValidation = validateEnum(category, EXERCISE_CATEGORIES_ARRAY, 'category');
    if (!categoryValidation.valid) {
      errors.push(categoryValidation.error);
    }
  }

  // Validate difficulty (if provided)
  if (difficulty !== undefined) {
    const difficultyValidation = validateEnum(difficulty, EXERCISE_DIFFICULTY_ARRAY, 'difficulty');
    if (!difficultyValidation.valid) {
      errors.push(difficultyValidation.error);
    }
  }

  // Validate description (if provided)
  if (description !== undefined) {
    const descValidation = validateStringLength(description, {
      max: EXERCISE_DESCRIPTION.MAX_LENGTH,
      fieldName: 'Description',
    });
    if (!descValidation.valid) {
      errors.push(descValidation.error);
    }
  }

  // Validate target muscles (if provided)
  if (targetMuscles !== undefined) {
    const musclesValidation = validateArray(targetMuscles, { minLength: 1 });
    if (!musclesValidation.valid) {
      errors.push(musclesValidation.error);
    }
  }

  // Validate equipment (if provided)
  if (equipment !== undefined) {
    const equipmentValidation = validateArray(equipment, {
      allowedValues: EXERCISE_EQUIPMENT_ARRAY,
      fieldName: 'Equipment',
    });
    if (!equipmentValidation.valid) {
      errors.push(equipmentValidation.error);
    }
  }

  // Validate isActive (if provided)
  if (isActive !== undefined) {
    const activeValidation = validateBoolean(isActive, 'isActive');
    if (!activeValidation.valid) {
      errors.push(activeValidation.error);
    }
  }

  // Validate form rules (if provided) - same as create
  if (formRules !== undefined && typeof formRules === 'object') {
    const angleTypes = ['kneeAngle', 'hipAngle', 'backAngle', 'shoulderAngle', 'ankleAngle'];
    for (const angleType of angleTypes) {
      if (formRules[angleType]) {
        if (formRules[angleType].min !== undefined) {
          const minValidation = validateNumber(formRules[angleType].min, { min: 0, max: 180 });
          if (!minValidation.valid) {
            errors.push(`Invalid ${angleType}.min: ${minValidation.error}`);
          }
        }
        if (formRules[angleType].max !== undefined) {
          const maxValidation = validateNumber(formRules[angleType].max, { min: 0, max: 180 });
          if (!maxValidation.valid) {
            errors.push(`Invalid ${angleType}.max: ${maxValidation.error}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

// ============================================
// FEEDBACK VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate feedback creation
 */
export const validateFeedback = (req, res, next) => {
  const { sessionId, type, message, severity, suggestion, timestamp, keypoints } = req.body;
  const errors = [];

  // Validate sessionId (required)
  if (!sessionId) {
    errors.push('Session ID is required');
  } else {
    const idValidation = validateObjectId(sessionId);
    if (!idValidation.valid) {
      errors.push(idValidation.error);
    }
  }

  // Validate type (required)
  if (!type) {
    errors.push('Feedback type is required');
  } else {
    const typeValidation = validateEnum(type, FEEDBACK_TYPES_ARRAY, 'type');
    if (!typeValidation.valid) {
      errors.push(typeValidation.error);
    }
  }

  // Validate message (required)
  if (!message) {
    errors.push('Feedback message is required');
  } else {
    const messageValidation = validateStringLength(message, {
      min: 1,
      max: FEEDBACK_MESSAGE.MAX_LENGTH,
      fieldName: 'Message',
    });
    if (!messageValidation.valid) {
      errors.push(messageValidation.error);
    }
  }

  // Validate severity (optional)
  if (severity !== undefined) {
    const severityValidation = validateEnum(severity, FEEDBACK_SEVERITY_ARRAY, 'severity');
    if (!severityValidation.valid) {
      errors.push(severityValidation.error);
    }
  }

  // Validate suggestion (optional)
  if (suggestion !== undefined) {
    const suggestionValidation = validateStringLength(suggestion, {
      max: FEEDBACK_SUGGESTION.MAX_LENGTH,
      fieldName: 'Suggestion',
    });
    if (!suggestionValidation.valid) {
      errors.push(suggestionValidation.error);
    }
  }

  // Validate timestamp (optional)
  if (timestamp !== undefined) {
    const timestampValidation = validateNumber(timestamp, { min: 0 });
    if (!timestampValidation.valid) {
      errors.push(`Invalid timestamp: ${timestampValidation.error}`);
    }
  }

  // Validate keypoints (optional)
  if (keypoints !== undefined) {
    const keypointsValidation = validateArray(keypoints, {
      maxLength: 20,
      fieldName: 'Keypoints',
    });
    if (!keypointsValidation.valid) {
      errors.push(keypointsValidation.error);
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate enhance feedback request
 */
export const validateEnhanceFeedback = (req, res, next) => {
  const { sessionId, useAI } = req.body;
  const errors = [];

  // Validate sessionId (required)
  if (!sessionId) {
    errors.push('Session ID is required');
  } else {
    const idValidation = validateObjectId(sessionId);
    if (!idValidation.valid) {
      errors.push(idValidation.error);
    }
  }

  // Validate useAI (optional)
  if (useAI !== undefined) {
    const aiValidation = validateBoolean(useAI, 'useAI');
    if (!aiValidation.valid) {
      errors.push(aiValidation.error);
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

// ============================================
// SESSION VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate session creation
 */
export const validateSession = (req, res, next) => {
  const { exerciseId, duration, overallScore, poseData, notes, tags } = req.body;
  const errors = [];

  // Validate exerciseId (required)
  if (!exerciseId) {
    errors.push('Exercise ID is required');
  } else {
    const idValidation = validateObjectId(exerciseId);
    if (!idValidation.valid) {
      errors.push(idValidation.error);
    }
  }

  // Validate duration (required)
  if (!duration) {
    errors.push('Duration is required');
  } else {
    const durationValidation = validateNumber(duration, {
      min: SESSION_DURATION.MIN,
      max: 3600, // 1 hour max (model constraint)
      fieldName: 'Duration',
    });
    if (!durationValidation.valid) {
      errors.push(durationValidation.error);
    }
  }

  // Validate overallScore (optional)
  if (overallScore !== undefined) {
    const scoreValidation = validateNumber(overallScore, {
      min: SESSION_SCORE.MIN,
      max: SESSION_SCORE.MAX,
      fieldName: 'Overall score',
    });
    if (!scoreValidation.valid) {
      errors.push(scoreValidation.error);
    }
  }

  // Validate notes (optional)
  if (notes !== undefined) {
    const notesValidation = validateStringLength(notes, {
      max: SESSION_NOTES.MAX_LENGTH,
      fieldName: 'Notes',
    });
    if (!notesValidation.valid) {
      errors.push(notesValidation.error);
    }
  }

  // Validate tags (optional)
  if (tags !== undefined) {
    const tagsValidation = validateArray(tags, {
      maxLength: 10,
      fieldName: 'Tags',
    });
    if (!tagsValidation.valid) {
      errors.push(tagsValidation.error);
    }
  }

  // Validate poseData structure (optional, but if provided must be valid)
  if (poseData !== undefined) {
    if (typeof poseData !== 'object' || poseData === null) {
      errors.push('Pose data must be an object');
    } else {
      if (poseData.keypoints !== undefined && !Array.isArray(poseData.keypoints)) {
        errors.push('Pose data keypoints must be an array');
      }
      if (poseData.totalFrames !== undefined) {
        const framesValidation = validateNumber(poseData.totalFrames, { min: 0 });
        if (!framesValidation.valid) {
          errors.push(`Invalid totalFrames: ${framesValidation.error}`);
        }
      }
      if (poseData.fps !== undefined) {
        const fpsValidation = validateNumber(poseData.fps, { min: 1, max: 120 });
        if (!fpsValidation.valid) {
          errors.push(`Invalid fps: ${fpsValidation.error}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

/**
 * Validate session update (all fields optional)
 */
export const validateUpdateSession = (req, res, next) => {
  const { notes, tags, isPublic, overallScore } = req.body;
  const errors = [];

  // Validate notes (if provided)
  if (notes !== undefined) {
    const notesValidation = validateStringLength(notes, {
      max: SESSION_NOTES.MAX_LENGTH,
      fieldName: 'Notes',
    });
    if (!notesValidation.valid) {
      errors.push(notesValidation.error);
    }
  }

  // Validate tags (if provided)
  if (tags !== undefined) {
    const tagsValidation = validateArray(tags, {
      maxLength: 10,
      fieldName: 'Tags',
    });
    if (!tagsValidation.valid) {
      errors.push(tagsValidation.error);
    }
  }

  // Validate isPublic (if provided)
  if (isPublic !== undefined) {
    const publicValidation = validateBoolean(isPublic, 'isPublic');
    if (!publicValidation.valid) {
      errors.push(publicValidation.error);
    }
  }

  // Validate overallScore (if provided)
  if (overallScore !== undefined) {
    const scoreValidation = validateNumber(overallScore, {
      min: SESSION_SCORE.MIN,
      max: SESSION_SCORE.MAX,
      fieldName: 'Overall score',
    });
    if (!scoreValidation.valid) {
      errors.push(scoreValidation.error);
    }
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};

// ============================================
// VIDEO VALIDATION MIDDLEWARE
// ============================================

/**
 * Validate video upload request
 */
export const validateVideoUpload = (req, res, next) => {
  const { sessionId } = req.body;
  const errors = [];

  // Validate sessionId (required)
  if (!sessionId) {
    errors.push('Session ID is required');
  } else {
    const idValidation = validateObjectId(sessionId);
    if (!idValidation.valid) {
      errors.push(idValidation.error);
    }
  }

  // Note: File validation is handled by Multer middleware
  // This middleware only validates the request body

  if (errors.length > 0) {
    return next(new AppError(errors.join('. '), HTTP_STATUS.BAD_REQUEST));
  }

  next();
};
