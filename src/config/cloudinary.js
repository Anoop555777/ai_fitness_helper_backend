import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import {
  CLOUDINARY_FOLDERS,
  CLOUDINARY_TRANSFORMATIONS,
  FILE_SIZE,
} from "./constants.js";

/**
 * Cloudinary Configuration
 *
 * Cloudinary setup for image and video storage/management.
 * This is optional - videos are only uploaded if explicitly requested.
 *
 * Environment Variables Required:
 * - CLOUDINARY_CLOUD_NAME: Your Cloudinary cloud name
 * - CLOUDINARY_API_KEY: Your Cloudinary API key
 * - CLOUDINARY_API_SECRET: Your Cloudinary API secret
 *
 * Optional:
 * - CLOUDINARY_FOLDER: Default folder for uploads (default: 'fitness-form-helper')
 * - CLOUDINARY_SECURE: Use HTTPS (default: true)
 */

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: process.env.CLOUDINARY_SECURE !== "false", // Default to true
});

// Default folder for uploads
const DEFAULT_FOLDER = process.env.CLOUDINARY_FOLDER || CLOUDINARY_FOLDERS.ROOT;

/**
 * Check if Cloudinary is properly configured
 * @returns {boolean} True if configuration is valid
 */
export const isConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder path in Cloudinary
 * @param {string} options.publicId - Public ID for the file (optional)
 * @param {string} options.resourceType - 'image' or 'video' (default: 'auto')
 * @param {string} options.format - File format (optional)
 * @param {Object} options.transformation - Transformation options (optional)
 * @param {boolean} options.overwrite - Overwrite existing file (default: false)
 * @param {Object} options.tags - Tags for the file (optional)
 * @returns {Promise<Object>} Upload result with URL, public_id, etc.
 */
export const uploadFile = async (fileBuffer, options = {}) => {
  if (!isConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET"
    );
  }

  const {
    folder = DEFAULT_FOLDER,
    publicId,
    resourceType = "auto",
    format,
    transformation,
    overwrite = false,
    tags,
  } = options;

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      resource_type: resourceType,
      overwrite,
      ...(publicId && { public_id: publicId }),
      ...(format && { format }),
      ...(transformation && { transformation: transformation }),
      ...(tags && { tags: Array.isArray(tags) ? tags.join(",") : tags }),
    };

    // Convert buffer to stream
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );

    // Create readable stream from buffer
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Upload an image file
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
export const uploadImage = async (imageBuffer, options = {}) => {
  return uploadFile(imageBuffer, {
    ...options,
    resourceType: "image",
  });
};

/**
 * Upload a video file
 * @param {Buffer} videoBuffer - Video buffer
 * @param {Object} options - Upload options
 * @param {number} options.chunkSize - Chunk size for large uploads (default: 7MB)
 * @returns {Promise<Object>} Upload result
 */
export const uploadVideo = async (videoBuffer, options = {}) => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const {
    folder = DEFAULT_FOLDER,
    publicId,
    overwrite = false,
    tags,
    chunkSize = FILE_SIZE.VIDEO_CHUNK_SIZE,
  } = options;

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      resource_type: "video",
      overwrite,
      chunk_size: chunkSize,
      ...(publicId && { public_id: publicId }),
      ...(tags && { tags: Array.isArray(tags) ? tags.join(",") : tags }),
    };

    // Convert buffer to stream for upload
    const bufferStream = new Readable();
    bufferStream.push(videoBuffer);
    bufferStream.push(null);

    // Use upload_stream for streaming video uploads (works with buffers)
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary video upload failed: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );

    // Pipe the buffer stream to the upload stream
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Public ID of the file to delete
 * @param {string} resourceType - 'image' or 'video' (default: 'auto')
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFile = async (publicId, resourceType = "auto") => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: resourceType },
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary deletion failed: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );
  });
};

/**
 * Generate a transformed URL for an image
 * @param {string} publicId - Public ID of the image
 * @param {Object} transformations - Transformation options
 * @param {number} transformations.width - Image width
 * @param {number} transformations.height - Image height
 * @param {string} transformations.crop - Crop mode (fill, fit, scale, etc.)
 * @param {string} transformations.format - Output format (auto, webp, jpg, etc.)
 * @param {number} transformations.quality - Quality (auto, auto:good, auto:best, or 1-100)
 * @param {string} transformations.gravity - Gravity for cropping (face, center, etc.)
 * @returns {string} Transformed URL
 */
export const getImageUrl = (publicId, transformations = {}) => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const {
    width,
    height,
    crop = "fill",
    format = "auto",
    quality = "auto",
    gravity = "auto",
  } = transformations;

  return cloudinary.url(publicId, {
    resource_type: "image",
    width,
    height,
    crop,
    fetch_format: format,
    quality,
    gravity,
  });
};

/**
 * Generate a transformed URL for a video
 * @param {string} publicId - Public ID of the video
 * @param {Object} transformations - Transformation options
 * @param {number} transformations.width - Video width
 * @param {number} transformations.height - Video height
 * @param {string} transformations.crop - Crop mode
 * @param {string} transformations.format - Output format (mp4, webm, etc.)
 * @param {number} transformations.quality - Quality
 * @param {number} transformations.startOffset - Start time in seconds
 * @param {number} transformations.duration - Duration in seconds
 * @returns {string} Transformed URL
 */
