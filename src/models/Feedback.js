import mongoose from 'mongoose';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPES_ARRAY,
  FEEDBACK_SEVERITY,
  FEEDBACK_SEVERITY_ARRAY,
  FEEDBACK_MESSAGE,
  FEEDBACK_SUGGESTION,
  FEEDBACK_KEYPOINTS_LIMIT,
  FEEDBACK_PRIORITY,
} from '../config/constants.js';

const feedbackSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExerciseSession',
      required: [true, 'Session ID is required'],
      index: true, // Index for session queries
    },
    type: {
      type: String,
      required: [true, 'Feedback type is required'],
      enum: {
        values: FEEDBACK_TYPES_ARRAY,
        message: `Type must be one of: ${FEEDBACK_TYPES_ARRAY.join(', ')}`,
      },
      index: true, // Index for filtering by type
    },
    severity: {
      type: String,
      enum: {
        values: FEEDBACK_SEVERITY_ARRAY,
        message: `Severity must be one of: ${FEEDBACK_SEVERITY_ARRAY.join(', ')}`,
      },
      default: FEEDBACK_SEVERITY.INFO,
      index: true, // Index for filtering by severity
    },
    message: {
      type: String,
      required: [true, 'Feedback message is required'],
      trim: true,
      maxlength: [FEEDBACK_MESSAGE.MAX_LENGTH, `Message cannot exceed ${FEEDBACK_MESSAGE.MAX_LENGTH} characters`],
    },
    suggestion: {
      type: String,
      trim: true,
      maxlength: [FEEDBACK_SUGGESTION.MAX_LENGTH, `Suggestion cannot exceed ${FEEDBACK_SUGGESTION.MAX_LENGTH} characters`],
    },
    timestamp: {
      type: Number,
      min: [0, 'Timestamp cannot be negative'],
      default: 0, // 0 means feedback applies to entire session
    },
    keypoints: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= FEEDBACK_KEYPOINTS_LIMIT;
        },
        message: `Cannot reference more than ${FEEDBACK_KEYPOINTS_LIMIT} keypoints`,
      },
    },
    aiGenerated: {
      type: Boolean,
      default: false,
      index: true, // Index for filtering AI vs rule-based feedback
    },
    confidence: {
      type: Number,
      min: [0, 'Confidence cannot be negative'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 0.8, // Default confidence for rule-based feedback
    },
    metadata: {
      type: {
        angleValue: Number, // The actual angle that triggered this feedback
        threshold: Number, // The threshold that was exceeded
        frameNumber: Number, // Frame number in the video
        ruleId: String, // ID of the rule that generated this feedback
      },
      default: {},
    },
    isResolved: {
      type: Boolean,
      default: false,
      index: true, // Index for filtering resolved/unresolved feedback
    },
    resolvedAt: {
      type: Date,
    },
    userNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'User notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true }, // Include virtuals in JSON output
    toObject: { virtuals: true }, // Include virtuals in object output
  }
);

// Compound indexes for common queries
feedbackSchema.index({ sessionId: 1, createdAt: -1 }); // Session feedback sorted by date
feedbackSchema.index({ sessionId: 1, type: 1 }); // Session feedback by type
feedbackSchema.index({ sessionId: 1, severity: 1, createdAt: -1 }); // Session feedback by severity
feedbackSchema.index({ aiGenerated: 1, createdAt: -1 }); // AI feedback tracking

// Virtual for feedback priority (higher priority = more important)
feedbackSchema.virtual('priority').get(function () {
  const severityPriority = FEEDBACK_PRIORITY.SEVERITY;
  const typePriority = FEEDBACK_PRIORITY.TYPE;
  
  return (severityPriority[this.severity] || 1) + (typePriority[this.type] || 1);
});

// Virtual for feedback category (grouped by type and severity)
feedbackSchema.virtual('category').get(function () {
  if (this.type === FEEDBACK_TYPES.FORM_ERROR && this.severity === FEEDBACK_SEVERITY.ERROR) return 'critical';
  if (this.type === FEEDBACK_TYPES.FORM_ERROR && this.severity === FEEDBACK_SEVERITY.WARNING) return 'important';
  if (this.type === FEEDBACK_TYPES.IMPROVEMENT) return 'suggestion';
  if (this.type === FEEDBACK_TYPES.ENCOURAGEMENT) return 'positive';
  return 'general';
});

