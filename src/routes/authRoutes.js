import express from "express";
import {
  register,
  login,
  getMe,
  isLoggedIn,
  updateProfile,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
  verifyToken,
  verifyEmail,
  resendVerification,
  resendCreateUserEmail,
  googleAuth,
  googleCallback,
  createUser,
  checkUsername,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validatePassword,
} from "../middleware/validation.js";
import { uploadAvatarFile } from "../middleware/upload.js";
import {
  authRateLimiter,
  logoutRateLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();

// Apply strict rate limiting to sensitive auth routes (login, register, password reset, etc.)
// Note: Logout uses separate lenient rate limiter

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (initial step - only email)
 * @access  Public
 */
router.post("/register", authRateLimiter, register);

/**
 * @route   POST /api/v1/auth/create-user
 * @desc    Complete user registration with username and password (token in body or query)
 * @access  Public
 */
router.post("/create-user", authRateLimiter, createUser);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post("/login", authRateLimiter, validateLogin, login);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (invalidate token)
 * @access  Private
 * @note    Uses lenient rate limiter - successful logouts don't count against limit
 */
router.post("/logout", logoutRateLimiter, protect, logout);

/**
 * @route   GET /api/v1/auth/isLoggedIn
 * @desc    Check if user is logged in (returns user or null, never throws errors)
 * @access  Public
 */
router.get("/isLoggedIn", isLoggedIn);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged-in user
 * @access  Private
 */
router.get("/me", protect, getMe);

/**
 * @route   GET /api/v1/auth/check-username/:username
 * @desc    Check if username is available
 * @access  Public
 */
router.get("/check-username/:username", checkUsername);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile (supports both JSON and FormData with avatar file)
 * @access  Private
 * @body    JSON or FormData with profile fields and optional avatar file
 *
 * @note    Multer middleware (uploadAvatarFile.single('avatar')) processes file uploads:
 *          - Validates file type (JPEG, PNG, WebP only)
 *          - Validates file size (max 2MB)
 *          - Stores file in memory as buffer for Cloudinary upload
 *          - File available in req.file if uploaded
 *          - FormData fields available in req.body
 *
 * @note    Multer is optional - if no file is uploaded, req.file will be undefined
 *          The route still works for JSON requests without multer processing
 */
router.put(
  "/profile",
  protect,
  uploadAvatarFile.single("avatar"),
  validateUpdateProfile,
  updateProfile
);

/**
 * @route   PUT /api/v1/auth/password
 * @desc    Update user password
 * @access  Private
 */
router.put("/password", protect, validatePassword, updatePassword);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset token to email
 * @access  Public
 */
router.post("/forgot-password", authRateLimiter, forgotPassword);

/**
 * @route   POST /api/v1/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.post("/reset-password/:token", authRateLimiter, resetPassword);

/**
 * @route   GET /api/v1/auth/verify-token/:token
 * @desc    Verify token from email, create user, and redirect to frontend create-user page
 * @access  Public
 */
router.get("/verify-token/:token", verifyToken);

/**
 * @route   GET /api/v1/auth/verify-email/:token
 * @desc    Verify user email with token and redirect to create-user page (legacy endpoint)
 * @access  Public
 * @deprecated Use verify-token instead
 */
router.get("/verify-email/:token", verifyEmail);

/**
 * @route   POST /api/v1/auth/resend-create-user-email
 * @desc    Resend create-user email for inactive users
 * @access  Public
 */
router.post(
  "/resend-create-user-email",
  authRateLimiter,
  resendCreateUserEmail
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification token
 * @access  Private
 */
router.post("/resend-verification", protect, resendVerification);

/**
 * @route   GET /api/v1/auth/google
 * @desc    Initiate Google OAuth login
 * @access  Public
 */
router.get("/google", googleAuth);

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 */
router.get("/google/callback", googleCallback);

export default router;
