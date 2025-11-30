import mongoose from 'mongoose';

/**
 * PoseData Model - OPTIONAL / FOR FUTURE USE
 * 
 * This model is for storing individual pose frames as separate documents.
 * Currently, pose data is embedded in ExerciseSession (simpler approach).
 * 
 * Use this model if you need:
 * - Query individual frames across sessions
 * - Very large datasets (1000+ frames per session)
 * - Advanced frame-level analytics
 * 
 * For most use cases, the embedded poseData in ExerciseSession is sufficient.
 */

// Sub-schema for individual keypoint
const keypointSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Keypoint name is required'],
      trim: true,
      lowercase: true,
    },
    x: {
      type: Number,
      required: [true, 'X coordinate is required'],
      min: [0, 'X coordinate cannot be negative'],
    },
    y: {
      type: Number,
      required: [true, 'Y coordinate is required'],
      min: [0, 'Y coordinate cannot be negative'],
    },
    z: {
      type: Number,
      // Optional 3D coordinate
    },
    confidence: {
      type: Number,
      required: [true, 'Confidence is required'],
      min: [0, 'Confidence cannot be negative'],
      max: [1, 'Confidence cannot exceed 1'],
    },
  },
  { _id: false }
);

// Sub-schema for calculated angles
const anglesSchema = new mongoose.Schema(
  {
    kneeAngle: {
      type: Number,
      min: [0, 'Knee angle cannot be negative'],
      max: [180, 'Knee angle cannot exceed 180 degrees'],
    },
    hipAngle: {
      type: Number,
      min: [0, 'Hip angle cannot be negative'],
      max: [180, 'Hip angle cannot exceed 180 degrees'],
    },
    backAngle: {
      type: Number,
      min: [-90, 'Back angle cannot be less than -90 degrees'],
      max: [90, 'Back angle cannot exceed 90 degrees'],
    },
    shoulderAngle: {
      type: Number,
      min: [0, 'Shoulder angle cannot be negative'],
      max: [180, 'Shoulder angle cannot exceed 180 degrees'],
    },
    ankleAngle: {
      type: Number,
      min: [0, 'Ankle angle cannot be negative'],
      max: [180, 'Ankle angle cannot exceed 180 degrees'],
    },
    elbowAngle: {
      type: Number,
      min: [0, 'Elbow angle cannot be negative'],
      max: [180, 'Elbow angle cannot exceed 180 degrees'],
    },
  },
  { _id: false }
);

// Sub-schema for calculated distances
const distancesSchema = new mongoose.Schema(
  {
    kneeWidth: Number, // Distance between knees
    footWidth: Number, // Distance between feet
    shoulderWidth: Number, // Distance between shoulders
    hipWidth: Number, // Distance between hips
  },
  { _id: false }
);

const poseDataSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExerciseSession',
      required: [true, 'Session ID is required'],
      index: true, // Index for session queries
    },
    frameNumber: {
      type: Number,
      required: [true, 'Frame number is required'],
      min: [0, 'Frame number cannot be negative'],
      index: true, // Index for frame queries
    },
    timestamp: {
      type: Number,
      required: [true, 'Timestamp is required'],
      min: [0, 'Timestamp cannot be negative'],
      index: true, // Index for time-based queries
    },
    keypoints: {
      type: [keypointSchema],
      required: [true, 'Keypoints are required'],
      validate: {
        validator: function (v) {
          // Validate that we have at least one keypoint
          return v && v.length > 0;
        },
        message: 'At least one keypoint is required',
      },
    },
    angles: {
      type: anglesSchema,
      default: {},
    },
    distances: {
      type: distancesSchema,
      default: {},
    },
    boundingBox: {
      type: {
        x: { type: Number, min: 0 },
        y: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
      },
      default: {},
    },
    poseModel: {
      type: String,
      enum: {
        values: ['movenet', 'blazepose', 'posenet', 'mediapipe', 'other'],
        message: 'Pose model must be one of: movenet, blazepose, posenet, mediapipe, other',
      },
      default: 'movenet',
    },
    quality: {
      type: Number,
      min: [0, 'Quality cannot be negative'],
      max: [1, 'Quality cannot exceed 1'],
      default: 0.8,
    },
    isKeyFrame: {
      type: Boolean,
      default: false,
      index: true, // Index for key frame queries
    },
    metadata: {
      type: {
        fps: Number,
        resolution: {
          width: Number,
          height: Number,
        },
        processingTime: Number, // Time taken to process this frame (ms)
        detectedPoses: Number, // Number of poses detected (if multiple)
      },
      default: {},
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true }, // Include virtuals in JSON output
    toObject: { virtuals: true }, // Include virtuals in object output
  }
);

// Compound indexes for common queries
poseDataSchema.index({ sessionId: 1, frameNumber: 1 }, { unique: true }); // Unique frame per session
poseDataSchema.index({ sessionId: 1, timestamp: 1 }); // Session frames by time
poseDataSchema.index({ sessionId: 1, isKeyFrame: 1 }); // Key frames for a session
poseDataSchema.index({ sessionId: 1, quality: -1 }); // Best quality frames first

// Virtual for frame time in seconds
poseDataSchema.virtual('timeInSeconds').get(function () {
  return Math.round((this.timestamp / 1000) * 100) / 100; // Round to 2 decimal places
});

