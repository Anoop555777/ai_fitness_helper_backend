import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../config.env') });

// Import models
import User from '../src/models/User.js';
import Exercise from '../src/models/Exercise.js';
import ExerciseSession from '../src/models/ExerciseSession.js';
import Feedback from '../src/models/Feedback.js';
import PoseData from '../src/models/PoseData.js';




// Database connection string
let DB = process.env.DATABASE?.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD || ''
) || process.env.DATABASE?.replace(
  '<password>',
  process.env.DATABASE_PASSWORD || ''
) || process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-form-helper';

// Ensure database name is included (fix trailing slash issue)
// If connection string ends with just /, add database name
if (DB.endsWith('/') && !DB.includes('?')) {
  DB = DB + 'fitness-form-helper';
} else if (DB.match(/@[^/]+$/)) {
  // If connection string ends with @cluster... (no database name), add it
  DB = DB + '/fitness-form-helper';
}

// Mongoose connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 10000, // Increased timeout
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  w: 'majority',
};

// Connection function
const connectDB = async () => {
  try {
    console.log('🔌 Attempting to connect to MongoDB...');
    console.log('📍 Connection string:', DB.replace(/:[^:@]+@/, ':****@')); // Hide password
    
    await mongoose.connect(DB, mongooseOptions);
    console.log('✅ Database connected successfully');
    return true;
  } catch (err) {
    console.error('\n❌ Database connection error:', err.message);
    console.error('\n🔍 Troubleshooting steps:');
    console.error('1. Verify IP whitelist in MongoDB Atlas:');
    console.error('   - Go to: https://cloud.mongodb.com/');
    console.error('   - Navigate to: Network Access → IP Access List');
    console.error('   - Ensure 0.0.0.0/0 is added and SAVED');
    console.error('   - Wait 2-3 minutes after adding/changing IP whitelist');
    console.error('2. Check your connection string in config.env:');
    console.error('   - Current format:', process.env.DATABASE?.replace(/:[^:@]+@/, ':****@') || 'Not set');
    console.error('   - Ensure DATABASE_PASSWORD is set correctly');
    console.error('3. Common issues:');
    console.error('   - VPN/Proxy may change your IP address');
    console.error('   - Cluster might be paused (check MongoDB Atlas dashboard)');
    console.error('   - Connection string format should be: mongodb+srv://user:pass@cluster.mongodb.net/dbname');
    
    if (err.message.includes('authentication')) {
      console.error('\n⚠️  Authentication error - check username and password');
    }
    if (err.message.includes('whitelist') || err.message.includes('IP')) {
      console.error('\n⚠️  IP Whitelist error - your IP may have changed');
      console.error('   Try: Remove and re-add 0.0.0.0/0 in MongoDB Atlas');
    }
    
    return false;
  }
};

// Read JSON files
const users = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'users.json'), 'utf-8')
);
const exercises = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'exercises.json'), 'utf-8')
);
const exerciseSessions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'exerciseSessions.json'), 'utf-8')
);
const feedbacks = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'feedbacks.json'), 'utf-8')
);
const poseData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'poseData.json'), 'utf-8')
);

// Helper function to replace placeholders in data
const replacePlaceholders = (data, replacements) => {
  const dataStr = JSON.stringify(data);
  let result = dataStr;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`"${placeholder}"`, 'g'), `"${value}"`);
  }
  return JSON.parse(result);
};

