import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  USER_ROLES,
  USER_ROLES_ARRAY,
  FITNESS_LEVELS,
  FITNESS_LEVELS_ARRAY,
  USERNAME,
  PASSWORD,
  EMAIL,
  VALIDATION_PATTERNS,
} from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      unique: true,
      minlength: [USERNAME.MIN_LENGTH, `Username must be at least ${USERNAME.MIN_LENGTH} characters`],
      maxlength: [USERNAME.MAX_LENGTH, `Username cannot exceed ${USERNAME.MAX_LENGTH} characters`],
      match: [USERNAME.PATTERN, 'Username can only contain letters, numbers, and underscores'],
      index: true, // Index for faster lookups
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        EMAIL.PATTERN,
        'Please provide a valid email address',
      ],
      index: true, // Index for faster lookups
    },
    password: {
      type: String,
      required: function () {
        // Password required only if not using OAuth
        return !this.googleId && !this.provider;
      },
      minlength: [PASSWORD.MIN_LENGTH, `Password must be at least ${PASSWORD.MIN_LENGTH} characters`],
      validate: {
        validator: function (value) {
          // Skip validation for OAuth users
          if (this.googleId) {
            return true;
          }
          
          // Check for at least one capital letter
          if (!VALIDATION_PATTERNS.PASSWORD.HAS_UPPERCASE.test(value)) {
            return false;
          }
          
          // Check for at least one number
          if (!VALIDATION_PATTERNS.PASSWORD.HAS_NUMBER.test(value)) {
            return false;
          }
          
          // Check for at least one special character
          if (!VALIDATION_PATTERNS.PASSWORD.HAS_SPECIAL.test(value)) {
            return false;
          }
          
          return true;
        },
        message: 'Password must contain at least one capital letter, one number, and one special character',
      },
      select: false, // Don't include password in queries by default
    },
    // Google OAuth fields
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
      index: true,
    },
    provider: {
      type: String,
      enum: {
        values: ['local', 'google', 'google+local'],
        message: 'Provider must be one of: local, google, google+local',
      },
      default: 'local',
      index: true,
    },
    oauth: {
      google: {
        id: String,
        email: String,
        picture: String,
        verified: { type: Boolean, default: false },
        accessToken: { type: String, select: false },
        refreshToken: { type: String, select: false },
        tokenExpiry: Date,
      },
    },
    profile: {
      firstName: {
        type: String,
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters'],
      },
      lastName: {
        type: String,
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters'],
      },
      age: {
        type: Number,
        min: [13, 'Age must be at least 13'],
        max: [120, 'Age cannot exceed 120'],
      },
      height: {
        type: Number, // in cm
        min: [50, 'Height must be at least 50 cm'],
        max: [250, 'Height cannot exceed 250 cm'],
      },
      weight: {
        type: Number, // in kg
        min: [20, 'Weight must be at least 20 kg'],
        max: [300, 'Weight cannot exceed 300 kg'],
      },
      fitnessLevel: {
        type: String,
        enum: {
          values: FITNESS_LEVELS_ARRAY,
          message: `Fitness level must be one of: ${FITNESS_LEVELS_ARRAY.join(', ')}`,
        },
        default: FITNESS_LEVELS.BEGINNER,
      },
      avatar: {
        type: String,
        trim: true,
        default: 'https://i.pravatar.cc/150?u=default',
        validate: {
          validator: function (v) {
            // Allow empty string or valid URL
            if (!v) return true;
            return /^https?:\/\/.+/.test(v);
          },
          message: 'Avatar URL must be a valid HTTP/HTTPS URL',
        },
      },
      bio: {
        type: String,
        trim: true,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
      },
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES_ARRAY,
        message: `Role must be one of: ${USER_ROLES_ARRAY.join(', ')}`,
      },
      default: USER_ROLES.USER,
      index: true, // Index for role-based queries
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true, // Index for filtering active users
    },
    isEmailVerified: {
      type: Boolean,
      default: function () {
        // Auto-verify email if signed up with Google
        return !!this.googleId;
      },
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
    preferences: {
      units: {
        type: String,
        enum: ['metric', 'imperial'],
        default: 'metric',
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: false },
        weeklyReport: { type: Boolean, default: true },
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto',
      },
    },
    stats: {
      totalSessions: { type: Number, default: 0 },
      totalDuration: { type: Number, default: 0 }, // in seconds
      averageScore: { type: Number, default: 0 },
      favoriteExercise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exercise',
      },
      streak: { type: Number, default: 0 }, // consecutive days
      lastActivityDate: Date,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true }, // Include virtuals in JSON output
    toObject: { virtuals: true }, // Include virtuals in object output
  }
);

