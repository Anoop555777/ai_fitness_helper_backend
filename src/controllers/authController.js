import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import PendingRegistration from "../models/PendingRegistration.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import {
  HTTP_STATUS,
  API_STATUS,
  JWT_EXPIRATION,
} from "../config/constants.js";
import { logAuth, logError } from "../utils/logger.js";
import {
  sendCreateUserEmail,
  sendResendCreateUserEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/emailService.js";
import {
  uploadImage,
  deleteFile,
  AVATAR_IMAGE_OPTIONS,
  isConfigured as isCloudinaryConfigured,
  extractPublicId,
} from "../config/cloudinary.js";

/**
 * Authentication Controller
 *
 * Handles all authentication-related operations including:
 * - User registration and login
 * - JWT token generation and management (stored in HttpOnly cookies)
 * - Password reset and email verification
 * - Google OAuth integration
 * - User profile management
 *
 * @note JWT tokens are stored in HttpOnly cookies for security
 *       The protect middleware (middleware/auth.js) automatically reads
 *       and verifies JWT tokens from cookies on protected routes
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate JWT token
 * @param {string} userId - User ID
 * @param {string} expiresIn - Token expiration time (default: 15m)
 * @returns {string} JWT token
 */
const signToken = (userId, expiresIn = JWT_EXPIRATION.ACCESS_TOKEN) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn,
  });
};

/**
 * Parse JWT expiration string to milliseconds
 * @param {string} expiresIn - JWT expiration string (e.g., '15m', '7d', '1h')
 * @returns {number} Expiration time in milliseconds
 */
const parseExpirationToMs = (expiresIn) => {
  const unit = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1), 10);

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000; // Default 15 minutes
  }
};

/**
 * Get cookie options for authentication cookies
 * Handles cross-origin cookie settings (frontend on Vercel, backend on Render)
 * @returns {Object} Cookie options
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  // Check if frontend and backend are on different domains (cross-origin)
  // In production, assume cross-origin since frontend (Vercel) and backend (Render) are different domains
  const frontendUrl = process.env.FRONTEND_URL || "";
  const isLocalhost =
    frontendUrl.includes("localhost") || frontendUrl.includes("127.0.0.1");

  // In production, use SameSite: "none" for cross-origin cookies (frontend on Vercel, backend on Render)
  // In development with localhost, use "lax" for same-origin
  // Only use "strict" if explicitly same-origin in production (rare)
  const isCrossOrigin = isProduction && !isLocalhost;
  const useSameSiteNone = isCrossOrigin;

  // When sameSite is "none", secure MUST be true (browser requirement)
  const cookieOptions = {
    httpOnly: true, // Prevents XSS attacks - JavaScript cannot access cookie
    secure: useSameSiteNone || isProduction, // HTTPS only when sameSite is "none" or in production
    sameSite: useSameSiteNone ? "none" : isProduction ? "strict" : "lax", // "none" for cross-origin, "lax" for same-origin
    path: "/", // Available for all routes
  };

  // Log cookie options for debugging (both dev and prod to help troubleshoot)
  console.log("Cookie options:", {
    ...cookieOptions,
    isProduction,
    isCrossOrigin,
    frontendUrl: frontendUrl || "not set",
  });

  return cookieOptions;
};

/**
 * Create and send token response with cookie
 * Sets JWT token as HttpOnly cookie for security
 * @param {Object} user - User object
 * @param {number} statusCode - HTTP status code
 * @param {Object} res - Express response object
 * @param {string} expiresIn - Token expiration time (default: 15m)
 */
