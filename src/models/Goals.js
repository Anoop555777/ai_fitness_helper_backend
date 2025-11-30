import mongoose from 'mongoose';

/**
 * Goals Schema
 * Stores user's fitness goals for tracking progress
 */
const goalsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true, // One set of goals per user
      index: true,
    },
    weeklySessions: {
      type: Number,
      required: [true, 'Weekly sessions goal is required'],
      min: [0, 'Weekly sessions cannot be negative'],
      max: [50, 'Weekly sessions cannot exceed 50'],
    },
    monthlySessions: {
      type: Number,
      required: [true, 'Monthly sessions goal is required'],
      min: [0, 'Monthly sessions cannot be negative'],
      max: [200, 'Monthly sessions cannot exceed 200'],
    },
    targetScore: {
      type: Number,
      required: [true, 'Target score is required'],
      min: [0, 'Target score cannot be negative'],
      max: [100, 'Target score cannot exceed 100'],
    },
    improvementRate: {
      type: Number,
      required: [true, 'Improvement rate is required'],
      min: [0, 'Improvement rate cannot be negative'],
      max: [100, 'Improvement rate cannot exceed 100'],
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Compound index for efficient queries
goalsSchema.index({ userId: 1 });

/**
 * Static method to find goals by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Goals document or null
 */
goalsSchema.statics.findByUser = async function (userId) {
  return this.findOne({ userId });
};

/**
 * Instance method to check if monthly goal is valid (should be at least 4x weekly)
 * @returns {boolean} True if valid
 */
goalsSchema.methods.isValidMonthlyGoal = function () {
  return this.monthlySessions >= this.weeklySessions * 4;
};

const Goals = mongoose.model('Goals', goalsSchema);

export default Goals;

