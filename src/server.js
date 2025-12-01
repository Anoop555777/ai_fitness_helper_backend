// IMPORTANT: Load environment variables FIRST before any other imports
import './config/loadEnv.js';

import mongoose from 'mongoose';
import http from 'http';
import app from './app.js';

// Handle uncaught exceptions (synchronous errors)
process.on('uncaughtException', (err) => {
  process.exit(1);
});

// Debug: Log database connection string (remove in production)
// console.log(process.env.DATABASE);

// Create HTTP server
const server = http.createServer(app);

// MongoDB connection string
const DB = process.env.DATABASE?.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD || ''
) || process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-form-helper';


// Mongoose connection options (best practices)
const mongooseOptions = {
  // Modern options
  serverSelectionTimeoutMS: 10000, // Increased timeout for server selection
  socketTimeoutMS: 45000, // How long to wait for socket operations
  connectTimeoutMS: 10000, // How long to wait for initial connection
  maxPoolSize: 10, // Maximum number of connections in the connection pool
  minPoolSize: 1, // Minimum number of connections in the connection pool
  maxIdleTimeMS: 60000, // Increased to 60 seconds - close connections after inactivity
  retryWrites: true, // Retry write operations on network errors
  w: 'majority', // Write concern: wait for majority of replicas
  heartbeatFrequencyMS: 10000, // How often to check connection health
};

// Track connection state to prevent duplicate connection attempts
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

/**
 * Connect to MongoDB with retry logic
 */
const connectDB = async () => {
  if (isConnecting) {
    return; // Already attempting to connect
  }

  if (mongoose.connection.readyState === 1) {
    return; // Already connected
  }

  isConnecting = true;

  try {
    await mongoose.connect(DB, mongooseOptions);
    reconnectAttempts = 0; // Reset on successful connection
    isConnecting = false;
  } catch (err) {
    isConnecting = false;
    
    // Only attempt reconnection if we haven't exceeded max attempts
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(connectDB, RECONNECT_DELAY);
    }
  }
};

// Initial connection
connectDB();

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  reconnectAttempts = 0; // Reset on successful connection
});

mongoose.connection.on('error', (err) => {
  isConnecting = false;
});

mongoose.connection.on('disconnected', () => {
  isConnecting = false;
  
  // Attempt to reconnect if not already connecting and within max attempts
  if (!isConnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    setTimeout(connectDB, RECONNECT_DELAY);
  }
});

// Handle reconnection on connection loss
mongoose.connection.on('reconnected', () => {
  reconnectAttempts = 0;
});

// Handle process termination (SIGTERM and SIGINT)
const gracefulShutdown = (signal) => {
  // Stop accepting new connections
  server.close(() => {
    // Close MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      mongoose.connection.close(false, () => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Server port
const PORT = process.env.PORT || 8000;
// Bind to 0.0.0.0 in production/cloud environments to allow external connections
// Use localhost only in local development
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Handle unhandled promise rejections (asynchronous errors)
process.on('unhandledRejection', (err) => {
  // Close server gracefully
  server.close(() => {
    process.exit(1);
  });
});

// Optional: Socket.io setup (uncomment if needed)
// import { Server } from 'socket.io';
// const io = new Server(server, {
//   cors: {
//     origin: process.env.FRONTEND_URL || 'http://localhost:5173',
//     credentials: true,
//   },
// });
// io.on('connection', (socket) => {
//   console.log('Socket connected:', socket.id);
// });

export default server;
