import mongoose from "mongoose";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORIES_ARRAY,
  EXERCISE_DIFFICULTY,
  EXERCISE_DIFFICULTY_ARRAY,
  EXERCISE_EQUIPMENT,
  EXERCISE_EQUIPMENT_ARRAY,
  EXERCISE_NAME,
  EXERCISE_DESCRIPTION,
  ANGLES,
} from "../config/constants.js";

// Nested schema for form checkpoints
const formCheckpointSchema = new mongoose.Schema(
  {
    time: { type: Number, min: 0, required: true },
    position: { type: String, trim: true },
    keyAngles: {
      type: mongoose.Schema.Types.Mixed, // Allows flexible object structure
    },
    description: { type: String, trim: true },
  },
  { _id: false }
);

// Nested schema for common mistakes
const commonMistakeSchema = new mongoose.Schema(
  {
    mistake: { type: String, trim: true, required: true },
    visualCue: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { _id: false }
);

// Nested schema for demonstration
const demonstrationSchema = new mongoose.Schema(
  {
    videoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow empty string or valid URL (YouTube, Vimeo, or direct video URL)
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "Video URL must be a valid HTTP/HTTPS URL",
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
        message: "Thumbnail URL must be a valid HTTP/HTTPS URL",
      },
    },
    gifUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow empty string or valid URL
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "GIF URL must be a valid HTTP/HTTPS URL",
      },
    },
    duration: {
      type: Number,
      min: 0,
      validate: {
        validator: function (v) {
          // Allow undefined or positive number
          return v === undefined || v >= 0;
        },
        message: "Duration must be a positive number",
      },
    },
    formCheckpoints: {
      type: [formCheckpointSchema],
      default: [],
    },
    commonMistakes: {
      type: [commonMistakeSchema],
      default: [],
    },
  },
  { _id: false }
);

const exerciseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Exercise name is required"],
      trim: true,
      maxlength: [
        EXERCISE_NAME.MAX_LENGTH,
        `Exercise name cannot exceed ${EXERCISE_NAME.MAX_LENGTH} characters`,
      ],
      index: true, // Index for faster queries
    },
    category: {
      type: String,
      required: [true, "Exercise category is required"],
      enum: {
        values: EXERCISE_CATEGORIES_ARRAY,
        message: `Category must be one of: ${EXERCISE_CATEGORIES_ARRAY.join(
          ", "
        )}`,
      },
      index: true, // Index for filtering by category
    },
    description: {
      type: String,
      trim: true,
      maxlength: [
        EXERCISE_DESCRIPTION.MAX_LENGTH,
        `Description cannot exceed ${EXERCISE_DESCRIPTION.MAX_LENGTH} characters`,
      ],
    },
    targetMuscles: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "At least one target muscle is required",
      },
    },
    formRules: {
      type: {
        kneeAngle: {
          min: { type: Number, min: ANGLES.KNEE.MIN, max: ANGLES.KNEE.MAX },
          max: { type: Number, min: ANGLES.KNEE.MIN, max: ANGLES.KNEE.MAX },
        },
        backAngle: {
          min: { type: Number, min: ANGLES.BACK.MIN, max: ANGLES.BACK.MAX },
          max: { type: Number, min: ANGLES.BACK.MIN, max: ANGLES.BACK.MAX },
        },
        hipAngle: {
          min: { type: Number, min: ANGLES.HIP.MIN, max: ANGLES.HIP.MAX },
          max: { type: Number, min: ANGLES.HIP.MIN, max: ANGLES.HIP.MAX },
        },
        shoulderAngle: {
          min: {
            type: Number,
            min: ANGLES.SHOULDER.MIN,
            max: ANGLES.SHOULDER.MAX,
          },
          max: {
            type: Number,
            min: ANGLES.SHOULDER.MIN,
            max: ANGLES.SHOULDER.MAX,
          },
        },
      },
      default: {},
    },
    instructions: {
      type: [String],
      default: [],
    },
    difficulty: {
      type: String,
      enum: {
        values: EXERCISE_DIFFICULTY_ARRAY,
        message: `Difficulty must be one of: ${EXERCISE_DIFFICULTY_ARRAY.join(
          ", "
        )}`,
      },
      default: EXERCISE_DIFFICULTY.BEGINNER,
    },
    equipment: {
      type: [String],
      default: [],
      enum: {
        values: EXERCISE_EQUIPMENT_ARRAY,
        message: `Equipment must be one of: ${EXERCISE_EQUIPMENT_ARRAY.join(
          ", "
        )}`,
      },
    },
    imageUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Allow empty string or valid URL
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "Image URL must be a valid HTTP/HTTPS URL",
      },
    },
    // Demonstration media fields
    demonstration: {
      type: demonstrationSchema,
      default: {},
    },
    // Legacy support: allow videoUrl, thumbnailUrl, gifUrl at root level
    videoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "Video URL must be a valid HTTP/HTTPS URL",
      },
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "Thumbnail URL must be a valid HTTP/HTTPS URL",
      },
    },
    gifUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "GIF URL must be a valid HTTP/HTTPS URL",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true, // Index for filtering active exercises
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true }, // Include virtuals in JSON output
    toObject: { virtuals: true }, // Include virtuals in object output
  }
);

// Compound index for common queries (category + isActive)
exerciseSchema.index({ category: 1, isActive: 1 });

// Index for name search (case-insensitive)
exerciseSchema.index({ name: "text", description: "text" });

// Virtual for exercise summary
exerciseSchema.virtual("summary").get(function () {
  return `${this.name} (${this.category}) - ${this.difficulty}`;
});

// Instance method to check if exercise is suitable for user level
exerciseSchema.methods.isSuitableForLevel = function (userLevel) {
  const levelOrder = {
    [EXERCISE_DIFFICULTY.BEGINNER]: 0,
    [EXERCISE_DIFFICULTY.INTERMEDIATE]: 1,
    [EXERCISE_DIFFICULTY.ADVANCED]: 2,
  };
  return levelOrder[this.difficulty] <= (levelOrder[userLevel] || 0);
};

// Static method to find exercises by category
exerciseSchema.statics.findByCategory = function (category) {
  return this.find({ category, isActive: true });
};

// Static method to find exercises by difficulty
exerciseSchema.statics.findByDifficulty = function (difficulty) {
  return this.find({ difficulty, isActive: true });
};

// Pre-save middleware to validate formRules
exerciseSchema.pre("save", function (next) {
  // Validate that min <= max for all angle rules
  if (this.formRules) {
    const rules = this.formRules;
    const angleTypes = ["kneeAngle", "backAngle", "hipAngle", "shoulderAngle"];

    for (const angleType of angleTypes) {
      if (rules[angleType]) {
        const { min, max } = rules[angleType];
        if (min !== undefined && max !== undefined && min > max) {
          return next(
            new Error(
              `${angleType}: min value cannot be greater than max value`
            )
          );
        }
      }
    }
  }
  next();
});

// Create and export the model
const Exercise = mongoose.model("Exercise", exerciseSchema);

export default Exercise;