const createSendToken = (
  user,
  statusCode,
  res,
  expiresIn = JWT_EXPIRATION.ACCESS_TOKEN
) => {
  const token = signToken(user._id, expiresIn);

  // Remove password from output
  user.password = undefined;

  // Calculate cookie expiration in milliseconds
  const cookieMaxAge = parseExpirationToMs(expiresIn);

  // Set JWT token as HttpOnly cookie (best practice for security)
  // For cross-origin requests (frontend on Vercel, backend on Render):
  // - sameSite: "none" allows cross-origin cookies
  // - secure: true is REQUIRED when sameSite is "none" (HTTPS only)
  const cookieOptions = {
    ...getCookieOptions(),
    maxAge: cookieMaxAge, // Cookie expiration matches token expiration
    // Additional security: domain should be set if using subdomains
    // domain: process.env.COOKIE_DOMAIN, // Optional: restrict to specific domain
  };

  // Set cookie
  res.cookie("token", token, cookieOptions);

  // Log cookie settings for debugging (both dev and prod to help troubleshoot)
  console.log("Setting authentication cookie:", {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
    isProduction: process.env.NODE_ENV === "production",
    frontendUrl: process.env.FRONTEND_URL,
    tokenLength: token.length,
  });

  // Verify cookie header was set
  const setCookieHeader = res.getHeader("Set-Cookie");
  if (!setCookieHeader) {
    console.error("ERROR: Set-Cookie header was NOT set in response!");
  } else {
    console.log(
      "Set-Cookie header confirmed:",
      Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
    );
  }

  // Send response without token in body (cookie handles it)
  // Use res.json() instead of res.status().json() to ensure headers are sent
  res.status(statusCode);
  res.json({
    status: API_STATUS.SUCCESS,
    data: {
      user,
    },
  });

  // Log after response is sent
  console.log("Login response sent successfully");
};

/**
 * Generate random token
 * @returns {string} Random token
 */
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Hash token (for storing in database)
 * @param {string} token - Token to hash
 * @returns {string} Hashed token
 */
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// ============================================
// REGISTRATION & LOGIN
// ============================================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (initial step - only email, no user created yet)
 * @access  Public
 */
export const register = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(
      new AppError("Please provide your email address", HTTP_STATUS.BAD_REQUEST)
    );
  }

  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    // If user exists but is inactive (closed browser during create-user), allow resend
    if (!existingUser.isActive) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        status: API_STATUS.ERROR,
        message: "Email already registered but account is incomplete",
        canResend: true,
        email: normalizedEmail,
      });
    }
    // Active user exists - return error
    return next(new AppError("Email already registered", HTTP_STATUS.CONFLICT));
  }

  // Check if there's already a pending registration for this email
  const existingPending = await PendingRegistration.findOne({
    email: normalizedEmail,
  });

  if (existingPending) {
    // Delete old pending registration
    await PendingRegistration.findByIdAndDelete(existingPending._id);
  }

  // Generate token and store in PendingRegistration (NOT creating user yet)
  const verificationToken = generateRandomToken();
  const pendingRegistration = new PendingRegistration({
    email: normalizedEmail,
    emailVerificationToken: hashToken(verificationToken),
    emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });

  await pendingRegistration.save();

  // Log registration attempt
  logAuth("register_initiated", null, { email: normalizedEmail });

  // Send verification email with link to backend verify-token endpoint
  try {
    await sendCreateUserEmail(normalizedEmail, verificationToken);
  } catch (error) {
    // If email fails, delete the pending registration and return error
    await PendingRegistration.findByIdAndDelete(pendingRegistration._id);
    logError("Error sending create user email", error);
    return next(
      new AppError(
        "There was an error sending the email. Try again later!",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message:
      "Registration email sent. Please check your inbox to complete registration.",
    ...(process.env.NODE_ENV === "development" && {
      verificationToken, // Only in development
    }),
  });
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user and set JWT token as HttpOnly cookie
 * @access  Public
 * @note    JWT token is set as HttpOnly cookie (not in response body)
 *          The protect middleware (middleware/auth.js) automatically reads
 *          and verifies the JWT token from cookies on protected routes
 */
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(
      new AppError("Please provide email and password", HTTP_STATUS.BAD_REQUEST)
    );
  }

  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password"
  );

  if (!user || !(await user.comparePassword(password))) {
    return next(
      new AppError("Incorrect email or password", HTTP_STATUS.UNAUTHORIZED)
    );
  }

  // 3) Check if user is active
  if (!user.isActive) {
    return next(
      new AppError("Your account has been deactivated", HTTP_STATUS.FORBIDDEN)
    );
  }

  // 4) Update last login
  await user.updateLastLogin();

  // 5) Log login
  logAuth("login", user._id.toString(), { email: user.email, ip: req.ip });

  // 6) If everything ok, set JWT token as HttpOnly cookie
  // The protect middleware will automatically verify this cookie on protected routes
  createSendToken(user, HTTP_STATUS.OK, res);
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (clear authentication cookie)
 * @access  Private
 * @note    Clears the HttpOnly cookie containing the JWT token
 */