// Instance method to mark feedback as resolved
feedbackSchema.methods.resolve = function (notes = '') {
  this.isResolved = true;
  this.resolvedAt = new Date();
  if (notes) {
    this.userNotes = notes;
  }
  return this.save();
};

// Instance method to check if feedback is actionable
feedbackSchema.methods.isActionable = function () {
  return (
    this.type === FEEDBACK_TYPES.FORM_ERROR &&
    this.severity !== FEEDBACK_SEVERITY.INFO &&
    !this.isResolved
  );
};

// Instance method to get formatted feedback text
feedbackSchema.methods.getFormattedText = function () {
  let text = this.message;
  if (this.suggestion) {
    text += ` ${this.suggestion}`;
  }
  if (this.timestamp > 0) {
    const minutes = Math.floor(this.timestamp / 60);
    const seconds = Math.floor(this.timestamp % 60);
    text += ` (at ${minutes}:${seconds.toString().padStart(2, '0')})`;
  }
  return text;
};

// Static method to find feedback by session
feedbackSchema.statics.findBySession = function (sessionId, options = {}) {
  const query = this.find({ sessionId });
  
  if (options.type) {
    query.where('type').equals(options.type);
  }
  
  if (options.severity) {
    query.where('severity').equals(options.severity);
  }
  
  if (options.unresolvedOnly) {
    query.where('isResolved').equals(false);
  }
  
  if (options.aiGenerated !== undefined) {
    query.where('aiGenerated').equals(options.aiGenerated);
  }
  
  if (options.sort) {
    query.sort(options.sort);
  } else {
    query.sort({ timestamp: 1, priority: -1 }); // Default: by timestamp, then priority
  }
  
  return query;
};

// Static method to find critical feedback (errors)
feedbackSchema.statics.findCritical = function (sessionId) {
  return this.find({
    sessionId,
    type: FEEDBACK_TYPES.FORM_ERROR,
    severity: FEEDBACK_SEVERITY.ERROR,
    isResolved: false,
  }).sort({ timestamp: 1 });
};

// Static method to get feedback statistics for a session
feedbackSchema.statics.getSessionStats = async function (sessionId) {
  const sessionObjectId = typeof sessionId === 'string' 
    ? new mongoose.Types.ObjectId(sessionId) 
    : sessionId;
  
  const stats = await this.aggregate([
    { $match: { sessionId: sessionObjectId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        errors: {
          $sum: { $cond: [{ $eq: ['$severity', FEEDBACK_SEVERITY.ERROR] }, 1, 0] },
        },
        warnings: {
          $sum: { $cond: [{ $eq: ['$severity', FEEDBACK_SEVERITY.WARNING] }, 1, 0] },
        },
        improvements: {
          $sum: { $cond: [{ $eq: ['$type', FEEDBACK_TYPES.IMPROVEMENT] }, 1, 0] },
        },
        encouragements: {
          $sum: { $cond: [{ $eq: ['$type', FEEDBACK_TYPES.ENCOURAGEMENT] }, 1, 0] },
        },
        aiGenerated: {
          $sum: { $cond: ['$aiGenerated', 1, 0] },
        },
        resolved: {
          $sum: { $cond: ['$isResolved', 1, 0] },
        },
      },
    },
  ]);
  
  return stats[0] || {
    total: 0,
    errors: 0,
    warnings: 0,
    improvements: 0,
    encouragements: 0,
    aiGenerated: 0,
    resolved: 0,
  };
};

// Pre-save middleware to set severity based on type if not provided
feedbackSchema.pre('save', function (next) {
  // Auto-set severity based on type if not explicitly set
  if (!this.severity || this.severity === FEEDBACK_SEVERITY.INFO) {
    if (this.type === FEEDBACK_TYPES.FORM_ERROR) {
      this.severity = FEEDBACK_SEVERITY.ERROR;
    } else if (this.type === FEEDBACK_TYPES.IMPROVEMENT) {
      this.severity = FEEDBACK_SEVERITY.WARNING;
    } else if (this.type === FEEDBACK_TYPES.ENCOURAGEMENT) {
      this.severity = FEEDBACK_SEVERITY.SUCCESS;
    }
  }
  
  // Validate that resolvedAt is set when isResolved is true
  if (this.isResolved && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  
  // Clear resolvedAt if isResolved is false
  if (!this.isResolved && this.resolvedAt) {
    this.resolvedAt = undefined;
  }
  
  next();
});

// Note: Feedback summary is now calculated on-demand using getSessionStats()
// No need to maintain embedded summary in ExerciseSession

// Create and export the model
const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
