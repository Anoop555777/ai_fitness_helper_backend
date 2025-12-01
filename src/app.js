import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// Import constants
import { RATE_LIMIT, API_STATUS, HTTP_STATUS } from "./config/constants.js";

// Import route aggregator
import mountRoutes from "./routes/index.js";

// Import middleware
import globalErrorHandler from "./middleware/errorHandler.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { sanitizeRequest } from "./middleware/sanitization.js";
import {
  requestId,
  validateIp,
  securityHeaders,
  preventParameterPollution,
  validateRequestSize,
  validateHttpMethod,
  securityLogging,
} from "./middleware/security.js";

const app = express();

// ============================================
// SECURITY MIDDLEWARE - Applied in order
// ============================================

// 1. Request ID - Must be first for tracing
app.use(requestId);

// 2. Trust proxy - Important for accurate IP detection behind proxies/load balancers
app.set("trust proxy", 1);

// 3. Security Headers - Helmet for comprehensive security headers
// In production: Full CSP and security headers
// In development: Basic security headers (XSS protection enabled by default)
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Tailwind
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"], // Allow images from any HTTPS source
          connectSrc: [
            "'self'",
            process.env.FRONTEND_URL ||
              (process.env.NODE_ENV === "development"
                ? "http://localhost:3000"
                : "https://asb-ai-fitness-helper.vercel.app"),
          ],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for better compatibility
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests for cookies
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    })
  );
} else {
  // In development, use basic helmet config (XSS protection enabled by default)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP in dev to avoid conflicts with dev tools
      crossOriginEmbedderPolicy: false,
    })
  );
}

// 4. Additional security headers (complement Helmet)
app.use(securityHeaders);

// 5. IP validation and logging
app.use(validateIp);

// 6. CORS configuration
// In development, allow all origins for mobile testing
// In production, use specific frontend URL(s)
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV !== "production") {
    return process.env.FRONTEND_URL || "http://localhost:3000";
  }

  // Production: Support multiple frontend URLs
  const origins = [];

  // Add configured FRONTEND_URL if provided
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }

  // Add known production frontend URLs
  const knownFrontendUrls = [
    "https://ai-fitness-helper-frontend.vercel.app",
    "https://asb-ai-fitness-helper.vercel.app",
  ];

  origins.push(...knownFrontendUrls);

  // Remove duplicates and return
  return [...new Set(origins)];
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow all origins
    if (process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (Array.isArray(allowedOrigins)) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    } else if (origin === allowedOrigins) {
      return callback(null, true);
    }

    // Origin not allowed
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// 7. Cookie parser middleware (must be before body parsing)
app.use(cookieParser());

// 8. Body parsing middleware with size limits
app.use(express.json({ limit: "10mb" })); // Increased limit for video/pose data
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 9. Request size validation (additional check)
app.use(validateRequestSize);

// 10. HTTP method validation
app.use(validateHttpMethod);

// 11. Parameter pollution protection
app.use(preventParameterPollution);

// 12. Security: MongoDB sanitization and XSS protection
// Must be after body parsing to sanitize parsed data
app.use(sanitizeRequest);

// 13. Security logging (after sanitization to log clean data)
app.use(securityLogging);

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else if (process.env.NODE_ENV === "production") {
  // Use combined format in production for better logging
  app.use(morgan("combined"));
}

// 14. Rate limiting - Enable in production
// Note: Rate limiting should be applied early but after security middleware
if (process.env.NODE_ENV === "production") {
  app.use("/api/", rateLimiter);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Diagnostic endpoint for AI service configuration
app.get("/api/v1/diagnostics/ai", (req, res) => {
  const groqApiKeySet = !!process.env.GROQ_API_KEY;
  const groqApiKeyLength = process.env.GROQ_API_KEY
    ? process.env.GROQ_API_KEY.length
    : 0;
  const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const nodeEnv = process.env.NODE_ENV || "development";

  const diagnostics = {
    status: API_STATUS.SUCCESS,
    timestamp: new Date().toISOString(),
    aiService: {
      configured: isAIConfigured(),
      groqApiKey: {
        set: groqApiKeySet,
        length: groqApiKeyLength,
        preview: groqApiKeySet
          ? `${process.env.GROQ_API_KEY.substring(0, 10)}...`
          : null,
      },
      model: groqModel,
      environment: nodeEnv,
    },
    recommendations: [],
  };

  // Add recommendations
  if (!groqApiKeySet) {
    diagnostics.recommendations.push({
      severity: "error",
      message:
        "GROQ_API_KEY is not set. AI feedback enhancement will be disabled.",
      action:
        "Add GROQ_API_KEY to your environment variables in Render dashboard.",
    });
  } else if (!isAIConfigured()) {
    diagnostics.recommendations.push({
      severity: "warning",
      message:
        "AI service reports as not configured despite API key being set.",
      action:
        "Check AI service initialization in backend/src/services/aiService.js",
    });
  } else {
    diagnostics.recommendations.push({
      severity: "success",
      message: "AI service is properly configured and ready to use.",
    });
  }

  res.status(HTTP_STATUS.OK).json(diagnostics);
});

// Root endpoint
app.get("/", (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: "Fitness Form Helper API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      api: "/api/v1",
      auth: "/api/v1/auth",
      exercises: "/api/v1/exercises",
      sessions: "/api/v1/sessions",
      feedback: "/api/v1/feedback",
      videos: "/api/v1/videos",
      goals: "/api/v1/goals",
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount all API routes
mountRoutes(app);

// 404 handler for undefined routes
app.all("*", (req, res, next) => {
  const error = new Error(`Can't find ${req.originalUrl} on this server`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  error.status = API_STATUS.FAIL;
  next(error);
});

// Global error handler (must be last)
app.use(globalErrorHandler);

export default app;
