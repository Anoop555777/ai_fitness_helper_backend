/**
 * Pose Service
 * 
 * Service layer for pose data validation, processing, and analysis.
 * This service abstracts pose-related business logic from controllers
 * and provides reusable functions for pose data management.
 * 
 * Features:
 * - Pose data validation
 * - Keypoint extraction and analysis
 * - Angle and distance calculations
 * - Pose quality assessment
 * - Pose statistics and analytics
 * - Integration with ExerciseSession and PoseData models
 */

import PoseData from '../models/PoseData.js';
import ExerciseSession from '../models/ExerciseSession.js';
import {
  KEYPOINT_CONFIDENCE_THRESHOLD,
  KEYPOINT_COORDINATES,
  POSE_QUALITY,
  ANGLES,
} from '../config/constants.js';
import {
  validatePoseData,
  validatePoseFrame,
  validateKeypoints,
  validateAngles,
  calculatePoseQuality,
  checkPoseQuality,
  checkRequiredKeypoints,
  validatePoseDataComplete,
} from '../utils/poseValidators.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
import AppError from '../utils/appError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { validateObjectId } from '../utils/validators.js';

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate pose data structure
 * @param {Object} poseData - Pose data object
 * @param {Object} options - Validation options
 * @param {number} options.minConfidence - Minimum confidence threshold
 * @param {Array} options.requiredKeypoints - Required keypoint names
 * @param {boolean} options.strict - Strict validation mode
 * @returns {Object} Validation result
 * @throws {AppError} If strict mode is enabled and validation fails
 */
