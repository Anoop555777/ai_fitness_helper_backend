import mongoose from 'mongoose';

/**
 * PendingRegistration Model
 * 
 * Stores temporary registration data (email + token) before user creation.
 * Records are automatically deleted after token expiration or successful user creation.
 */
const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    emailVerificationToken: {
      type: String,
      required: true,
      index: true,
    },
    emailVerificationExpires: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster token lookups
pendingRegistrationSchema.index({ emailVerificationToken: 1, emailVerificationExpires: 1 });

const PendingRegistration = mongoose.model('PendingRegistration', pendingRegistrationSchema);

export default PendingRegistration;