export const logout = catchAsync(async (req, res, next) => {
  // Log logout
  logAuth("logout", req.user._id.toString(), { email: req.user.email });

  // Clear the authentication cookie (must match the same settings used when setting the cookie)
  res.clearCookie("token", getCookieOptions());

  res.status(HTTP_STATUS.NO_CONTENT).json({
    status: API_STATUS.SUCCESS,
    message: "Logged out successfully",
  });
});

// ============================================
// USER PROFILE
// ============================================

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged-in user
 * @access  Private
 */
export const getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      user,
    },
  });
});

/**
 * @route   GET /api/v1/auth/check-username/:username
 * @desc    Check if username is available
 * @access  Public (but can check current user's token to exclude their own username)
 */
export const checkUsername = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  if (
    !username ||
    typeof username !== "string" ||
    username.trim().length === 0
  ) {
    return res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      data: {
        available: false,
        message: "Username is required",
      },
    });
  }

  const trimmedUsername = username.trim();

  // Get current user if authenticated (from cookie or header)
  let currentUserId = null;
  try {
    let token;
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUserId = decoded.id;
    }
  } catch (error) {
    // Token invalid or not present - that's okay, just check all users
  }

  // Check if username exists (case-insensitive), excluding current user
  const query = {
    username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
  };

  if (currentUserId) {
    query._id = { $ne: currentUserId };
  }

  const existingUser = await User.findOne(query);

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      available: !existingUser,
      message: existingUser
        ? "Username already exists"
        : "Username is available",
    },
  });
});

/**
 * @route   GET /api/v1/auth/isLoggedIn
 * @desc    Check if user is logged in (no errors, just returns user or null)
 * @access  Public (no auth required, but checks cookie if present)
 * @note    This endpoint never throws errors - returns null if not logged in
 */
export const isLoggedIn = catchAsync(async (req, res, next) => {
  let token;

  // Get token from cookie (preferred) or Authorization header (fallback)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // If no token, return null - no error
  if (!token) {
    return res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      data: {
        user: null,
        isLoggedIn: false,
      },
    });
  }

  // Try to verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // Token invalid or expired - return null, no error
    return res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      data: {
        user: null,
        isLoggedIn: false,
      },
    });
  }

  // Try to get user - select fields explicitly to avoid password and sensitive data
  try {
    const user = await User.findById(decoded.id)
      .select(
        "-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires"
      )
      .lean();

    // If user doesn't exist or is inactive, return null
    if (!user || !user.isActive) {
      return res.status(HTTP_STATUS.OK).json({
        status: API_STATUS.SUCCESS,
        data: {
          user: null,
          isLoggedIn: false,
        },
      });
    }

    // Remove sensitive fields from user object (in case they were included)
    const userData = { ...user };
    delete userData.password;
    delete userData.passwordResetToken;
    delete userData.passwordResetExpires;
    delete userData.emailVerificationToken;
    delete userData.emailVerificationExpires;

    // Remove OAuth tokens if they exist
    if (userData.oauth?.google) {
      delete userData.oauth.google.accessToken;
      delete userData.oauth.google.refreshToken;
    }

    // Ensure id field exists for frontend compatibility (map _id to id)
    if (userData._id) {
      userData.id = userData._id.toString();
    }

    // Convert Date objects to ISO strings for JSON serialization
    if (userData.createdAt && userData.createdAt instanceof Date) {
      userData.createdAt = userData.createdAt.toISOString();
    }
    if (userData.updatedAt && userData.updatedAt instanceof Date) {
      userData.updatedAt = userData.updatedAt.toISOString();
    }
    if (userData.lastLogin && userData.lastLogin instanceof Date) {
      userData.lastLogin = userData.lastLogin.toISOString();
    }

    // Calculate BMI if height and weight exist (since .lean() doesn't include virtuals)
    if (userData.profile?.height && userData.profile?.weight) {
      const heightInMeters = userData.profile.height / 100;
      const bmi = userData.profile.weight / (heightInMeters * heightInMeters);
      userData.bmi = Math.round(bmi * 10) / 10; // Round to 1 decimal place
    }

    // Return user data with all required fields
    return res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      data: {
        user: userData,
        isLoggedIn: true,
      },
    });
  } catch (error) {
    // Any error in fetching user - return null, no error
    logError("Error checking login status", error);
    return res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      data: {
        user: null,
        isLoggedIn: false,
      },
    });
  }
});

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile (supports both JSON and FormData with avatar file)
 * @access  Private
 * @body    JSON or FormData with profile fields and optional avatar file
 *
 * @note    Multer middleware processes file uploads before this controller
 *          Files are stored in memory and uploaded directly to Cloudinary
 *          Old avatars are automatically deleted from Cloudinary when replaced
 */
