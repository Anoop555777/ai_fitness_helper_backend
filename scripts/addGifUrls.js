/**
 * Add GIF URLs to Exercises
 *
 * This script searches for exercise GIFs and updates exercises.json
 * Uses GIPHY API and common GIF sources
 *
 * Usage:
 * node scripts/addGifUrls.js
 *
 * Or with GIPHY API key (optional, for better results):
 * GIPHY_API_KEY=your_key node scripts/addGifUrls.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXERCISES_FILE = path.join(__dirname, "../dev-data/exercises.json");
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || "dc6zaTOxFJmzC"; // Public beta key

/**
 * Exercise name mappings for better GIF search
 * Maps exercise names to better search terms
 */
const EXERCISE_SEARCH_MAP = {
  "Push-up": "pushup",
  "Pull-up": "pullup",
  "Bicep Curl": "bicep curl",
  "Tricep Dip": "tricep dip",
  "Calf Raise": "calf raise",
  "Russian Twist": "russian twist",
  "Mountain Climber": "mountain climber",
  "Jumping Jacks": "jumping jacks",
  "Box Jump": "box jump",
  "Dead Bug Hold": "dead bug",
  "Glute Bridge Hold": "glute bridge",
  "Single Leg Glute Bridge Hold": "single leg glute bridge",
  "Wall Handstand Hold": "wall handstand",
  "Forearm Plank": "forearm plank",
  "High Plank Hold": "high plank",
  "Dumbbell Shoulder Press": "dumbbell shoulder press",
  "Dumbbell Bench Press": "dumbbell bench press",
  "Dumbbell Squat": "dumbbell squat",
  "Dumbbell Lunge": "dumbbell lunge",
  "Dumbbell Romanian Deadlift": "dumbbell romanian deadlift",
  "Dumbbell Fly": "dumbbell fly",
  "Dumbbell Lateral Raise": "dumbbell lateral raise",
  "Dumbbell Front Raise": "dumbbell front raise",
  "Dumbbell Tricep Extension": "dumbbell tricep extension",
  "Dumbbell Hammer Curl": "dumbbell hammer curl",
  "Dumbbell Goblet Squat": "goblet squat",
  "Dumbbell Step-up": "dumbbell step up",
  "Dumbbell Pullover": "dumbbell pullover",
  "Dumbbell Shrug": "dumbbell shrug",
  "Dumbbell Reverse Fly": "dumbbell reverse fly",
  "Dumbbell Calf Raise": "dumbbell calf raise",
  "Dumbbell Overhead Tricep Extension": "overhead tricep extension",
  "Dumbbell Arnold Press": "arnold press",
};

/**
 * Search GIPHY for exercise GIF
 */
async function searchGiphy(exerciseName) {
  try {
    // Use search map for better results
    const searchTerm = EXERCISE_SEARCH_MAP[exerciseName] || exerciseName;
    const query = `${searchTerm} exercise workout form`;

    const response = await axios.get("https://api.giphy.com/v1/gifs/search", {
      params: {
        api_key: GIPHY_API_KEY,
        q: query,
        limit: 5, // Get more results to find best match
        rating: "g",
        lang: "en",
      },
      timeout: 10000,
    });

    if (response.data?.data?.length > 0) {
      // Try to find the best match (prefer "exercise" or "workout" in title)
      const gifs = response.data.data;
      const bestMatch =
        gifs.find(
          (gif) =>
            gif.title?.toLowerCase().includes("exercise") ||
            gif.title?.toLowerCase().includes("workout") ||
            gif.title?.toLowerCase().includes(searchTerm.toLowerCase())
        ) || gifs[0];

      // Prefer fixed_height_downsampled for better quality/size balance
      return (
        bestMatch.images?.fixed_height_downsampled?.url ||
        bestMatch.images?.downsized_large?.url ||
        bestMatch.images?.downsized?.url ||
        bestMatch.images?.original?.url
      );
    }
  } catch (error) {
    console.log(`  GIPHY search failed: ${error.message}`);
  }
  return null;
}

/**
 * Get GIF URL from Tenor (alternative source)
 */
async function searchTenor(exerciseName) {
  try {
    const query = `${exerciseName} exercise`;
    const response = await axios.get("https://g.tenor.com/v1/search", {
      params: {
        q: query,
        key: "LIVDSRZULELA", // Public API key
        limit: 1,
        media_filter: "basic",
      },
      timeout: 5000,
    });

    if (response.data?.results?.length > 0) {
      const gif = response.data.results[0];
      return gif.media?.[0]?.gif?.url || gif.media?.[0]?.tinygif?.url;
    }
  } catch (error) {
    console.log(`Tenor search failed for ${exerciseName}: ${error.message}`);
  }
  return null;
}

/**
 * Generate GIF URL from exercise name
 * Uses common patterns and fallback sources
 */
function generateGifUrl(exerciseName) {
  // Try curated map first
  if (EXERCISE_GIF_MAP[exerciseName]) {
    return EXERCISE_GIF_MAP[exerciseName];
  }

  // Generate URL based on exercise name pattern
  const slug = exerciseName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Common GIF hosting patterns (these would need to be replaced with actual URLs)
  return null; // Will be filled by API search
}

/**
 * Process all exercises and add GIF URLs
 */
async function processExercises() {
  try {
    const exercises = JSON.parse(fs.readFileSync(EXERCISES_FILE, "utf8"));
    let updated = 0;
    let skipped = 0;

    console.log(`Processing ${exercises.length} exercises...\n`);

    for (const exercise of exercises) {
      const exerciseName = exercise.name;
      const demo = exercise.demonstration || {};

      // Skip if GIF URL already exists
      if (demo.gifUrl && demo.gifUrl.startsWith("http")) {
        console.log(`✓ ${exerciseName} - Already has GIF URL`);
        skipped++;
        continue;
      }

      console.log(`Searching for GIF: ${exerciseName}...`);

      // Try GIPHY first
      let gifUrl = await searchGiphy(exerciseName);

      // Fallback to Tenor
      if (!gifUrl) {
        gifUrl = await searchTenor(exerciseName);
      }

      // Generate placeholder note if no GIF found
      if (!gifUrl) {
        console.log(`  ⚠️  No GIF found - you may need to add manually`);
        // Optionally create a placeholder URL structure
        // gifUrl = `https://placeholder-for-${exerciseName.toLowerCase().replace(/\s+/g, '-')}.gif`;
      }

      if (gifUrl) {
        // Initialize demonstration object if needed
        if (!exercise.demonstration) {
          exercise.demonstration = {};
        }

        exercise.demonstration.gifUrl = gifUrl;
        updated++;
        console.log(
          `✓ ${exerciseName} - GIF URL added: ${gifUrl.substring(0, 50)}...`
        );
      } else {
        console.log(`✗ ${exerciseName} - No GIF found`);
      }

      // Small delay to avoid rate limiting (GIPHY allows 42 requests/hour on free tier)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Save updated exercises
    fs.writeFileSync(EXERCISES_FILE, JSON.stringify(exercises, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`✅ Updated: ${updated} exercises`);
    console.log(`⏭️  Skipped: ${skipped} exercises (already have GIFs)`);
    console.log(`📝 File saved: ${EXERCISES_FILE}`);
  } catch (error) {
    console.error("Error processing exercises:", error.message);
    process.exit(1);
  }
}

// Run script
processExercises();