// Import data function
const importData = async () => {
  // Wait for database connection
  const connected = await connectDB();
  if (!connected) {
    console.error('\n❌ Cannot proceed without database connection');
    process.exit(1);
  }

  try {
    // Step 1: Import Users
    console.log('📥 Importing users...');
    const createdUsers = await User.create(users);
    const userIdMap = {};
    createdUsers.forEach((user, index) => {
      userIdMap[`{{USER_ID_${index + 1}}}`] = user._id.toString();
    });
    console.log(`✅ Imported ${createdUsers.length} users`);

    // Step 2: Import Exercises
    console.log('📥 Importing exercises...');
    const createdExercises = await Exercise.create(exercises);
    const exerciseIdMap = {};
    createdExercises.forEach((exercise, index) => {
      exerciseIdMap[`{{EXERCISE_ID_${index + 1}}}`] = exercise._id.toString();
    });
    console.log(`✅ Imported ${createdExercises.length} exercises`);

    // Step 3: Import ExerciseSessions (replace placeholders)
    console.log('📥 Importing exercise sessions...');
    const sessionsWithIds = exerciseSessions.map(session => 
      replacePlaceholders(session, { ...userIdMap, ...exerciseIdMap })
    );
    const createdSessions = await ExerciseSession.create(sessionsWithIds);
    const sessionIdMap = {};
    createdSessions.forEach((session, index) => {
      sessionIdMap[`{{SESSION_ID_${index + 1}}}`] = session._id.toString();
    });
    console.log(`✅ Imported ${createdSessions.length} exercise sessions`);

    // Step 4: Import Feedbacks (replace placeholders)
    console.log('📥 Importing feedbacks...');
    const feedbacksWithIds = feedbacks.map(feedback => 
      replacePlaceholders(feedback, sessionIdMap)
    );
    const createdFeedbacks = await Feedback.create(feedbacksWithIds);
    console.log(`✅ Imported ${createdFeedbacks.length} feedbacks`);

    // Step 5: Import PoseData (replace placeholders)
    console.log('📥 Importing pose data...');
    const poseDataWithIds = poseData.map(pose => 
      replacePlaceholders(pose, sessionIdMap)
    );
    const createdPoseData = await PoseData.create(poseDataWithIds);
    console.log(`✅ Imported ${createdPoseData.length} pose data entries`);

    console.log('\n✅ All data imported successfully!');
    console.log(`   - Users: ${createdUsers.length}`);
    console.log(`   - Exercises: ${createdExercises.length}`);
    console.log(`   - Exercise Sessions: ${createdSessions.length}`);
    console.log(`   - Feedbacks: ${createdFeedbacks.length}`);
    console.log(`   - Pose Data: ${createdPoseData.length}`);
  } catch (err) {
    console.error('❌ Error importing data:', err);
    if (err.errors) {
      console.error('Validation errors:', err.errors);
    }
  }
  process.exit();
};

// Delete data function (delete in reverse order to maintain referential integrity)
const deleteData = async () => {
  // Wait for database connection
  const connected = await connectDB();
  if (!connected) {
    console.error('\n❌ Cannot proceed without database connection');
    process.exit(1);
  }

  try {
    console.log('🗑️  Deleting all data...');
    
    // Delete in reverse order of dependencies
    const deletedPoseData = await PoseData.deleteMany();
    console.log(`✅ Deleted ${deletedPoseData.deletedCount} pose data entries`);
    
    const deletedFeedbacks = await Feedback.deleteMany();
    console.log(`✅ Deleted ${deletedFeedbacks.deletedCount} feedbacks`);
    
    const deletedSessions = await ExerciseSession.deleteMany();
    console.log(`✅ Deleted ${deletedSessions.deletedCount} exercise sessions`);
    
    const deletedExercises = await Exercise.deleteMany();
    console.log(`✅ Deleted ${deletedExercises.deletedCount} exercises`);
    
    const deletedUsers = await User.deleteMany();
    console.log(`✅ Deleted ${deletedUsers.deletedCount} users`);
    
    console.log('\n✅ All data deleted successfully!');
  } catch (err) {
    console.error('❌ Error deleting data:', err);
  }
  process.exit();
};

// Handle command line arguments
if (process.argv[2] === '--import') {
  importData();
} else if (process.argv[2] === '--delete') {
  deleteData();
} else {
  console.log('Usage: node import-data.js --import | --delete');
  process.exit(1);
}