export const updateProfile = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  let { username, email, profile, preferences } = req.body;

  // Handle FormData - profile fields come as nested strings like "profile[firstName]"
  // Parse them into a proper profile object
  if (req.body && typeof req.body === "object" && !profile) {
    // Check if this is FormData (has nested profile fields)
    const profileKeys = Object.keys(req.body).filter((key) =>
      key.startsWith("profile[")
    );
    if (profileKeys.length > 0) {
      profile = {};
      profileKeys.forEach((key) => {
        const fieldName = key.match(/profile\[(.+)\]/)?.[1];
        if (fieldName) {
          let value = req.body[key];
          // Convert numeric fields
          if (
            fieldName === "age" ||
            fieldName === "height" ||
            fieldName === "weight"
          ) {
            const numValue = parseFloat(value);
            value =
              !isNaN(numValue) && value !== "" && value !== undefined
                ? numValue
                : undefined;
          }
          // Only add non-empty values
          if (value !== "" && value !== undefined && value !== null) {
            profile[fieldName] = value;
          }
        }
      });
    }
  }

  // Handle avatar file upload using Multer
  let avatarUrl = null;
  let oldAvatarPublicId = null;

  if (req.file) {
    // Validate file was processed correctly by Multer
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return next(
        new AppError(
          "Invalid file: file buffer is empty",
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      return next(
        new AppError(
          "File upload service is not configured. Please contact support.",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
    }

    // Extract old avatar public ID before upload (for cleanup)
    if (req.user.profile?.avatar) {
      const oldAvatarUrl = req.user.profile.avatar;
      // Only extract if it's a Cloudinary URL (not external URLs like Google OAuth)
      if (
        oldAvatarUrl &&
        typeof oldAvatarUrl === "string" &&
        oldAvatarUrl.includes("cloudinary.com")
      ) {
        oldAvatarPublicId = extractPublicId(oldAvatarUrl);
      }
    }

    try {
      // Upload avatar to Cloudinary with optimized settings
      // AVATAR_IMAGE_OPTIONS includes: folder, transformation (200x200, face detection, auto quality), tags
      const uploadResult = await uploadImage(req.file.buffer, {
        ...AVATAR_IMAGE_OPTIONS,
        // Add user-specific public_id for better organization (optional)
        // publicId: `avatar_${userId}`,
        overwrite: false, // Don't overwrite - create new file
      });

      avatarUrl = uploadResult.secure_url;

      logAuth("avatar_uploaded", userId.toString(), {
        publicId: uploadResult.public_id,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
        width: uploadResult.width,
        height: uploadResult.height,
      });

      // Delete old avatar from Cloudinary if it exists
      if (oldAvatarPublicId) {
        try {
          await deleteFile(oldAvatarPublicId, "image");
          logAuth("old_avatar_deleted", userId.toString(), {
            publicId: oldAvatarPublicId,
          });
        } catch (deleteError) {
          // Log but don't fail the request if deletion fails
          // Old avatar will remain in Cloudinary but won't be referenced
          logError("Failed to delete old avatar from Cloudinary", {
            error: deleteError,
            userId: userId.toString(),
            publicId: oldAvatarPublicId,
          });
        }
      }
    } catch (uploadError) {
      logError("Avatar upload to Cloudinary failed", {
        error: uploadError,
        userId: userId.toString(),
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimetype: req.file.mimetype,
      });
      return next(
        new AppError(
          `Failed to upload avatar image. ${
            uploadError.message || "Please try again or contact support."
          }`,
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
    }
  }

  // Build update object
  const updateData = {};
  if (username) updateData.username = username;

  if (email) {
    // Check if email is already taken by another user
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId },
    });
    if (existingUser) {
      return next(new AppError("Email already in use", HTTP_STATUS.CONFLICT));
    }
    updateData.email = email.toLowerCase();
    // If email changed, require re-verification
    if (email.toLowerCase() !== req.user.email) {
      updateData.isEmailVerified = false;
      const verificationToken = generateRandomToken();
      updateData.emailVerificationToken = hashToken(verificationToken);
    }
  }

  // Merge preferences data
  if (preferences) {
    updateData.preferences = { ...req.user.preferences, ...preferences };
  }

  // Merge profile data
  if (profile) {
    updateData.profile = { ...req.user.profile, ...profile };
    // If avatar was uploaded, set it in the profile
    if (avatarUrl) {
      updateData.profile.avatar = avatarUrl;
    }
  } else if (avatarUrl) {
    // If only avatar is being updated without other profile fields
    updateData.profile = { ...req.user.profile, avatar: avatarUrl };
  }

  // Update user in database
  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new AppError("User not found", HTTP_STATUS.NOT_FOUND));
  }

  // Log profile update
  logAuth("update_profile", user._id.toString(), {
    updatedFields: Object.keys(updateData),
    hasAvatarUpload: !!req.file,
    avatarUpdated: !!avatarUrl,
    oldAvatarDeleted: !!oldAvatarPublicId,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    data: {
      user,
    },
  });
});

