import {
  KEYPOINT_CONFIDENCE_THRESHOLD,
  KEYPOINT_COORDINATES,
  ANGLES,
  POSE_QUALITY,
} from '../config/constants.js';
import AppError from './appError.js';
import { HTTP_STATUS } from '../config/constants.js';

/**
 * Pose Data Validators
 * 
 * Collection of validation functions for pose data received from the frontend.
 * Validates keypoints, angles, timestamps, and overall pose data structure.
 */

// ============================================
// KEYPOINT VALIDATION
// ============================================

/**
 * Validate a single keypoint
 * @param {Object} keypoint - Keypoint object
 * @param {string} keypoint.name - Keypoint name (e.g., 'nose', 'left_shoulder')
 * @param {number} keypoint.x - X coordinate (0-1 normalized)
 * @param {number} keypoint.y - Y coordinate (0-1 normalized)
 * @param {number} keypoint.confidence - Confidence score (0-1)
 * @param {number} [keypoint.z] - Optional Z coordinate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateKeypoint = (keypoint) => {
  const errors = [];

  if (!keypoint || typeof keypoint !== 'object') {
    return { valid: false, errors: ['Keypoint must be an object'] };
  }

  // Validate name
  if (!keypoint.name || typeof keypoint.name !== 'string') {
    errors.push('Keypoint name is required and must be a string');
  }

  // Validate x coordinate
  if (typeof keypoint.x !== 'number' || isNaN(keypoint.x)) {
    errors.push('X coordinate is required and must be a number');
  } else if (keypoint.x < KEYPOINT_COORDINATES.X_MIN || keypoint.x > KEYPOINT_COORDINATES.X_MAX) {
    errors.push(`X coordinate must be between ${KEYPOINT_COORDINATES.X_MIN} and ${KEYPOINT_COORDINATES.X_MAX}`);
  }

  // Validate y coordinate
  if (typeof keypoint.y !== 'number' || isNaN(keypoint.y)) {
    errors.push('Y coordinate is required and must be a number');
  } else if (keypoint.y < KEYPOINT_COORDINATES.Y_MIN || keypoint.y > KEYPOINT_COORDINATES.Y_MAX) {
    errors.push(`Y coordinate must be between ${KEYPOINT_COORDINATES.Y_MIN} and ${KEYPOINT_COORDINATES.Y_MAX}`);
  }

  // Validate confidence
  if (typeof keypoint.confidence !== 'number' || isNaN(keypoint.confidence)) {
    errors.push('Confidence is required and must be a number');
  } else if (
    keypoint.confidence < KEYPOINT_COORDINATES.CONFIDENCE_MIN ||
    keypoint.confidence > KEYPOINT_COORDINATES.CONFIDENCE_MAX
  ) {
    errors.push(
      `Confidence must be between ${KEYPOINT_COORDINATES.CONFIDENCE_MIN} and ${KEYPOINT_COORDINATES.CONFIDENCE_MAX}`
    );
  }

  // Validate optional z coordinate
  if (keypoint.z !== undefined) {
    if (typeof keypoint.z !== 'number' || isNaN(keypoint.z)) {
      errors.push('Z coordinate must be a number if provided');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate array of keypoints
 * @param {Array} keypoints - Array of keypoint objects
 * @param {Object} options - Validation options
 * @param {number} options.minKeypoints - Minimum number of keypoints required
 * @param {number} options.minConfidence - Minimum confidence threshold
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
export const validateKeypoints = (keypoints, options = {}) => {
  const errors = [];
  const warnings = [];
  const { minKeypoints = 1, minConfidence = KEYPOINT_CONFIDENCE_THRESHOLD } = options;

  if (!Array.isArray(keypoints)) {
    return { valid: false, errors: ['Keypoints must be an array'], warnings: [] };
  }

  if (keypoints.length < minKeypoints) {
    errors.push(`At least ${minKeypoints} keypoint(s) required, got ${keypoints.length}`);
  }

  let validKeypoints = 0;
  let lowConfidenceCount = 0;

  keypoints.forEach((keypoint, index) => {
    const result = validateKeypoint(keypoint);
    if (!result.valid) {
      errors.push(`Keypoint ${index}: ${result.errors.join(', ')}`);
    } else {
      validKeypoints++;
      if (keypoint.confidence < minConfidence) {
        lowConfidenceCount++;
        warnings.push(`Keypoint ${index} (${keypoint.name}) has low confidence: ${keypoint.confidence}`);
      }
    }
  });

  if (lowConfidenceCount > 0) {
    warnings.push(`${lowConfidenceCount} keypoint(s) have confidence below threshold (${minConfidence})`);
  }

  return {
    valid: errors.length === 0 && validKeypoints >= minKeypoints,
    errors,
    warnings,
    stats: {
      total: keypoints.length,
      valid: validKeypoints,
      lowConfidence: lowConfidenceCount,
    },
  };
};

// ============================================
// ANGLE VALIDATION
// ============================================

/**
 * Validate a single angle value
 * @param {string} angleType - Type of angle (e.g., 'kneeAngle', 'hipAngle')
 * @param {number} angle - Angle value in degrees
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateAngle = (angleType, angle) => {
  const errors = [];

  if (typeof angle !== 'number' || isNaN(angle)) {
    return { valid: false, errors: [`${angleType} must be a number`] };
  }

  const angleConstraints = ANGLES[angleType.toUpperCase().replace('ANGLE', '')];
  if (!angleConstraints) {
    return { valid: false, errors: [`Unknown angle type: ${angleType}`] };
  }

  if (angle < angleConstraints.MIN || angle > angleConstraints.MAX) {
    errors.push(
      `${angleType} must be between ${angleConstraints.MIN}° and ${angleConstraints.MAX}° (got ${angle}°)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate angles object
 * @param {Object} angles - Angles object
 * @param {number} [angles.kneeAngle] - Knee angle
 * @param {number} [angles.hipAngle] - Hip angle
 * @param {number} [angles.backAngle] - Back angle
 * @param {number} [angles.shoulderAngle] - Shoulder angle
 * @param {number} [angles.ankleAngle] - Ankle angle
 * @param {number} [angles.elbowAngle] - Elbow angle
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateAngles = (angles) => {
  const errors = [];

  if (!angles || typeof angles !== 'object') {
    return { valid: false, errors: ['Angles must be an object'] };
  }

  const angleTypes = ['kneeAngle', 'hipAngle', 'backAngle', 'shoulderAngle', 'ankleAngle', 'elbowAngle'];

  angleTypes.forEach((angleType) => {
    if (angles[angleType] !== undefined) {
      const result = validateAngle(angleType, angles[angleType]);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ============================================
// FRAME/TIMESTAMP VALIDATION
// ============================================

/**
 * Validate frame number
 * @param {number} frame - Frame number
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateFrame = (frame) => {
  const errors = [];

  if (typeof frame !== 'number' || isNaN(frame)) {
    errors.push('Frame number must be a number');
  } else if (frame < 0) {
    errors.push('Frame number cannot be negative');
  } else if (!Number.isInteger(frame)) {
    errors.push('Frame number must be an integer');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate timestamp
 * @param {number} timestamp - Timestamp in seconds or milliseconds
 * @param {boolean} isMilliseconds - Whether timestamp is in milliseconds (default: false)
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateTimestamp = (timestamp, isMilliseconds = false) => {
  const errors = [];

  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    errors.push('Timestamp must be a number');
  } else if (timestamp < 0) {
    errors.push('Timestamp cannot be negative');
  }

  // Warn if timestamp seems unreasonable (more than 10 hours)
  const maxTimestamp = isMilliseconds ? 36000000 : 36000; // 10 hours
  if (timestamp > maxTimestamp) {
    errors.push(`Timestamp seems unreasonably large: ${timestamp} ${isMilliseconds ? 'ms' : 's'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ============================================
// POSE DATA STRUCTURE VALIDATION
// ============================================

/**
 * Validate pose data frame (for ExerciseSession embedded structure)
 * @param {Object} frame - Pose data frame
 * @param {number} frame.frame - Frame number
 * @param {number} frame.timestamp - Timestamp in seconds
 * @param {Array} frame.keypoints - Array of keypoints
 * @param {Object} [frame.angles] - Calculated angles
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
export const validatePoseFrame = (frame) => {
  const errors = [];
  const warnings = [];

  if (!frame || typeof frame !== 'object') {
    return { valid: false, errors: ['Frame must be an object'], warnings: [] };
  }

  // Validate frame number
  const frameResult = validateFrame(frame.frame);
  if (!frameResult.valid) {
    errors.push(...frameResult.errors);
  }

  // Validate timestamp
  const timestampResult = validateTimestamp(frame.timestamp, false);
  if (!timestampResult.valid) {
    errors.push(...timestampResult.errors);
  }

  // Validate keypoints
  if (!frame.keypoints || !Array.isArray(frame.keypoints)) {
    errors.push('Keypoints must be an array');
  } else {
    const keypointsResult = validateKeypoints(frame.keypoints, { minKeypoints: 1 });
    if (!keypointsResult.valid) {
      errors.push(...keypointsResult.errors);
    }
    warnings.push(...keypointsResult.warnings);
  }

  // Validate angles if provided
  if (frame.angles) {
    const anglesResult = validateAngles(frame.angles);
    if (!anglesResult.valid) {
      errors.push(...anglesResult.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Validate pose data structure (for ExerciseSession)
 * @param {Object} poseData - Pose data object
 * @param {Array} poseData.keypoints - Array of pose frames
 * @param {number} [poseData.totalFrames] - Total number of frames
 * @param {number} [poseData.fps] - Frames per second
 * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
 */
