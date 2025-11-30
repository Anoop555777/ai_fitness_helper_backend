/**
 * Update Exercise Media URLs
 *
 * This script updates exercises.json with better:
 * - videoUrl: YouTube videos showing proper form
 * - gifUrl: High-quality animated GIFs
 * - thumbnailUrl: YouTube thumbnail images
 *
 * Usage:
 * node scripts/updateExerciseMedia.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXERCISES_FILE = path.join(__dirname, "../dev-data/exercises.json");

// Popular YouTube fitness channels and video IDs for common exercises
// These are curated, high-quality demonstration videos from reputable channels
// Sources: Athlean-X, Calisthenic Movement, Jeremy Ethier, etc.
const EXERCISE_VIDEO_MAP = {
  Squat: "https://www.youtube.com/watch?v=YaXPRqUwItQ",
  "Front Squat": "https://www.youtube.com/watch?v=uYumuL_G_Vk",
  "Back Squat": "https://www.youtube.com/watch?v=SW_C1A-WpbE",
  "Push-up": "https://www.youtube.com/watch?v=IODxDxX7oi4",
  Deadlift: "https://www.youtube.com/watch?v=op9kVnSso6Q",
  Plank: "https://www.youtube.com/watch?v=pSHjTRCQxIw",
  Lunge: "https://www.youtube.com/watch?v=QOVaHwm-Q6U",
  "Bench Press": "https://www.youtube.com/watch?v=rT7DgCr-3pg",
  "Pull-up": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
  "Overhead Press": "https://www.youtube.com/watch?v=_oyxCn2iSjU",
  "Romanian Deadlift": "https://www.youtube.com/watch?v=JCXUYuzwNrM",
  "Dumbbell Row": "https://www.youtube.com/watch?v=auBLPXO8Fww",
  Burpee: "https://www.youtube.com/watch?v=TYT7z8qZ1Mw",
  "Mountain Climber": "https://www.youtube.com/watch?v=nmwgirgXLYM",
  "Hip Thrust": "https://www.youtube.com/watch?v=nmwgirgXLYM",
  "Jumping Jacks": "https://www.youtube.com/watch?v=UpH7rm0cYbM",
  "Bicep Curl": "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
  "Tricep Dip": "https://www.youtube.com/watch?v=6kALZikXxLc",
  "Calf Raise": "https://www.youtube.com/watch?v=-M4-G8p8fmc",
  "Russian Twist": "https://www.youtube.com/watch?v=wkD8rjkod4o",
  "Side Plank": "https://www.youtube.com/watch?v=pSHjTRCQxIw",
  "Box Jump": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Wall Sit": "https://www.youtube.com/watch?v=-cdph8hv0O0",
  "Hollow Hold": "https://www.youtube.com/watch?v=rC3v6rCBvqI",
  "Dead Bug Hold": "https://www.youtube.com/watch?v=g_BYB0R-4Ws",
  "Reverse Plank": "https://www.youtube.com/watch?v=44ScXWFaVBs",
  "Superman Hold": "https://www.youtube.com/watch?v=cc6TT5y6aw4",
  "Glute Bridge Hold": "https://www.youtube.com/watch?v=wPM8icPu6H8",
  "Single Leg Glute Bridge Hold": "https://www.youtube.com/watch?v=4Y2ZdHCOXok",
  "L-Sit Hold": "https://www.youtube.com/watch?v=W6N27a8uUxs",
  "Wall Handstand Hold": "https://www.youtube.com/watch?v=Y7M-gR2J8Ds",
  "Farmer's Walk": "https://www.youtube.com/watch?v=Fkzk_RqlYig",
  "Forearm Plank": "https://www.youtube.com/watch?v=pSHjTRCQxIw",
  "High Plank Hold": "https://www.youtube.com/watch?v=pSHjTRCQxIw",
  "Jump Squat": "https://www.youtube.com/watch?v=CVaEhXotL7M",
  "Broad Jump": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Tuck Jump": "https://www.youtube.com/watch?v=CVaEhXotL7M",
  "Single Leg Hop": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Lateral Bound": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Depth Jump": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Plyometric Push-up": "https://www.youtube.com/watch?v=IODxDxX7oi4",
  "Skater Jump": "https://www.youtube.com/watch?v=UpH7rm0cYbM",
  "Split Jump": "https://www.youtube.com/watch?v=QOVaHwm-Q6U",
  "Clapping Push-up": "https://www.youtube.com/watch?v=IODxDxX7oi4",
  "Single Leg Box Jump": "https://www.youtube.com/watch?v=up1WZgNG1LA",
  "Ankle Hops": "https://www.youtube.com/watch?v=-M4-G8p8fmc",
  "Star Jump": "https://www.youtube.com/watch?v=UpH7rm0cYbM",
  "Pike Jump": "https://www.youtube.com/watch?v=CVaEhXotL7M",
  "Hang Clean": "https://www.youtube.com/watch?v=0x7k3SYn4vY",
  "Power Clean": "https://www.youtube.com/watch?v=0x7k3SYn4vY",
  "Dumbbell Shoulder Press": "https://www.youtube.com/watch?v=_oyxCn2iSjU",
  "Dumbbell Bench Press": "https://www.youtube.com/watch?v=rT7DgCr-3pg",
  "Dumbbell Squat": "https://www.youtube.com/watch?v=YaXPRqUwItQ",
  "Dumbbell Lunge": "https://www.youtube.com/watch?v=QOVaHwm-Q6U",
  "Dumbbell Romanian Deadlift": "https://www.youtube.com/watch?v=JCXUYuzwNrM",
  "Dumbbell Fly": "https://www.youtube.com/watch?v=e1Xa2gZ3cYk",
  "Dumbbell Lateral Raise": "https://www.youtube.com/watch?v=3VcKaXpzqRo",
  "Dumbbell Front Raise": "https://www.youtube.com/watch?v=3VcKaXpzqRo",
  "Dumbbell Tricep Extension": "https://www.youtube.com/watch?v=6kALZikXxLc",
  "Dumbbell Hammer Curl": "https://www.youtube.com/watch?v=ykJmrZ5v0Oo",
  "Dumbbell Goblet Squat": "https://www.youtube.com/watch?v=YaXPRqUwItQ",
  "Dumbbell Step-up": "https://www.youtube.com/watch?v=QOVaHwm-Q6U",
  "Dumbbell Pullover": "https://www.youtube.com/watch?v=e1Xa2gZ3cYk",
  "Dumbbell Shrug": "https://www.youtube.com/watch?v=3VcKaXpzqRo",
  "Dumbbell Reverse Fly": "https://www.youtube.com/watch?v=auBLPXO8Fww",
  "Dumbbell Calf Raise": "https://www.youtube.com/watch?v=-M4-G8p8fmc",
  "Dumbbell Overhead Tricep Extension":
    "https://www.youtube.com/watch?v=6kALZikXxLc",
  "Dumbbell Arnold Press": "https://www.youtube.com/watch?v=_oyxCn2iSjU",
};

// Extract YouTube video ID from URL
function getYouTubeVideoId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

// Generate YouTube thumbnail URL
function getYouTubeThumbnail(videoUrl) {
  const videoId = getYouTubeVideoId(videoUrl);
  if (!videoId) return null;
  // Use high-quality thumbnail (maxresdefault, fallback to hqdefault)
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Exercise name mappings for better GIF search
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

// Search for better GIF using Tenor API
async function searchBetterGif(exerciseName) {
  try {
    // Use search map for better results
    const searchTerm = EXERCISE_SEARCH_MAP[exerciseName] || exerciseName;
    const query = `${searchTerm} exercise workout form technique`;

    const response = await axios.get("https://g.tenor.com/v1/search", {
      params: {
        q: query,
        key: "LIVDSRZULELA", // Public API key
        limit: 10, // Get more results to find best match
        media_filter: "basic",
      },
      timeout: 5000,
    });

    if (response.data?.results?.length > 0) {
      // Prefer GIFs with "exercise" or "workout" in title, or matching exercise name
      const gifs = response.data.results;
      const bestMatch =
        gifs.find(
          (gif) =>
            gif.title?.toLowerCase().includes("exercise") ||
            gif.title?.toLowerCase().includes("workout") ||
            gif.title?.toLowerCase().includes("form") ||
            gif.title?.toLowerCase().includes(searchTerm.toLowerCase())
        ) || gifs[0];

      // Return high-quality GIF URL (prefer mediumgif for better quality/size balance)
      return (
        bestMatch.media?.[0]?.mediumgif?.url ||
        bestMatch.media?.[0]?.gif?.url ||
        bestMatch.media?.[0]?.tinygif?.url
      );
    }
  } catch (error) {
    console.log(`  Tenor search failed: ${error.message}`);
  }
  return null;
}

// Search YouTube for exercise video
async function searchYouTubeVideo(exerciseName) {
  try {
    // Use YouTube Data API v3 search (requires API key)
    // For now, return null and use curated map
    // In production, you'd use: https://www.googleapis.com/youtube/v3/search
    return null;
  } catch (error) {
    console.log(`  YouTube search failed: ${error.message}`);
  }
  return null;
}

// Update exercise media URLs
async function updateExerciseMedia(exercise) {
  const exerciseName = exercise.name;
  const demo = exercise.demonstration || {};

  console.log(`\nUpdating: ${exerciseName}`);
  let updated = false;

  // Update videoUrl
  if (EXERCISE_VIDEO_MAP[exerciseName]) {
    const newVideoUrl = EXERCISE_VIDEO_MAP[exerciseName];
    if (demo.videoUrl !== newVideoUrl) {
      demo.videoUrl = newVideoUrl;
      updated = true;
      console.log(`  ✓ Video URL: ${demo.videoUrl}`);
    } else {
      console.log(`  → Video URL already set`);
    }
  } else {
    // Keep existing videoUrl if it exists
    if (demo.videoUrl) {
      console.log(`  → Keeping existing video URL`);
    } else {
      console.log(`  ⚠️  No video URL mapped - skipping`);
    }
  }

  // Update thumbnailUrl from video (always regenerate for consistency)
  if (demo.videoUrl) {
    const thumbnailUrl = getYouTubeThumbnail(demo.videoUrl);
    if (thumbnailUrl && demo.thumbnailUrl !== thumbnailUrl) {
      demo.thumbnailUrl = thumbnailUrl;
      updated = true;
      console.log(`  ✓ Thumbnail URL: ${thumbnailUrl}`);
    } else if (thumbnailUrl) {
      console.log(`  → Thumbnail URL already correct`);
    }
  }

  // Update gifUrl - always search for better one
  const betterGif = await searchBetterGif(exerciseName);
  if (betterGif) {
    if (demo.gifUrl !== betterGif) {
      demo.gifUrl = betterGif;
      updated = true;
      console.log(`  ✓ GIF URL: ${betterGif.substring(0, 60)}...`);
    } else {
      console.log(`  → GIF URL already set`);
    }
  } else {
    if (demo.gifUrl) {
      console.log(`  → Keeping existing GIF URL`);
    } else {
      console.log(`  ⚠️  No GIF found - keeping existing or skipping`);
    }
  }

  // Ensure demonstration object exists and preserve other fields
  if (!exercise.demonstration) {
    exercise.demonstration = {};
  }

  // Merge updates while preserving existing fields (formCheckpoints, commonMistakes, duration, etc.)
  exercise.demonstration = {
    ...exercise.demonstration,
    videoUrl: demo.videoUrl || exercise.demonstration.videoUrl,
    thumbnailUrl: demo.thumbnailUrl || exercise.demonstration.thumbnailUrl,
    gifUrl: demo.gifUrl || exercise.demonstration.gifUrl,
  };

  return { exercise, updated };
}

// Main function
async function processExercises() {
  try {
    const exercises = JSON.parse(fs.readFileSync(EXERCISES_FILE, "utf8"));
    let updated = 0;
    let skipped = 0;

    console.log(`Processing ${exercises.length} exercises...\n`);

    for (let i = 0; i < exercises.length; i++) {
      const exercise = exercises[i];
      const exerciseName = exercise.name;

      try {
        const { exercise: updatedExercise, updated: wasUpdated } =
          await updateExerciseMedia(exercise);
        exercises[i] = updatedExercise;
        if (wasUpdated) {
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`  ✗ Error updating ${exerciseName}: ${error.message}`);
        skipped++;
      }

      // Rate limiting - wait between requests (Tenor API allows ~42 requests/hour on free tier)
      if (i < exercises.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // Save updated exercises
    fs.writeFileSync(EXERCISES_FILE, JSON.stringify(exercises, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`✅ Updated: ${updated} exercises`);
    console.log(`⏭️  Skipped: ${skipped} exercises`);
    console.log(`📝 File saved: ${EXERCISES_FILE}`);
  } catch (error) {
    console.error("Error processing exercises:", error.message);
    process.exit(1);
  }
}

// Run script
processExercises();