/**
 * @route   PUT /api/v1/auth/password
 * @desc    Update user password
 * @access  Private
 */
export const updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user._id;

  // 1) Get user from collection
  const user = await User.findById(userId).select("+password");

  if (!user) {
    return next(new AppError("User not found", HTTP_STATUS.NOT_FOUND));
  }

  // 2) Check if POSTed current password is correct
  if (!user.password || !(await user.comparePassword(currentPassword))) {
    return next(
      new AppError("Your current password is wrong", HTTP_STATUS.UNAUTHORIZED)
    );
  }

  // 3) Validate new password confirmation
  if (newPassword !== confirmPassword) {
    return next(
      new AppError("New passwords do not match", HTTP_STATUS.BAD_REQUEST)
    );
  }

  // 4) If so, update password
  user.password = newPassword;
  user.confirmPassword = confirmPassword; // For validation
  await user.save();

  // 5) Log password change
  logAuth("password_change", user._id.toString(), { email: user.email });

  // 6) Log user in, send JWT
  createSendToken(user, HTTP_STATUS.OK, res);
});

// ============================================
// PASSWORD RESET
// ============================================

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset token to email
 * @access  Public
 */
export const forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const { email } = req.body;

  if (!email) {
    return next(
      new AppError("Please provide your email address", HTTP_STATUS.BAD_REQUEST)
    );
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Return error if user doesn't exist - frontend will redirect to register
    return next(
      new AppError(
        "No account found with this email address",
        HTTP_STATUS.NOT_FOUND
      )
    );
  }

  // 2) Generate the random reset token
  const resetToken = generateRandomToken();
  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour from now
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    await sendPasswordResetEmail(
      user.email,
      user.username || user.email,
      resetToken
    );

    logAuth("forgot_password", user._id.toString(), { email: user.email });

    res.status(HTTP_STATUS.OK).json({
      status: API_STATUS.SUCCESS,
      message:
        "If an account exists with this email, a password reset link has been sent.",
      ...(process.env.NODE_ENV === "development" && {
        resetToken, // Only in development
      }),
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logError("Error sending password reset email", error);
    return next(
      new AppError(
        "There was an error sending the email. Try again later!",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }
});

/**
 * @route   POST /api/v1/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
export const resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = hashToken(req.params.token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(
      new AppError("Token is invalid or has expired", HTTP_STATUS.BAD_REQUEST)
    );
  }

  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword) {
    return next(
      new AppError(
        "Please provide password and confirmation",
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  if (password !== confirmPassword) {
    return next(
      new AppError("Passwords do not match", HTTP_STATUS.BAD_REQUEST)
    );
  }

  user.password = password;
  user.confirmPassword = confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user (if needed)
  // This can be added to User model if tracking password change history is needed

  // 4) Log the user in, send JWT
  logAuth("password_reset", user._id.toString(), { email: user.email });

  createSendToken(user, HTTP_STATUS.OK, res);
});

// ============================================
// EMAIL VERIFICATION
// ============================================

/**
 * @route   GET /api/v1/auth/verify-token/:token
 * @desc    Verify token from email, create user, and redirect to frontend create-user page
 * @access  Public
 */
export const verifyToken = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://asb-ai-fitness-helper.vercel.app");
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

  // Check if token is missing or empty
  if (!token || token.trim() === "") {
    return res.redirect(`${FRONTEND_URL}/register?error=missing_token`);
  }

  const hashedToken = hashToken(token);

  // Find pending registration
  const pendingRegistration = await PendingRegistration.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!pendingRegistration) {
    // Redirect to frontend with error
    return res.redirect(`${FRONTEND_URL}/register?error=invalid_token`);
  }

  // Check if user already exists (edge case - user might have been created somehow)
  const existingUser = await User.findOne({
    email: pendingRegistration.email,
  });

  if (existingUser) {
    // User already exists, delete pending registration and redirect with error
    await PendingRegistration.findByIdAndDelete(pendingRegistration._id);
    return res.redirect(
      `${FRONTEND_URL}/register?error=email_already_registered`
    );
  }

  // NOW create the user (user is created here, not in register)
  // Generate a temporary unique username (will be updated in createUser)
  const emailPrefix = pendingRegistration.email.split("@")[0];
  const timestamp = Date.now().toString().slice(-8);
  const randomSuffix = crypto.randomBytes(2).toString("hex");
  let tempUsername = `temp_${emailPrefix}_${timestamp}_${randomSuffix}`;

  // Ensure username is unique (very unlikely collision, but check anyway)
  let usernameExists = await User.findOne({ username: tempUsername });
  let attempts = 0;
  while (usernameExists && attempts < 5) {
    tempUsername = `temp_${emailPrefix}_${timestamp}_${crypto
      .randomBytes(2)
      .toString("hex")}`;
    usernameExists = await User.findOne({ username: tempUsername });
    attempts++;
  }

  const user = new User({
    username: tempUsername,
    email: pendingRegistration.email,
    emailVerificationToken: hashedToken, // Keep token for create-user step
    emailVerificationExpires: pendingRegistration.emailVerificationExpires,
    isActive: false, // User is not active until they set password
    isEmailVerified: true, // Email is verified since they clicked the link
  });

  await user.save({ validateBeforeSave: false });

  // Delete pending registration since user is now created
  await PendingRegistration.findByIdAndDelete(pendingRegistration._id);

  logAuth("user_created_after_token_verification", user._id.toString(), {
    email: user.email,
  });

  // Redirect to frontend create-user page with token
  res.redirect(`${FRONTEND_URL}/create-user?token=${token}`);
});