export const validatePoseDataStructure = (poseData, options = {}) => {
  try {
    return validatePoseDataComplete(poseData, options);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Pose data validation failed: ${error.message}`, HTTP_STATUS.BAD_REQUEST);
  }
};

/**
 * Validate a single pose frame
 * @param {Object} frame - Pose frame object
 * @returns {Object} Validation result
 */
export const validatePoseFrameData = (frame) => {
  return validatePoseFrame(frame);
};

/**
 * Validate keypoints array
 * @param {Array} keypoints - Array of keypoints
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export const validateKeypointsData = (keypoints, options = {}) => {
  return validateKeypoints(keypoints, options);
};

// ============================================
// KEYPOINT UTILITIES
// ============================================

/**
 * Get keypoint by name from a frame
 * @param {Object} frame - Pose frame with keypoints
 * @param {string} keypointName - Name of the keypoint
 * @returns {Object|null} Keypoint object or null if not found
 */
export const getKeypointByName = (frame, keypointName) => {
  if (!frame || !frame.keypoints || !Array.isArray(frame.keypoints)) {
    return null;
  }

  return frame.keypoints.find((kp) => kp.name?.toLowerCase() === keypointName.toLowerCase()) || null;
};

/**
 * Get multiple keypoints by names
 * @param {Object} frame - Pose frame with keypoints
 * @param {Array<string>} keypointNames - Array of keypoint names
 * @returns {Object} Object with keypoint names as keys and keypoint objects as values
 */
export const getKeypointsByNames = (frame, keypointNames) => {
  const result = {};
  if (!frame || !frame.keypoints || !Array.isArray(frame.keypoints)) {
    return result;
  }

  keypointNames.forEach((name) => {
    const keypoint = getKeypointByName(frame, name);
    if (keypoint) {
      result[name] = keypoint;
    }
  });

  return result;
};

/**
 * Calculate distance between two keypoints
 * @param {Object} kp1 - First keypoint { x, y }
 * @param {Object} kp2 - Second keypoint { x, y }
 * @returns {number} Euclidean distance
 */
export const calculateKeypointDistance = (kp1, kp2) => {
  if (!kp1 || !kp2 || kp1.x === undefined || kp1.y === undefined || kp2.x === undefined || kp2.y === undefined) {
    return null;
  }

  const dx = kp2.x - kp1.x;
  const dy = kp2.y - kp1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Calculate angle between three keypoints (in degrees)
 * @param {Object} kp1 - First keypoint (vertex)
 * @param {Object} kp2 - Second keypoint (vertex)
 * @param {Object} kp3 - Third keypoint (vertex)
 * @returns {number|null} Angle in degrees or null if calculation fails
 */
export const calculateAngle = (kp1, kp2, kp3) => {
  if (!kp1 || !kp2 || !kp3) {
    return null;
  }

  // Check if all keypoints have valid coordinates
  if (
    kp1.x === undefined ||
    kp1.y === undefined ||
    kp2.x === undefined ||
    kp2.y === undefined ||
    kp3.x === undefined ||
    kp3.y === undefined
  ) {
    return null;
  }

  // Calculate vectors
  const v1 = { x: kp1.x - kp2.x, y: kp1.y - kp2.y };
  const v2 = { x: kp3.x - kp2.x, y: kp3.y - kp2.y };

  // Calculate dot product
  const dotProduct = v1.x * v2.x + v1.y * v2.y;

  // Calculate magnitudes
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  // Avoid division by zero
  if (mag1 === 0 || mag2 === 0) {
    return null;
  }

  // Calculate angle in radians, then convert to degrees
  const cosAngle = dotProduct / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle))); // Clamp to avoid NaN
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.round(angleDeg * 100) / 100; // Round to 2 decimal places
};

/**
 * Calculate knee angle from keypoints
 * @param {Object} frame - Pose frame with keypoints
 * @param {string} side - 'left' or 'right'
 * @returns {number|null} Knee angle in degrees
 */
export const calculateKneeAngle = (frame, side = 'left') => {
  const hip = getKeypointByName(frame, `${side}_hip`);
  const knee = getKeypointByName(frame, `${side}_knee`);
  const ankle = getKeypointByName(frame, `${side}_ankle`);

  if (!hip || !knee || !ankle) {
    return null;
  }

  return calculateAngle(hip, knee, ankle);
};

/**
 * Calculate hip angle from keypoints
 * @param {Object} frame - Pose frame with keypoints
 * @param {string} side - 'left' or 'right'
 * @returns {number|null} Hip angle in degrees
 */
export const calculateHipAngle = (frame, side = 'left') => {
  const shoulder = getKeypointByName(frame, `${side}_shoulder`);
  const hip = getKeypointByName(frame, `${side}_hip`);
  const knee = getKeypointByName(frame, `${side}_knee`);

  if (!shoulder || !hip || !knee) {
    return null;
  }

  return calculateAngle(shoulder, hip, knee);
};

/**
 * Calculate back angle from keypoints
 * @param {Object} frame - Pose frame with keypoints
 * @returns {number|null} Back angle in degrees (positive = forward lean, negative = backward)
 */
export const calculateBackAngle = (frame) => {
  const leftShoulder = getKeypointByName(frame, 'left_shoulder');
  const rightShoulder = getKeypointByName(frame, 'right_shoulder');
  const leftHip = getKeypointByName(frame, 'left_hip');
  const rightHip = getKeypointByName(frame, 'right_hip');

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return null;
  }

  // Calculate midpoint of shoulders and hips
  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipMid = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  // Calculate vertical reference point (above shoulder)
  const verticalRef = {
    x: shoulderMid.x,
    y: shoulderMid.y - 0.1, // Small offset above shoulder
  };

  // Calculate angle between vertical and back line
  const angle = calculateAngle(verticalRef, shoulderMid, hipMid);
  if (angle === null) {
    return null;
  }

  // Adjust angle: 90 degrees = straight, >90 = forward lean, <90 = backward lean
  const backAngle = angle - 90;
  return Math.round(backAngle * 100) / 100;
};

/**
 * Calculate all angles for a frame
 * @param {Object} frame - Pose frame with keypoints
 * @returns {Object} Object with angle types as keys and angles as values
 */
export const calculateAllAngles = (frame) => {
  const angles = {};

  // Calculate knee angles
  const leftKnee = calculateKneeAngle(frame, 'left');
  const rightKnee = calculateKneeAngle(frame, 'right');
  if (leftKnee !== null || rightKnee !== null) {
    angles.kneeAngle = leftKnee !== null && rightKnee !== null ? (leftKnee + rightKnee) / 2 : leftKnee || rightKnee;
  }

  // Calculate hip angles
  const leftHip = calculateHipAngle(frame, 'left');
  const rightHip = calculateHipAngle(frame, 'right');
  if (leftHip !== null || rightHip !== null) {
    angles.hipAngle = leftHip !== null && rightHip !== null ? (leftHip + rightHip) / 2 : leftHip || rightHip;
  }

  // Calculate back angle
  const backAngle = calculateBackAngle(frame);
  if (backAngle !== null) {
    angles.backAngle = backAngle;
  }

  // Calculate shoulder angle (if needed)
  const leftShoulder = getKeypointByName(frame, 'left_shoulder');
  const rightShoulder = getKeypointByName(frame, 'right_shoulder');
  const leftElbow = getKeypointByName(frame, 'left_elbow');
  const rightElbow = getKeypointByName(frame, 'right_elbow');
  if (leftShoulder && leftElbow) {
    const leftWrist = getKeypointByName(frame, 'left_wrist');
    if (leftWrist) {
      const leftShoulderAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      if (leftShoulderAngle !== null) {
        angles.shoulderAngle = leftShoulderAngle;
      }
    }
  }

  // Calculate ankle angle (if needed)
  const leftAnkle = getKeypointByName(frame, 'left_ankle');
  const rightAnkle = getKeypointByName(frame, 'right_ankle');
  if (leftAnkle && rightAnkle) {
    const leftKnee = getKeypointByName(frame, 'left_knee');
    const rightKnee = getKeypointByName(frame, 'right_knee');
    if (leftKnee && rightKnee) {
      const leftAnkleAngle = calculateAngle(leftKnee, leftAnkle, { x: leftAnkle.x, y: leftAnkle.y + 0.1 });
      if (leftAnkleAngle !== null) {
        angles.ankleAngle = leftAnkleAngle;
      }
    }
  }

  return angles;
};

// ============================================
// DISTANCE CALCULATIONS
// ============================================

/**
 * Calculate distances between key body parts
 * @param {Object} frame - Pose frame with keypoints
 * @returns {Object} Object with distance types as keys and distances as values
 */
export const calculateDistances = (frame) => {
  const distances = {};

  // Calculate knee width
  const leftKnee = getKeypointByName(frame, 'left_knee');
  const rightKnee = getKeypointByName(frame, 'right_knee');
  if (leftKnee && rightKnee) {
    distances.kneeWidth = calculateKeypointDistance(leftKnee, rightKnee);
  }

  // Calculate foot width
  const leftAnkle = getKeypointByName(frame, 'left_ankle');
  const rightAnkle = getKeypointByName(frame, 'right_ankle');
  if (leftAnkle && rightAnkle) {
    distances.footWidth = calculateKeypointDistance(leftAnkle, rightAnkle);
  }

  // Calculate shoulder width
  const leftShoulder = getKeypointByName(frame, 'left_shoulder');
  const rightShoulder = getKeypointByName(frame, 'right_shoulder');
  if (leftShoulder && rightShoulder) {
    distances.shoulderWidth = calculateKeypointDistance(leftShoulder, rightShoulder);
  }

  // Calculate hip width
  const leftHip = getKeypointByName(frame, 'left_hip');
  const rightHip = getKeypointByName(frame, 'right_hip');
  if (leftHip && rightHip) {
    distances.hipWidth = calculateKeypointDistance(leftHip, rightHip);
  }

  return distances;
};

// ============================================
// QUALITY ASSESSMENT
// ============================================

/**
 * Calculate pose quality for a frame
 * @param {Object} frame - Pose frame with keypoints
 * @param {number} minConfidence - Minimum confidence threshold
 * @returns {Object} Quality metrics
 */
export const assessPoseQuality = (frame, minConfidence = KEYPOINT_CONFIDENCE_THRESHOLD) => {
  if (!frame || !frame.keypoints || !Array.isArray(frame.keypoints)) {
    return {
      averageConfidence: 0,
      quality: 'poor',
      score: 0,
      meetsThreshold: false,
    };
  }

  const qualityResult = checkPoseQuality(frame.keypoints, minConfidence);
  return {
    ...qualityResult.metrics,
    meetsThreshold: qualityResult.meetsThreshold,
  };
};

/**
 * Calculate average pose quality across all frames
 * @param {Array} frames - Array of pose frames
 * @param {number} minConfidence - Minimum confidence threshold
 * @returns {Object} Average quality metrics
 */
export const calculateAveragePoseQuality = (frames, minConfidence = KEYPOINT_CONFIDENCE_THRESHOLD) => {
  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      averageConfidence: 0,
      quality: 'poor',
      score: 0,
      frameCount: 0,
    };
  }

  const qualityResults = frames.map((frame) => assessPoseQuality(frame, minConfidence));
  const totalConfidence = qualityResults.reduce((sum, q) => sum + q.averageConfidence, 0);
  const averageConfidence = totalConfidence / frames.length;

  // Determine overall quality
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
    averageConfidence: Math.round(averageConfidence * 1000) / 1000,
    quality,
    score,
    frameCount: frames.length,
  };
};

// ============================================
// POSE DATA PROCESSING
// ============================================

/**
 * Process and enrich pose data with calculated angles and distances
 * @param {Object} poseData - Pose data object
 * @param {Object} options - Processing options
 * @param {boolean} options.calculateAngles - Calculate angles for frames (default: true)
 * @param {boolean} options.calculateDistances - Calculate distances for frames (default: true)
 * @param {boolean} options.assessQuality - Assess quality for frames (default: true)
 * @returns {Object} Enriched pose data
 */
export const processPoseData = (poseData, options = {}) => {
  const {
    calculateAngles: shouldCalculateAngles = true,
    calculateDistances: shouldCalculateDistances = true,
    assessQuality: shouldAssessQuality = true,
  } = options;

  if (!poseData || !poseData.keypoints || !Array.isArray(poseData.keypoints)) {
    return poseData;
  }

  const processedFrames = poseData.keypoints.map((frame) => {
    const processedFrame = { ...frame };

    // Calculate angles if not present or if forced
    if (shouldCalculateAngles && (!frame.angles || Object.keys(frame.angles).length === 0)) {
      processedFrame.angles = calculateAllAngles(frame);
    }

    // Calculate distances if needed
    if (shouldCalculateDistances) {
      processedFrame.distances = calculateDistances(frame);
    }

    // Assess quality if needed
    if (shouldAssessQuality) {
      processedFrame.quality = assessPoseQuality(frame);
    }

    return processedFrame;
  });

  return {
    ...poseData,
    keypoints: processedFrames,
  };
};

// ============================================
// STATISTICS AND ANALYTICS
// ============================================

/**
 * Get pose statistics for a session
 * @param {string} sessionId - Session ID
 * @param {Object} options - Options
 * @param {boolean} options.usePoseDataModel - Use PoseData model instead of embedded data
 * @returns {Promise<Object>} Pose statistics
 */
export const getPoseStatistics = async (sessionId, options = {}) => {
  const { usePoseDataModel = false } = options;

  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    if (usePoseDataModel) {
      // Use PoseData model
      const stats = await PoseData.getSessionStats(sessionId);
      return stats;
    } else {
      // Use embedded pose data from ExerciseSession
      const session = await ExerciseSession.findById(sessionId).lean();
      if (!session) {
        throw new AppError('Session not found', HTTP_STATUS.NOT_FOUND);
      }

      if (!session.poseData || !session.poseData.keypoints || session.poseData.keypoints.length === 0) {
        return {
          totalFrames: 0,
          keyFrames: 0,
          avgQuality: 0,
          avgConfidence: 0,
          minTimestamp: 0,
          maxTimestamp: 0,
          duration: 0,
        };
      }

      const frames = session.poseData.keypoints;
      const totalFrames = frames.length;
      const timestamps = frames.map((f) => f.timestamp).filter((t) => t !== undefined);
      const minTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : 0;
      const maxTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;
      const duration = maxTimestamp - minTimestamp;

      // Calculate average quality
      const qualityResults = frames.map((frame) => assessPoseQuality(frame));
      const avgQuality =
        qualityResults.length > 0
          ? qualityResults.reduce((sum, q) => sum + q.averageConfidence, 0) / qualityResults.length
          : 0;

      // Calculate average confidence
      let totalConfidence = 0;
      let confidenceCount = 0;
      frames.forEach((frame) => {
        if (frame.keypoints && Array.isArray(frame.keypoints)) {
          frame.keypoints.forEach((kp) => {
            if (kp.confidence !== undefined) {
              totalConfidence += kp.confidence;
              confidenceCount++;
            }
          });
        }
      });
      const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

      return {
        totalFrames,
        keyFrames: 0, // Not tracked in embedded data
        avgQuality: Math.round(avgQuality * 1000) / 1000,
        avgConfidence: Math.round(avgConfidence * 1000) / 1000,
        minTimestamp,
        maxTimestamp,
        duration,
      };
    }
  } catch (error) {
    logError('Error getting pose statistics', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to get pose statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get average angles for a session
 * @param {string} sessionId - Session ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Average angles
 */
export const getAverageAngles = async (sessionId, options = {}) => {
  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const session = await ExerciseSession.findById(sessionId).lean();
    if (!session) {
      throw new AppError('Session not found', HTTP_STATUS.NOT_FOUND);
    }

    if (!session.poseData || !session.poseData.keypoints || session.poseData.keypoints.length === 0) {
      return {};
    }

    const frames = session.poseData.keypoints;
    const angleTypes = ['kneeAngle', 'hipAngle', 'backAngle', 'shoulderAngle', 'ankleAngle'];
    const averageAngles = {};

    angleTypes.forEach((angleType) => {
      const angles = frames
        .map((frame) => {
          // Calculate angles if not present
          if (!frame.angles || !frame.angles[angleType]) {
            const calculatedAngles = calculateAllAngles(frame);
            return calculatedAngles[angleType];
          }
          return frame.angles[angleType];
        })
        .filter((angle) => angle !== null && angle !== undefined);

      if (angles.length > 0) {
        const sum = angles.reduce((acc, angle) => acc + angle, 0);
        averageAngles[angleType] = Math.round((sum / angles.length) * 100) / 100;
      }
    });

    return averageAngles;
  } catch (error) {
    logError('Error getting average angles', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to get average angles', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

// ============================================
// POSE DATA MODEL OPERATIONS
// ============================================

/**
 * Get pose frames for a session using PoseData model
 * @param {string} sessionId - Session ID
 * @param {Object} options - Query options
 * @param {boolean} options.keyFramesOnly - Only return key frames
 * @param {number} options.minQuality - Minimum quality threshold
 * @param {number} options.startTime - Start timestamp
 * @param {number} options.endTime - End timestamp
 * @param {Object} options.sort - Sort object
 * @param {number} options.limit - Limit number of results
 * @returns {Promise<Array>} Array of pose frames
 */
export const getPoseFrames = async (sessionId, options = {}) => {
  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const frames = await PoseData.findBySession(sessionId, options).lean();
    return frames;
  } catch (error) {
    logError('Error getting pose frames', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to get pose frames', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Create a pose frame using PoseData model
 * @param {string} sessionId - Session ID
 * @param {Object} frameData - Frame data
 * @returns {Promise<Object>} Created pose frame
 */
export const createPoseFrame = async (sessionId, frameData) => {
  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

  // Validate frame data
  const frameValidation = validatePoseFrameData(frameData);
  if (!frameValidation.valid) {
    throw new AppError(`Invalid frame data: ${frameValidation.errors.join(', ')}`, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    // Calculate angles if not provided
    if (!frameData.angles || Object.keys(frameData.angles).length === 0) {
      frameData.angles = calculateAllAngles(frameData);
    }

    // Calculate distances if not provided
    if (!frameData.distances) {
      frameData.distances = calculateDistances(frameData);
    }

    // Assess quality
    const qualityResult = assessPoseQuality(frameData);
    frameData.quality = qualityResult.averageConfidence;

    const poseFrame = await PoseData.create({
      sessionId,
      frameNumber: frameData.frame,
      timestamp: frameData.timestamp,
      keypoints: frameData.keypoints,
      angles: frameData.angles,
      distances: frameData.distances,
      quality: frameData.quality,
    });

    logInfo('Pose frame created', {
      sessionId,
      frameNumber: poseFrame.frameNumber,
      timestamp: poseFrame.timestamp,
    });

    return poseFrame;
  } catch (error) {
    logError('Error creating pose frame', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to create pose frame', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Create multiple pose frames in batch
 * @param {string} sessionId - Session ID
 * @param {Array} framesData - Array of frame data
 * @returns {Promise<Array>} Array of created pose frames
 */
export const createPoseFramesBatch = async (sessionId, framesData) => {
  // Validate sessionId
  const idValidation = validateObjectId(sessionId);
  if (!idValidation.valid) {
    throw new AppError(idValidation.error, HTTP_STATUS.BAD_REQUEST);
  }

  if (!Array.isArray(framesData) || framesData.length === 0) {
    throw new AppError('Frames data must be a non-empty array', HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const poseFrames = await Promise.all(
      framesData.map((frameData) => createPoseFrame(sessionId, frameData))
    );

    logInfo('Pose frames created in batch', {
      sessionId,
      count: poseFrames.length,
    });

    return poseFrames;
  } catch (error) {
    logError('Error creating pose frames batch', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to create pose frames batch', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Validation
  validatePoseDataStructure,
  validatePoseFrameData,
  validateKeypointsData,

  // Keypoint utilities
  getKeypointByName,
  getKeypointsByNames,
  calculateKeypointDistance,
  calculateAngle,

  // Angle calculations
  calculateKneeAngle,
  calculateHipAngle,
  calculateBackAngle,
  calculateAllAngles,

  // Distance calculations
  calculateDistances,

  // Quality assessment
  assessPoseQuality,
  calculateAveragePoseQuality,

  // Processing
  processPoseData,

  // Statistics
  getPoseStatistics,
  getAverageAngles,

  // PoseData model operations
  getPoseFrames,
  createPoseFrame,
  createPoseFramesBatch,
};
