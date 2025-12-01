import mongoose from 'mongoose';

// Sub-schema for keypoint data (nested in poseData)
const keypointSchema = new mongoose.Schema(
  {
    frame: {
      type: Number,
      required: true,
      min: [0, 'Frame number cannot be negative'],
    },
    timestamp: {
      type: Number,
      required: true,
      min: [0, 'Timestamp cannot be negative'],
    },
    keypoints: {
      type: [
        {
          name: String, // e.g., 'nose', 'left_shoulder', 'right_knee'
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          confidence: { type: Number, min: 0, max: 1 },
        },
      ],
      default: [],
    },
    angles: {
      type: {
        kneeAngle: Number,
        hipAngle: Number,
        backAngle: Number,
        shoulderAngle: Number,
        ankleAngle: Number,
      },
      default: {},
    },
  },
  { _id: false } // Disable _id for subdocuments to save space
);

const exerciseSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      // Index removed - using compound indexes below instead
    },
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise',
      required: [true, 'Exercise ID is required'],
      index: true, // Index for exercise queries
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [0, 'Duration cannot be negative'],
      max: [1800, 'Duration cannot exceed 1800 seconds (half hour)'],
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true, // Index for date-based queries
    },
    poseData: {
      keypoints: {
        type: [keypointSchema],
        default: [],
        validate: {
          validator: function (v) {
            // Validate that keypoints array is not empty if poseData exists
            return v.length > 0;
          },
          message: 'At least one keypoint frame is required',
        },
      },
      totalFrames: {
        type: Number,
        default: 0,
        min: [0, 'Total frames cannot be negative'],
      },
      fps: {
        type: Number,
        default: 30,
        min: [1, 'FPS must be at least 1'],
        max: [120, 'FPS cannot exceed 120'],
      },
    },
    overallScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [100, 'Score cannot exceed 100'],
      default: 0,
    },
    videoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow empty string or valid URL
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Video URL must be a valid HTTP/HTTPS URL',
      },
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow empty string or valid URL
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Thumbnail URL must be a valid HTTP/HTTPS URL',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true, // Index for public session queries
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 10; // Limit to 10 tags
        },
        message: 'Cannot have more than 10 tags',
      },
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true }, // Include virtuals in JSON output
    toObject: { virtuals: true }, // Include virtuals in object output
  }
);

// Compound indexes for common queries
exerciseSessionSchema.index({ userId: 1, createdAt: -1 }); // User's sessions sorted by date
exerciseSessionSchema.index({ userId: 1, recordedAt: -1 }); // User's sessions sorted by recorded date (for recent exercises)
exerciseSessionSchema.index({ exerciseId: 1, createdAt: -1 }); // Exercise sessions sorted by date
exerciseSessionSchema.index({ userId: 1, exerciseId: 1, createdAt: -1 }); // User's sessions for specific exercise
exerciseSessionSchema.index({ overallScore: -1, createdAt: -1 }); // Top scores

// Virtual for session duration in minutes
exerciseSessionSchema.virtual('durationMinutes').get(function () {
  return Math.round((this.duration / 60) * 100) / 100; // Round to 2 decimal places
});

// Virtual for session quality rating (based on score)
exerciseSessionSchema.virtual('qualityRating').get(function () {
  if (this.overallScore >= 90) return 'excellent';
  if (this.overallScore >= 75) return 'good';
  if (this.overallScore >= 60) return 'fair';
  if (this.overallScore >= 40) return 'needs-improvement';
  return 'poor';
});

// Instance method to calculate average angle for a specific joint
exerciseSessionSchema.methods.getAverageAngle = function (angleType) {
  if (!this.poseData?.keypoints?.length) return null;

  const angles = this.poseData.keypoints
    .map((kp) => kp.angles?.[angleType])
    .filter((angle) => angle !== undefined && angle !== null);

  if (angles.length === 0) return null;

  const sum = angles.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / angles.length) * 100) / 100;
};

// Instance method to get session statistics
exerciseSessionSchema.methods.getStats = async function () {
  // Get feedback stats from Feedback collection if needed
  const Feedback = mongoose.model('Feedback');
  const feedbackStats = await Feedback.getSessionStats(this._id);
  
  return {
    duration: this.duration,
    durationMinutes: this.durationMinutes,
    totalFrames: this.poseData?.totalFrames || 0,
    overallScore: this.overallScore,
    qualityRating: this.qualityRating,
    feedbackCount: feedbackStats.total || 0,
    hasVideo: !!this.videoUrl,
  };
};

// Static method to find user's sessions
exerciseSessionSchema.statics.findByUser = function (userId, options = {}) {
  const query = this.find({ userId });
  
  if (options.exerciseId) {
    query.where('exerciseId').equals(options.exerciseId);
  }
  
  if (options.limit) {
    query.limit(options.limit);
  }
  
  if (options.sort) {
    query.sort(options.sort);
  } else {
    // Default: sort by recordedAt (when exercise was performed) first, then by createdAt
    query.sort({ recordedAt: -1, createdAt: -1 });
  }
  
  return query;
};

// Static method to find top sessions by score
exerciseSessionSchema.statics.findTopSessions = function (limit = 10, exerciseId = null) {
  const query = this.find({ overallScore: { $gte: 0 } });
  
  if (exerciseId) {
    query.where('exerciseId').equals(exerciseId);
  }
  
  return query.sort({ overallScore: -1, createdAt: -1 }).limit(limit);
};

// Pre-save middleware to calculate totalFrames if not provided
exerciseSessionSchema.pre('save', function (next) {
  // Calculate totalFrames from keypoints array if not set
  if (this.poseData?.keypoints?.length > 0 && !this.poseData.totalFrames) {
    this.poseData.totalFrames = this.poseData.keypoints.length;
  }
  
  // Ensure recordedAt is set if not provided
  if (!this.recordedAt) {
    this.recordedAt = new Date();
  }
  
  next();
});

// Pre-save middleware to validate poseData structure
exerciseSessionSchema.pre('save', function (next) {
  if (this.poseData?.keypoints) {
    // Validate each keypoint frame
    for (const frame of this.poseData.keypoints) {
      if (frame.keypoints && frame.keypoints.length > 0) {
        // Validate keypoint structure
        for (const kp of frame.keypoints) {
          if (kp.x === undefined || kp.y === undefined) {
            return next(new Error('Keypoints must have x and y coordinates'));
          }
          if (kp.confidence !== undefined && (kp.confidence < 0 || kp.confidence > 1)) {
            return next(new Error('Keypoint confidence must be between 0 and 1'));
          }
        }
      }
    }
  }
  next();
});

// Create and export the model
const ExerciseSession = mongoose.model('ExerciseSession', exerciseSessionSchema);

export default ExerciseSession;