/**
 * @route   GET /api/v1/auth/verify-email/:token
 * @desc    Verify user email with token and redirect to create-user page (legacy endpoint)
 * @access  Public
 * @deprecated Use verifyToken instead
 */
export const verifyEmail = catchAsync(async (req, res, next) => {
  // Redirect to verifyToken for backward compatibility
  return verifyToken(req, res, next);
});

/**
 * @route   POST /api/v1/auth/resend-create-user-email
 * @desc    Resend create-user email for inactive users (who closed browser during registration)
 * @access  Public
 */
export const resendCreateUserEmail = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(
      new AppError("Please provide your email address", HTTP_STATUS.BAD_REQUEST)
    );
  }

  const normalizedEmail = email.toLowerCase();

  // Find inactive user
  const user = await User.findOne({
    email: normalizedEmail,
    isActive: false,
  });

  if (!user) {
    return next(
      new AppError(
        "No incomplete registration found for this email. Please register again.",
        HTTP_STATUS.NOT_FOUND
      )
    );
  }

  // Generate new token (we can't reverse hash, so always generate new token)
  const verificationToken = generateRandomToken();
  user.emailVerificationToken = hashToken(verificationToken);
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save({ validateBeforeSave: false });

  // Send email with new token - use resend template (user already exists, just needs to complete registration)
  try {
    await sendResendCreateUserEmail(normalizedEmail, verificationToken);
  } catch (error) {
    logError("Error sending create user email", {
      error: error.message,
      stack: error.stack,
      email: normalizedEmail,
      isOperational: error.isOperational,
    });
    return next(
      new AppError(
        error.isOperational && error.message
          ? error.message
          : "There was an error sending the email. Try again later!",
        error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }

  logAuth("resend_create_user_email", user._id.toString(), {
    email: normalizedEmail,
  });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message:
      "Registration email sent. Please check your inbox to complete registration.",
    ...(process.env.NODE_ENV === "development" &&
      {
        // Note: We can't return the actual token since it's hashed in DB
        // In production, user will get it via email
      }),
  });
});

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification token
 * @access  Private
 */