export const getVideoUrl = (publicId, transformations = {}) => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const {
    width,
    height,
    crop = "fill",
    format = "mp4",
    quality = "auto",
    startOffset,
    duration,
  } = transformations;

  return cloudinary.url(publicId, {
    resource_type: "video",
    width,
    height,
    crop,
    format,
    quality,
    ...(startOffset && { start_offset: startOffset }),
    ...(duration && { duration }),
  });
};

/**
 * Generate a thumbnail URL from a video
 * @param {string} publicId - Public ID of the video
 * @param {Object} options - Thumbnail options
 * @param {number} options.width - Thumbnail width (default: 300)
 * @param {number} options.height - Thumbnail height (default: 300)
 * @param {number} options.timeOffset - Time offset in seconds (default: 1)
 * @param {string} options.format - Format (default: 'jpg')
 * @returns {string} Thumbnail URL
 */
export const getVideoThumbnail = (publicId, options = {}) => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  const { width = 300, height = 300, timeOffset = 1, format = "jpg" } = options;

  return cloudinary.url(publicId, {
    resource_type: "video",
    width,
    height,
    crop: "fill",
    format,
    start_offset: timeOffset,
  });
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null if invalid
 */
export const extractPublicId = (url) => {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {

    // Remove query parameters and hash
    const cleanUrl = url.split('?')[0].split('#')[0];

    // Pattern to match Cloudinary URL structure:
    // https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{optional_version}/{path_with_public_id}.{ext}
    // Examples:
    // - https://res.cloudinary.com/demo/video/upload/v1234567890/folder/public_id.mp4
    // - https://res.cloudinary.com/demo/video/upload/folder/public_id.mp4
    // - https://res.cloudinary.com/demo/video/upload/c_fill,w_300/folder/public_id.mp4
    
    // Try multiple patterns in order of specificity
    
    // Pattern 1: Standard Cloudinary URL with resource_type
    let match = cleanUrl.match(/res\.cloudinary\.com\/[^\/]+\/(?:image|video)\/upload\/(?:v\d+\/)?(.+?)(?:\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi|mkv|m3u8))$/i);
    
    // Pattern 2: Without explicit resource_type (some URLs don't have it)
    if (!match) {
      match = cleanUrl.match(/res\.cloudinary\.com\/[^\/]+\/upload\/(?:v\d+\/)?(.+?)(?:\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi|mkv|m3u8))$/i);
    }
    
    // Pattern 3: Just match /upload/ pattern (fallback)
    if (!match) {
      match = cleanUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi|mkv|m3u8))$/i);
    }

    if (match && match[1]) {
      let publicIdPath = match[1].trim();
      
      if (!publicIdPath) {
        return null;
      }

      // Split into parts to handle transformations
      const parts = publicIdPath.split('/');
      
      // Transformations typically follow patterns like: c_fill, w_300, h_200, q_auto, etc.
      // They contain underscore and are typically short segments
      // Public ID parts are usually longer and may contain folder structures
      
      // Find where transformations end (if any)
      let startIndex = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // Check if this looks like a transformation (short, contains underscore, matches transformation pattern)
        // Transformation pattern: typically 1-2 letters + underscore + value (e.g., c_fill, w_300, q_auto)
        const isTransformation = /^[a-z]{1,3}_[a-z0-9_]+$/i.test(part);
        if (!isTransformation && part.length > 3) {
          // This is likely the start of the public_id (folder or filename)
          startIndex = i;
          break;
        }
      }

      // Get the public ID (everything from startIndex onwards)
      const publicIdParts = parts.slice(startIndex);
      
      if (publicIdParts.length === 0) {
        return null;
      }

      const publicId = publicIdParts.join('/');
      return publicId;
    }

    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Get file information from Cloudinary
 * @param {string} publicId - Public ID of the file
 * @param {string} resourceType - 'image' or 'video' (default: 'auto')
 * @returns {Promise<Object>} File information
 */
export const getFileInfo = async (publicId, resourceType = "auto") => {
  if (!isConfigured()) {
    throw new Error("Cloudinary is not configured");
  }

  return new Promise((resolve, reject) => {
    cloudinary.api.resource(
      publicId,
      { resource_type: resourceType },
      (error, result) => {
        if (error) {
          reject(new Error(`Failed to get file info: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );
  });
};

/**
 * Upload options for exercise images
 */
export const EXERCISE_IMAGE_OPTIONS = {
  folder: CLOUDINARY_FOLDERS.EXERCISES,
  transformation: CLOUDINARY_TRANSFORMATIONS.EXERCISE_IMAGE,
  tags: ["exercise", "fitness"],
};

/**
 * Upload options for session videos
 */
export const SESSION_VIDEO_OPTIONS = {
  folder: CLOUDINARY_FOLDERS.VIDEOS,
  chunkSize: FILE_SIZE.VIDEO_CHUNK_SIZE,
  tags: ["session", "video", "fitness"],
};

/**
 * Upload options for user avatars
 */
export const AVATAR_IMAGE_OPTIONS = {
  folder: CLOUDINARY_FOLDERS.AVATARS,
  transformation: CLOUDINARY_TRANSFORMATIONS.AVATAR,
  tags: ["avatar", "profile"],
};

// Export cloudinary instance for advanced usage
export { cloudinary };

// Default export
export default {
  isConfigured,
  uploadFile,
  uploadImage,
  uploadVideo,
  deleteFile,
  getImageUrl,
  getVideoUrl,
  getVideoThumbnail,
  extractPublicId,
  getFileInfo,
  cloudinary,
  EXERCISE_IMAGE_OPTIONS,
  SESSION_VIDEO_OPTIONS,
  AVATAR_IMAGE_OPTIONS,
};
