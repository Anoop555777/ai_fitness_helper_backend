import express from 'express';
import authRoutes from './authRoutes.js';
import exerciseRoutes from './exerciseRoutes.js';
import feedbackRoutes from './feedbackRoutes.js';
import sessionRoutes from './sessionRoutes.js';
import videoRoutes from './videoRoutes.js';
import goalsRoutes from './goalsRoutes.js';

/**
 * Route Aggregator
 * 
 * This file aggregates all route modules and provides a centralized
 * way to mount them on the Express application.
 * 
 * Usage in app.js:
 *   import routes from './routes/index.js';
 *   routes(app);
 */

/**
 * Mount all routes on the Express application
 * @param {express.Application} app - Express application instance
 */
const mountRoutes = (app) => {
  // API v1 routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/exercises', exerciseRoutes);
  app.use('/api/v1/feedback', feedbackRoutes);
  app.use('/api/v1/sessions', sessionRoutes);
  app.use('/api/v1/videos', videoRoutes);
  app.use('/api/v1/goals', goalsRoutes);
};

/**
 * Get all route modules as an object (for testing or inspection)
 * @returns {Object} Object containing all route modules
 */
const getRoutes = () => ({
  auth: authRoutes,
  exercises: exerciseRoutes,
  feedback: feedbackRoutes,
  sessions: sessionRoutes,
  videos: videoRoutes,
  goals: goalsRoutes,
});

/**
 * Get route information (for API documentation or debugging)
 * @returns {Array} Array of route information objects
 */
const getRouteInfo = () => [
  {
    path: '/api/v1/auth',
    description: 'Authentication routes',
    routes: [
      'POST /register - Register new user',
      'POST /login - Login user',
      'POST /logout - Logout user',
      'GET /me - Get current user',
      'PUT /profile - Update user profile',
      'PUT /password - Update password',
      'POST /forgot-password - Request password reset',
      'POST /reset-password/:token - Reset password',
      'POST /verify-email/:token - Verify email',
      'POST /resend-verification - Resend verification email',
      'GET /google - Google OAuth login',
      'GET /google/callback - Google OAuth callback',
    ],
  },
  {
    path: '/api/v1/exercises',
    description: 'Exercise routes',
    routes: [
      'GET / - Get all exercises',
      'GET /search - Search exercises',
      'GET /category/:category - Get exercises by category',
      'GET /difficulty/:difficulty - Get exercises by difficulty',
      'GET /:id - Get exercise by ID',
      'POST / - Create exercise (Admin)',
      'PUT /:id - Update exercise (Admin)',
      'DELETE /:id - Delete exercise (Admin)',
    ],
  },
  {
    path: '/api/v1/feedback',
    description: 'Feedback routes',
    routes: [
      'POST /enhance - Generate enhanced feedback (AI)',
      'GET /stats/:sessionId - Get feedback statistics',
      'GET /critical/:sessionId - Get critical feedback',
      'GET /session/:sessionId - Get feedback for session',
      'GET /session/:sessionId/type/:type - Get feedback by type',
      'GET /:id - Get feedback by ID',
      'POST / - Create feedback',
      'PUT /:id - Update feedback',
      'PATCH /:id/resolve - Mark feedback as resolved',
      'DELETE /:id - Delete feedback',
    ],
  },
  {
    path: '/api/v1/sessions',
    description: 'Exercise session routes',
    routes: [
      'POST / - Create exercise session',
      'GET /top - Get top sessions by score',
      'GET /recent - Get recent sessions',
      'GET /exercise/:exerciseId - Get sessions by exercise',
      'GET / - Get user sessions',
      'GET /:id/stats - Get session statistics',
      'GET /:id/progress - Get session progress',
      'GET /:id - Get session by ID',
      'PUT /:id - Update session',
      'DELETE /:id - Delete session',
    ],
  },
  {
    path: '/api/v1/videos',
    description: 'Video routes (optional)',
    routes: [
      'POST /upload - Upload video',
      'GET /session/:sessionId - Get videos for session',
      'GET /:id/url - Get video URL',
      'GET /:id/thumbnail - Get video thumbnail',
      'GET /:id - Get video metadata',
      'PUT /:id - Update video metadata',
      'DELETE /:id - Delete video',
    ],
  },
  {
    path: '/api/v1/goals',
    description: 'Fitness goals routes',
    routes: [
      'GET / - Get current user\'s fitness goals',
      'POST / - Create new fitness goals',
      'PUT / - Create or update goals (upsert)',
      'PUT /:id - Update existing goals',
      'DELETE /:id - Delete goals',
    ],
  },
];

// Export default function for mounting routes
export default mountRoutes;

// Named exports for flexibility
export { getRoutes, getRouteInfo };
