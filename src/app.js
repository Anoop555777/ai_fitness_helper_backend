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

const app = express();

// Security middleware (only in production to avoid dev tool conflicts)
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Tailwind
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"], // Allow images from any HTTPS source
          connectSrc: ["'self'", process.env.FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for better compatibility
    })
  );
}

// CORS configuration
// In development, allow all origins for mobile testing
// In production, use specific frontend URL
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? process.env.FRONTEND_URL || "https://asb-ai-fitness-helper.vercel.app"
      : true, // Allow all origins in development for mobile access
  credentials: true,
};

app.use(cors(corsOptions));

// Cookie parser middleware (must be before body parsing)
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: "10mb" })); // Increased limit for video/pose data
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else if (process.env.NODE_ENV === "production") {
  // Use combined format in production for better logging
  app.use(morgan("combined"));
}

// Rate limiting - Enable in production
if (process.env.NODE_ENV === "production") {
  app.use('/api/', rateLimiter);
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: API_STATUS.SUCCESS,
    message: "Server is running",
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