export const resendVerification = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError("User not found", HTTP_STATUS.NOT_FOUND));
  }

  if (user.isEmailVerified) {
    return next(
      new AppError("Email is already verified", HTTP_STATUS.BAD_REQUEST)
    );
  }

  // Generate new verification token
  const verificationToken = generateRandomToken();
  user.emailVerificationToken = hashToken(verificationToken);
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    await sendVerificationEmail(
      user.email,
      user.username || user.email,
      verificationToken
    );
  } catch (error) {
    logError("Error sending verification email", error);
    return next(
      new AppError(
        "There was an error sending the email. Try again later!",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }

  logAuth("resend_verification", user._id.toString(), { email: user.email });

  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: "Verification email sent",
    ...(process.env.NODE_ENV === "development" && {
      verificationToken, // Only in development
    }),
  });
});

// ============================================
// GOOGLE OAUTH
// ============================================

/**
 * @route   GET /api/v1/auth/google
 * @desc    Initiate Google OAuth login
 * @access  Public
 */
export const googleAuth = catchAsync(async (req, res, next) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    process.env;

  // Validate environment variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    logError(
      "Google OAuth configuration missing",
      new Error("Missing Google OAuth environment variables")
    );
    return next(
      new AppError(
        "Google OAuth is not configured. Please contact support.",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    );
  }

  // Create OAuth2 client
  const oauth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // Generate the authorization URL
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in session/cookie if needed (optional, for production)
  // For now, we'll include it in the URL and verify in callback

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Request refresh token
    scope: scopes,
    prompt: "consent", // Force consent screen to get refresh token
    state: state,
  });

  // Redirect to Google OAuth consent screen
  res.redirect(authUrl);
});

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 * @note    This handles the callback from Google OAuth.
 *          Exchanges code for tokens, gets user info, and logs user in.
 */
