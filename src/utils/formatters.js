/**
 * Data Formatting Utilities
 * 
 * Collection of utility functions for formatting various data types
 * used throughout the application (durations, dates, scores, angles, etc.)
 */

// ============================================
// DURATION FORMATTING
// ============================================

/**
 * Format duration in seconds to minutes (rounded to 2 decimal places)
 * @param {number} seconds - Duration in seconds
 * @returns {number} Duration in minutes
 * @example
 * formatDurationToMinutes(90) // Returns 1.5
 * formatDurationToMinutes(125) // Returns 2.08
 */
export const formatDurationToMinutes = (seconds) => {
  if (typeof seconds !== 'number' || seconds < 0) {
    return 0;
  }
  return Math.round((seconds / 60) * 100) / 100;
};

/**
 * Format duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "05:30", "1:23:45")
 * @example
 * formatDurationMMSS(90) // Returns "1:30"
 * formatDurationMMSS(3665) // Returns "1:01:05"
 */
export const formatDurationMMSS = (seconds) => {
  if (typeof seconds !== 'number' || seconds < 0) {
    return '0:00';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Human-readable duration (e.g., "5 minutes", "1 hour 30 minutes")
 * @example
 * formatDurationHuman(90) // Returns "1 minute 30 seconds"
 * formatDurationHuman(3665) // Returns "1 hour 1 minute 5 seconds"
 */
export const formatDurationHuman = (seconds) => {
  if (typeof seconds !== 'number' || seconds < 0) {
    return '0 seconds';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
  }

  return parts.join(' ');
};

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format date to ISO string
 * @param {Date|string|number} date - Date to format
 * @returns {string} ISO formatted date string
 * @example
 * formatDateISO(new Date()) // Returns "2024-01-15T10:30:00.000Z"
 */
export const formatDateISO = (date) => {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return null;
  return dateObj.toISOString();
};

/**
 * Format date to readable string
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeTime - Include time in output (default: true)
 * @returns {string} Formatted date string
 * @example
 * formatDateReadable(new Date()) // Returns "January 15, 2024 at 10:30 AM"
 * formatDateReadable(new Date(), { includeTime: false }) // Returns "January 15, 2024"
 */
export const formatDateReadable = (date, options = {}) => {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return null;

  const { includeTime = true } = options;
  const options_obj = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(includeTime && {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  };

  return dateObj.toLocaleDateString('en-US', options_obj);
};

/**
 * Format date to relative time (e.g., "2 hours ago", "3 days ago")
 * @param {Date|string|number} date - Date to format
 * @returns {string} Relative time string
 * @example
 * formatDateRelative(new Date(Date.now() - 3600000)) // Returns "1 hour ago"
 */
export const formatDateRelative = (date) => {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return null;

  const now = new Date();
  const diffMs = now - dateObj;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
};

// ============================================
// SCORE & PERCENTAGE FORMATTING
// ============================================

/**
 * Format score as percentage with optional decimal places
 * @param {number} score - Score value (0-100)
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted percentage string
 * @example
 * formatScorePercentage(85.5, 1) // Returns "85.5%"
 * formatScorePercentage(90) // Returns "90%"
 */
export const formatScorePercentage = (score, decimals = 0) => {
  if (typeof score !== 'number' || isNaN(score)) {
    return '0%';
  }
  const rounded = decimals > 0 ? score.toFixed(decimals) : Math.round(score);
  return `${rounded}%`;
};

/**
 * Format confidence value (0-1) to percentage
 * @param {number} confidence - Confidence value (0-1)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 * @example
 * formatConfidence(0.85) // Returns "85.0%"
 * formatConfidence(0.923, 2) // Returns "92.30%"
 */
export const formatConfidence = (confidence, decimals = 1) => {
  if (typeof confidence !== 'number' || isNaN(confidence)) {
    return '0.0%';
  }
  const percentage = confidence * 100;
  return `${percentage.toFixed(decimals)}%`;
};

/**
 * Format score with quality label
 * @param {number} score - Score value (0-100)
 * @returns {Object} Object with score and quality label
 * @example
 * formatScoreWithQuality(85) // Returns { score: 85, label: "Good", color: "green" }
 */
export const formatScoreWithQuality = (score) => {
  if (typeof score !== 'number' || isNaN(score)) {
    return { score: 0, label: 'Unknown', color: 'gray' };
  }

  if (score >= 90) {
    return { score, label: 'Excellent', color: 'green' };
  } else if (score >= 75) {
    return { score, label: 'Good', color: 'blue' };
  } else if (score >= 60) {
    return { score, label: 'Fair', color: 'yellow' };
  } else if (score >= 40) {
    return { score, label: 'Poor', color: 'orange' };
  } else {
    return { score, label: 'Very Poor', color: 'red' };
  }
};

// ============================================
// ANGLE FORMATTING
// ============================================

/**
 * Format angle in degrees with symbol
 * @param {number} angle - Angle in degrees
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted angle string
 * @example
 * formatAngle(90.5) // Returns "90.5°"
 * formatAngle(45, 0) // Returns "45°"
 */
export const formatAngle = (angle, decimals = 1) => {
  if (typeof angle !== 'number' || isNaN(angle)) {
    return '0°';
  }
  return `${angle.toFixed(decimals)}°`;
};

/**
 * Format angle range
 * @param {number} min - Minimum angle
 * @param {number} max - Maximum angle
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted angle range string
 * @example
 * formatAngleRange(45, 90) // Returns "45.0° - 90.0°"
 */
export const formatAngleRange = (min, max, decimals = 1) => {
  if (typeof min !== 'number' || typeof max !== 'number' || isNaN(min) || isNaN(max)) {
    return '0° - 0°';
  }
  return `${min.toFixed(decimals)}° - ${max.toFixed(decimals)}°`;
};

// ============================================
// FILE SIZE FORMATTING
// ============================================

/**
 * Format file size in bytes to human-readable string
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size string
 * @example
 * formatFileSize(1024) // Returns "1.00 KB"
 * formatFileSize(1048576) // Returns "1.00 MB"
 */
export const formatFileSize = (bytes, decimals = 2) => {
  if (typeof bytes !== 'number' || bytes < 0) {
    return '0 Bytes';
  }

  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// ============================================
// TIMESTAMP FORMATTING (for feedback/sessions)
// ============================================

/**
 * Format timestamp in seconds to MM:SS format (for feedback timestamps)
 * @param {number} timestamp - Timestamp in seconds
 * @returns {string} Formatted timestamp (e.g., "1:30", "5:45")
 * @example
 * formatTimestamp(90) // Returns "1:30"
 * formatTimestamp(365) // Returns "6:05"
 */
export const formatTimestamp = (timestamp) => {
  if (typeof timestamp !== 'number' || timestamp < 0) {
    return '0:00';
  }
  return formatDurationMMSS(timestamp);
};

/**
 * Format timestamp in milliseconds to MM:SS format
 * @param {number} timestampMs - Timestamp in milliseconds
 * @returns {string} Formatted timestamp
 * @example
 * formatTimestampMs(90000) // Returns "1:30"
 */
export const formatTimestampMs = (timestampMs) => {
  if (typeof timestampMs !== 'number' || timestampMs < 0) {
    return '0:00';
  }
  return formatDurationMMSS(timestampMs / 1000);
};

// ============================================
// NUMBER FORMATTING
// ============================================

/**
 * Format number with commas as thousand separators
 * @param {number} number - Number to format
 * @returns {string} Formatted number string
 * @example
 * formatNumberWithCommas(1000) // Returns "1,000"
 * formatNumberWithCommas(1234567) // Returns "1,234,567"
 */
export const formatNumberWithCommas = (number) => {
  if (typeof number !== 'number' || isNaN(number)) {
    return '0';
  }
  return number.toLocaleString('en-US');
};

/**
 * Round number to specified decimal places
 * @param {number} number - Number to round
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number} Rounded number
 * @example
 * roundToDecimals(3.14159, 2) // Returns 3.14
 */
export const roundToDecimals = (number, decimals = 2) => {
  if (typeof number !== 'number' || isNaN(number)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Duration
  formatDurationToMinutes,
  formatDurationMMSS,
  formatDurationHuman,
  
  // Date
  formatDateISO,
  formatDateReadable,
  formatDateRelative,
  
  // Score & Percentage
  formatScorePercentage,
  formatConfidence,
  formatScoreWithQuality,
  
  // Angle
  formatAngle,
  formatAngleRange,
  
  // File Size
  formatFileSize,
  
  // Timestamp
  formatTimestamp,
  formatTimestampMs,
  
  // Number
  formatNumberWithCommas,
  roundToDecimals,
};