export const validatePoseData = (poseData) => {
  const errors = [];
  const warnings = [];

  if (!poseData || typeof poseData !== 'object') {
    return { valid: false, errors: ['Pose data must be an object'], warnings: [] };
  }

  // Validate keypoints array
  if (!poseData.keypoints || !Array.isArray(poseData.keypoints)) {
    errors.push('Pose data must have a keypoints array');
  } else if (poseData.keypoints.length === 0) {
    errors.push('Pose data must have at least one frame');
  } else {
    // Validate each frame
    poseData.keypoints.forEach((frame, index) => {
      const frameResult = validatePoseFrame(frame);
      if (!frameResult.valid) {
        errors.push(`Frame ${index}: ${frameResult.errors.join(', ')}`);
      }
      warnings.push(...frameResult.warnings.map((w) => `Frame ${index}: ${w}`));
    });

    // Validate frame sequence
    const frames = poseData.keypoints.map((f) => f.frame).sort((a, b) => a - b);
    for (let i = 1; i < frames.length; i++) {
      if (frames[i] <= frames[i - 1]) {
        warnings.push(`Frame sequence may not be strictly increasing: frame ${frames[i - 1]} followed by ${frames[i]}`);
      }
    }
  }

  // Validate totalFrames if provided
  if (poseData.totalFrames !== undefined) {
    if (typeof poseData.totalFrames !== 'number' || poseData.totalFrames < 0) {
      errors.push('totalFrames must be a non-negative number');
    } else if (poseData.keypoints && poseData.totalFrames !== poseData.keypoints.length) {
      warnings.push(
        `totalFrames (${poseData.totalFrames}) does not match keypoints array length (${poseData.keypoints.length})`
      );
    }
  }

  // Validate fps if provided
  if (poseData.fps !== undefined) {
    if (typeof poseData.fps !== 'number' || poseData.fps < 1 || poseData.fps > 120) {
      errors.push('fps must be a number between 1 and 120');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

// ============================================
// POSE QUALITY VALIDATION
// ============================================

/**
 * Calculate pose quality based on keypoint confidence
 * @param {Array} keypoints - Array of keypoints
 * @returns {Object} Quality metrics { averageConfidence: number, quality: string, score: number }
 */
export const calculatePoseQuality = (keypoints) => {
  if (!Array.isArray(keypoints) || keypoints.length === 0) {
    return {
      averageConfidence: 0,
      quality: 'unknown',
      score: 0,
    };
  }

  const confidences = keypoints.map((kp) => kp.confidence || 0).filter((c) => c > 0);
  const averageConfidence = confidences.length > 0
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;

  let quality = 'poor';
  let score = 0;

  if (averageConfidence >= POSE_QUALITY.GOOD) {
    quality = 'good';
    score = 3;
  } else if (averageConfidence >= POSE_QUALITY.FAIR) {
    quality = 'fair';
    score = 2;
  } else if (averageConfidence >= POSE_QUALITY.POOR) {
    quality = 'poor';
    score = 1;
  }

  return {
    averageConfidence: Math.round(averageConfidence * 1000) / 1000, // Round to 3 decimals
    quality,
    score,
  };
};

/**
 * Check if pose data meets minimum quality requirements
 * @param {Array} keypoints - Array of keypoints
 * @param {number} minConfidence - Minimum average confidence threshold
 * @returns {Object} Quality check result { meetsThreshold: boolean, metrics: Object }
 */
export const checkPoseQuality = (keypoints, minConfidence = KEYPOINT_CONFIDENCE_THRESHOLD) => {
  const metrics = calculatePoseQuality(keypoints);
  return {
    meetsThreshold: metrics.averageConfidence >= minConfidence,
    metrics,
  };
};

// ============================================
// REQUIRED KEYPOINTS VALIDATION
// ============================================

/**
 * Common keypoint names for pose detection models
 */
export const KEYPOINT_NAMES = {
  MOVENET: [
    'nose',
    'left_eye',
    'right_eye',
    'left_ear',
    'right_ear',
    'left_shoulder',
    'right_shoulder',
    'left_elbow',
    'right_elbow',
    'left_wrist',
    'right_wrist',
    'left_hip',
    'right_hip',
    'left_knee',
    'right_knee',
    'left_ankle',
    'right_ankle',
  ],
  BLAZEPOSE: [
    'nose',
    'left_eye_inner',
    'left_eye',
    'left_eye_outer',
    'right_eye_inner',
    'right_eye',
    'right_eye_outer',
    'left_ear',
    'right_ear',
    'mouth_left',
    'mouth_right',
    'left_shoulder',
    'right_shoulder',
    'left_elbow',
    'right_elbow',
    'left_wrist',
    'right_wrist',
    'left_pinky',
    'right_pinky',
    'left_index',
    'right_index',
    'left_thumb',
    'right_thumb',
    'left_hip',
    'right_hip',
    'left_knee',
    'right_knee',
    'left_ankle',
    'right_ankle',
    'left_heel',
    'right_heel',
    'left_foot_index',
    'right_foot_index',
  ],
};

/**
 * Check if required keypoints are present
 * @param {Array} keypoints - Array of keypoints
 * @param {Array} requiredNames - Array of required keypoint names
 * @returns {Object} Validation result { valid: boolean, missing: string[], present: string[] }
 */
export const checkRequiredKeypoints = (keypoints, requiredNames = []) => {
  if (!Array.isArray(keypoints) || keypoints.length === 0) {
    return {
      valid: false,
      missing: requiredNames,
      present: [],
    };
  }

  const presentNames = keypoints.map((kp) => kp.name?.toLowerCase()).filter(Boolean);
  const missing = requiredNames.filter((name) => !presentNames.includes(name.toLowerCase()));

  return {
    valid: missing.length === 0,
    missing,
    present: presentNames,
  };
};

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Comprehensive pose data validation
 * @param {Object} poseData - Complete pose data object
 * @param {Object} options - Validation options
 * @param {number} options.minConfidence - Minimum confidence threshold
 * @param {Array} options.requiredKeypoints - Required keypoint names
 * @param {boolean} options.strict - Strict validation mode (throws errors)
 * @returns {Object} Validation result
 * @throws {AppError} If strict mode is enabled and validation fails
 */
export const validatePoseDataComplete = (poseData, options = {}) => {
  const {
    minConfidence = KEYPOINT_CONFIDENCE_THRESHOLD,
    requiredKeypoints = [],
    strict = false,
  } = options;

  // Validate structure
  const structureResult = validatePoseData(poseData);
  if (!structureResult.valid && strict) {
    throw new AppError(
      `Pose data validation failed: ${structureResult.errors.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Check quality for each frame
  const qualityResults = [];
  if (poseData.keypoints && Array.isArray(poseData.keypoints)) {
    poseData.keypoints.forEach((frame, index) => {
      if (frame.keypoints) {
        const quality = checkPoseQuality(frame.keypoints, minConfidence);
        qualityResults.push({ frame: index, ...quality });
      }
    });
  }

  // Check required keypoints if specified
  let requiredKeypointsResult = null;
  if (requiredKeypoints.length > 0 && poseData.keypoints && poseData.keypoints.length > 0) {
    // Check first frame (assuming all frames have similar keypoints)
    requiredKeypointsResult = checkRequiredKeypoints(poseData.keypoints[0].keypoints, requiredKeypoints);
  }

  const result = {
    valid: structureResult.valid,
    errors: structureResult.errors,
    warnings: structureResult.warnings,
    quality: qualityResults,
    requiredKeypoints: requiredKeypointsResult,
  };

  if (strict && !result.valid) {
    throw new AppError(
      `Pose data validation failed: ${result.errors.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  return result;
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  validateKeypoint,
  validateKeypoints,
  validateAngle,
  validateAngles,
  validateFrame,
  validateTimestamp,
  validatePoseFrame,
  validatePoseData,
  calculatePoseQuality,
  checkPoseQuality,
  checkRequiredKeypoints,
  validatePoseDataComplete,
  KEYPOINT_NAMES,
};