// Virtual for frame time formatted (MM:SS)
poseDataSchema.virtual('timeFormatted').get(function () {
  const totalSeconds = Math.floor(this.timestamp / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for number of keypoints
poseDataSchema.virtual('keypointCount').get(function () {
  return this.keypoints?.length || 0;
});

// Virtual for average confidence
poseDataSchema.virtual('averageConfidence').get(function () {
  if (!this.keypoints || this.keypoints.length === 0) return 0;
  const sum = this.keypoints.reduce((acc, kp) => acc + (kp.confidence || 0), 0);
  return Math.round((sum / this.keypoints.length) * 1000) / 1000; // Round to 3 decimal places
});

// Instance method to get specific keypoint by name
poseDataSchema.methods.getKeypoint = function (name) {
  if (!this.keypoints) return null;
  return this.keypoints.find((kp) => kp.name === name.toLowerCase());
};

// Instance method to get angle by type
poseDataSchema.methods.getAngle = function (angleType) {
  if (!this.angles) return null;
  return this.angles[angleType];
};

// Instance method to check if pose quality is good
poseDataSchema.methods.isGoodQuality = function (threshold = 0.7) {
  return this.quality >= threshold && this.averageConfidence >= threshold;
};

// Instance method to get pose center point
poseDataSchema.methods.getCenterPoint = function () {
  if (!this.keypoints || this.keypoints.length === 0) return null;
  
  const sumX = this.keypoints.reduce((acc, kp) => acc + kp.x, 0);
  const sumY = this.keypoints.reduce((acc, kp) => acc + kp.y, 0);
  
  return {
    x: Math.round(sumX / this.keypoints.length),
    y: Math.round(sumY / this.keypoints.length),
  };
};

// Static method to find frames by session
poseDataSchema.statics.findBySession = function (sessionId, options = {}) {
  const query = this.find({ sessionId });
  
  if (options.keyFramesOnly) {
    query.where('isKeyFrame').equals(true);
  }
  
  if (options.minQuality) {
    query.where('quality').gte(options.minQuality);
  }
  
  if (options.startTime !== undefined) {
    query.where('timestamp').gte(options.startTime);
  }
  
  if (options.endTime !== undefined) {
    query.where('timestamp').lte(options.endTime);
  }
  
  if (options.sort) {
    query.sort(options.sort);
  } else {
    query.sort({ timestamp: 1 }); // Default: chronological order
  }
  
  if (options.limit) {
    query.limit(options.limit);
  }
  
  return query;
};

// Static method to find key frames for a session
poseDataSchema.statics.findKeyFrames = function (sessionId) {
  return this.find({ sessionId, isKeyFrame: true }).sort({ timestamp: 1 });
};

// Static method to get frame statistics for a session
poseDataSchema.statics.getSessionStats = async function (sessionId) {
  const stats = await this.aggregate([
    { $match: { sessionId: typeof sessionId === 'string' ? new mongoose.Types.ObjectId(sessionId) : sessionId } },
    {
      $group: {
        _id: null,
        totalFrames: { $sum: 1 },
        keyFrames: {
          $sum: { $cond: ['$isKeyFrame', 1, 0] },
        },
        avgQuality: { $avg: '$quality' },
        avgConfidence: {
          $avg: {
            $avg: '$keypoints.confidence',
          },
        },
        minTimestamp: { $min: '$timestamp' },
        maxTimestamp: { $max: '$timestamp' },
        duration: {
          $subtract: [{ $max: '$timestamp' }, { $min: '$timestamp' }],
        },
      },
    },
  ]);
  
  return stats[0] || {
    totalFrames: 0,
    keyFrames: 0,
    avgQuality: 0,
    avgConfidence: 0,
    minTimestamp: 0,
    maxTimestamp: 0,
    duration: 0,
  };
};

// Static method to get frames by time range
poseDataSchema.statics.findByTimeRange = function (sessionId, startTime, endTime) {
  return this.find({
    sessionId,
    timestamp: { $gte: startTime, $lte: endTime },
  }).sort({ timestamp: 1 });
};

// Pre-save middleware to validate keypoints
poseDataSchema.pre('save', function (next) {
  // Validate that keypoints array is not empty
  if (!this.keypoints || this.keypoints.length === 0) {
    return next(new Error('At least one keypoint is required'));
  }
  
  // Validate keypoint structure
  for (const kp of this.keypoints) {
    if (kp.x === undefined || kp.y === undefined) {
      return next(new Error('All keypoints must have x and y coordinates'));
    }
    if (kp.confidence === undefined || kp.confidence < 0 || kp.confidence > 1) {
      return next(new Error('All keypoints must have valid confidence (0-1)'));
    }
  }
  
  // Calculate bounding box if not provided
  if (!this.boundingBox || Object.keys(this.boundingBox).length === 0) {
    const xs = this.keypoints.map((kp) => kp.x);
    const ys = this.keypoints.map((kp) => kp.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    this.boundingBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  
  // Calculate average confidence as quality if not set
  if (!this.quality || this.quality === 0.8) {
    this.quality = this.averageConfidence;
  }
  
  next();
});

// Create and export the model
const PoseData = mongoose.model('PoseData', poseDataSchema);

export default PoseData;