export const googleCallback = catchAsync(async (req, res, next) => {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    FRONTEND_URL,
  } = process.env;

  // Validate environment variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    logError(
      "Google OAuth configuration missing",
      new Error("Missing Google OAuth environment variables")
    );
    return res.redirect(
      `${
        FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
      }/login?error=oauth_config_error`
    );
  }

  const { code, error, state } = req.query;

  // Handle OAuth errors
  if (error) {
    logError("Google OAuth error", new Error(`OAuth error: ${error}`));
    return res.redirect(
      `${
        FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
      }/login?error=oauth_denied`
    );
  }

  // Validate authorization code
  if (!code) {
    logError(
      "Google OAuth callback missing code",
      new Error("No authorization code received")
    );
    return res.redirect(
      `${
        FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
      }/login?error=oauth_no_code`
    );
  }

  try {
    // Create OAuth2 client
    const oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error("Failed to get user info from Google");
    }

    // Prepare Google user data
    const googleUserData = {
      id: payload.sub,
      email: payload.email,
      verified_email: payload.email_verified || false,
      name: payload.name,
      given_name: payload.given_name,
      family_name: payload.family_name,
      picture: payload.picture,
    };

    // Find or create user using existing method
    const user = await User.findOrCreateGoogleUser(googleUserData);

    // Update OAuth tokens if available
    if (tokens.access_token || tokens.refresh_token) {
      user.oauth.google = {
        ...user.oauth.google,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      };
      await user.save({ validateBeforeSave: false });
    }

    // Log authentication
    logAuth("google_oauth_login", user._id.toString(), {
      email: user.email,
      googleId: user.googleId,
      ip: req.ip,
    });

    // Generate JWT token
    const token = signToken(user._id, JWT_EXPIRATION.ACCESS_TOKEN);

    // Calculate cookie expiration in milliseconds
    const cookieMaxAge = parseExpirationToMs(JWT_EXPIRATION.ACCESS_TOKEN);

    // Set JWT token as HttpOnly cookie (best practice for security)
    res.cookie("token", token, {
      ...getCookieOptions(),
      maxAge: cookieMaxAge, // Cookie expiration matches token expiration
    });

    // Redirect to frontend (token is in cookie)
    res.redirect(
      `${FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"}/dashboard`
    );
  } catch (error) {
    logError("Google OAuth callback error", error);

    // Handle specific errors
    if (error.message?.includes("invalid_grant")) {
      return res.redirect(
        `${
          FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
        }/login?error=oauth_code_expired`
      );
    }

    return res.redirect(
      `${
        FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
      }/login?error=oauth_failed`
    );
  }
});

/**
 * @route   POST /api/v1/auth/create-user
 * @desc    Complete user registration with username and password (token in body or query)
 * @access  Public
 */
export const createUser = catchAsync(async (req, res, next) => {
  // Token can be in body or query params
  const { token } = req.body || req.query;
  const { username, password, confirmPassword, height, weight, fitnessLevel } =
    req.body;

  if (!token) {
    return next(
      new AppError("Verification token is required", HTTP_STATUS.BAD_REQUEST)
    );
  }

  if (!username || !password || !confirmPassword) {
    return next(
      new AppError(
        "Please provide username, password, and password confirmation",
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  if (password !== confirmPassword) {
    return next(
      new AppError("Passwords do not match", HTTP_STATUS.BAD_REQUEST)
    );
  }

  // Find user by token - user should already be created from verifyToken step
  const hashedToken = hashToken(token);
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(
      new AppError("Invalid or expired token", HTTP_STATUS.BAD_REQUEST)
    );
  }

  // Verify that email is verified (from verifyToken step)
  if (!user.isEmailVerified) {
    return next(
      new AppError(
        "Please verify your email first by clicking the link in your email",
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }

  // Check if username is already taken
  const existingUser = await User.findOne({ username });
  if (existingUser && existingUser._id.toString() !== user._id.toString()) {
    return next(new AppError("Username already taken", HTTP_STATUS.CONFLICT));
  }

  // Update the user with username and password
  user.username = username;
  user.password = password;
  user.confirmPassword = confirmPassword;
  user.isActive = true; // Activate user now that password is set

  // Update profile information if provided
  if (height !== undefined) {
    user.profile = user.profile || {};
    user.profile.height = height; // Height is already in cm from frontend
  }

  if (weight !== undefined) {
    user.profile = user.profile || {};
    user.profile.weight = weight; // Weight is already in kg from frontend
  }

  if (fitnessLevel) {
    user.profile = user.profile || {};
    user.profile.fitnessLevel = fitnessLevel;
  }

  // Clear verification token since registration is complete
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;

  await user.save();

  // Log user creation completion (username and password set)
  logAuth("create_user_complete", user._id.toString(), {
    email: user.email,
    username: user.username,
  });

  // Send welcome email
  try {
    await sendWelcomeEmail(user.email, user.username || user.email);
  } catch (error) {
    logError("Error sending welcome email", error);
    // Don't fail registration if welcome email fails
  }

  // Log user in and send JWT token
  createSendToken(user, HTTP_STATUS.OK, res);
});