// Indexes
userSchema.index({ email: 1, isActive: 1 }); // Compound index for active user lookups
userSchema.index({ username: 1, isActive: 1 }); // Compound index for username lookups
userSchema.index({ googleId: 1, isActive: 1 }); // Compound index for Google OAuth lookups
userSchema.index({ provider: 1, isActive: 1 }); // Compound index for provider-based queries
userSchema.index({ 'stats.lastActivityDate': -1 }); // Index for recent activity

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.username;
});

// Virtual for BMI calculation
userSchema.virtual('bmi').get(function () {
  if (this.profile?.height && this.profile?.weight) {
    const heightInMeters = this.profile.height / 100;
    const bmi = this.profile.weight / (heightInMeters * heightInMeters);
    return Math.round(bmi * 10) / 10; // Round to 1 decimal place
  }
  return null;
});

// Virtual for account age in days
userSchema.virtual('accountAgeDays').get(function () {
  if (this.createdAt) {
    const diffTime = Date.now() - this.createdAt.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Virtual field for password confirmation (not stored in DB)
userSchema.virtual('confirmPassword')
  .get(function () {
    return this._confirmPassword;
  })
  .set(function (value) {
    this._confirmPassword = value;
  });

// Pre-save middleware to validate password confirmation
userSchema.pre('save', function (next) {
  // Only validate password confirmation for local auth users
  if (this.googleId) {
    return next(); // Skip for OAuth users
  }

  // Only validate if password is being set (new user or password change)
  if (this.isModified('password') && this.password) {
    // Check if confirmPassword is provided and matches password
    if (this._confirmPassword !== undefined && this._confirmPassword !== this.password) {
      const error = new Error('Passwords do not match');
      error.name = 'ValidationError';
      return next(error);
    }
  }

  // Clear confirmPassword after validation (it's a virtual field, won't be saved)
  this._confirmPassword = undefined;
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash password if it's been modified (or is new) and exists
  if (!this.isModified('password') || !this.password) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to set provider
userSchema.pre('save', function (next) {
  // Auto-set provider based on authentication method
  if (this.googleId && this.password) {
    this.provider = 'google+local';
  } else if (this.googleId) {
    this.provider = 'google';
  } else if (this.password) {
    this.provider = 'local';
  }
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false; // No password set (OAuth user)
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if user uses Google OAuth
userSchema.methods.usesGoogleAuth = function () {
  return !!this.googleId;
};

// Instance method to check if user uses local auth
userSchema.methods.usesLocalAuth = function () {
  return !!this.password;
};

// Instance method to link Google account
userSchema.methods.linkGoogleAccount = function (googleData) {
  this.googleId = googleData.id;
  this.oauth.google = {
    id: googleData.id,
    email: googleData.email,
    picture: googleData.picture,
    verified: googleData.verified_email || false,
  };
  
  // Update email if not set or if Google email is verified
  if (!this.email || (googleData.verified_email && !this.isEmailVerified)) {
    this.email = googleData.email;
    this.isEmailVerified = googleData.verified_email || false;
  }
  
  // Update avatar if not set
  if (!this.profile?.avatar && googleData.picture) {
    this.profile = this.profile || {};
    this.profile.avatar = googleData.picture;
  }
  
  // Update provider
  if (this.password) {
    this.provider = 'google+local';
  } else {
    this.provider = 'google';
  }
  
  return this.save();
};

// Instance method to check if user is admin
userSchema.methods.isAdmin = function () {
  return this.role === USER_ROLES.ADMIN;
};

// Instance method to check if user is premium
userSchema.methods.isPremium = function () {
  return this.role === USER_ROLES.PREMIUM;
};

// Instance method to update last login
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

// Instance method to update stats
userSchema.methods.updateStats = async function (sessionData) {
  this.stats.totalSessions += 1;
  this.stats.totalDuration += sessionData.duration || 0;
  
  // Update average score
  if (sessionData.overallScore !== undefined) {
    const currentTotal = this.stats.averageScore * (this.stats.totalSessions - 1);
    this.stats.averageScore = Math.round(
      ((currentTotal + sessionData.overallScore) / this.stats.totalSessions) * 10
    ) / 10;
  }
  
  // Update favorite exercise (simplified - could be more sophisticated)
  if (sessionData.exerciseId) {
    this.stats.favoriteExercise = sessionData.exerciseId;
  }
  
  // Update last activity
  this.stats.lastActivityDate = new Date();
  
  return this.save();
};

// Instance method to increment streak
userSchema.methods.updateStreak = function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastActivity = this.stats.lastActivityDate
    ? new Date(this.stats.lastActivityDate)
    : null;
  
  if (lastActivity) {
    lastActivity.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      // Consecutive day
      this.stats.streak += 1;
    } else if (daysDiff > 1) {
      // Streak broken
      this.stats.streak = 1;
    }
    // If daysDiff === 0, same day, don't update
  } else {
    // First activity
    this.stats.streak = 1;
  }
  
  this.stats.lastActivityDate = today;
  return this.save();
};

// Static method to find user by email or username
userSchema.statics.findByEmailOrUsername = function (identifier) {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  
  if (isEmail) {
    return this.findOne({ email: identifier.toLowerCase() });
  }
  return this.findOne({ username: identifier });
};

// Static method to find or create user from Google OAuth
userSchema.statics.findOrCreateGoogleUser = async function (googleData) {
  // Try to find by Google ID first
  let user = await this.findOne({ googleId: googleData.id });
  
  if (user) {
    // Update Google OAuth data
    user.oauth.google = {
      id: googleData.id,
      email: googleData.email,
      picture: googleData.picture,
      verified: googleData.verified_email || false,
    };
    
    // Update email if Google email is verified and current email is not verified
    if (googleData.verified_email && !user.isEmailVerified) {
      user.email = googleData.email;
      user.isEmailVerified = true;
    }
    
    // Update avatar if not set
    if (!user.profile?.avatar && googleData.picture) {
      user.profile = user.profile || {};
      user.profile.avatar = googleData.picture;
    }
    
    await user.save();
    return user;
  }
  
  // Try to find by email (user might have signed up with email/password)
  user = await this.findOne({ email: googleData.email.toLowerCase() });
  
  if (user) {
    // Link Google account to existing user
    return await user.linkGoogleAccount(googleData);
  }
  
  // Create new user from Google data
  const username = googleData.email.split('@')[0] + '_' + Date.now().toString().slice(-6);
  
  user = await this.create({
    username,
    email: googleData.email.toLowerCase(),
    googleId: googleData.id,
    provider: 'google',
    isEmailVerified: googleData.verified_email || false,
    oauth: {
      google: {
        id: googleData.id,
        email: googleData.email,
        picture: googleData.picture,
        verified: googleData.verified_email || false,
      },
    },
    profile: {
      firstName: googleData.given_name,
      lastName: googleData.family_name,
      avatar: googleData.picture,
    },
  });
  
  return user;
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

// Static method to get user statistics
userSchema.statics.getUserStats = async function (userId) {
  const ExerciseSession = mongoose.model('ExerciseSession');
  
  const stats = await ExerciseSession.aggregate([
    { $match: { userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId } },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        averageScore: { $avg: '$overallScore' },
        lastActivity: { $max: '$createdAt' },
      },
    },
  ]);
  
  return stats[0] || {
    totalSessions: 0,
    totalDuration: 0,
    averageScore: 0,
    lastActivity: null,
  };
};

// Post-save middleware to update stats (optional - can be called manually)
userSchema.post('save', function (doc, next) {
  // Could emit events, send notifications, etc.
  next();
});

// Create and export the model
const User = mongoose.model('User', userSchema);

export default User;
