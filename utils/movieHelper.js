/**
 * Movie Validation and Helper Functions
 */

/**
 * Validate movie form data
 * @param {Object} data - Movie form data
 * @returns {Object} Validation result with errors array
 */
export const validateMovieData = (data) => {
  const errors = [];

  // Title validation
  if (!data.title || data.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters long");
  }

  // Overview validation
  if (!data.overview || data.overview.trim().length < 20) {
    errors.push("Overview must be at least 20 characters long");
  }

  // Categories validation
  if (!data.categories || data.categories.length === 0) {
    errors.push("At least one category is required");
  }

  // Price validation
  if (data.price && data.price < 0) {
    errors.push("Price cannot be negative");
  }

  // Royalty percentage validation
  if (data.royaltyPercentage && (data.royaltyPercentage < 0 || data.royaltyPercentage > 100)) {
    errors.push("Royalty percentage must be between 0 and 100");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate uploaded files
 * @param {Object} files - Uploaded files object from multer
 * @returns {Object} Validation result with errors array
 */
export const validateMovieFiles = (files) => {
  const errors = [];

  // Check if all required files are present
  if (!files || !files.videoFile || !files.posterFile || !files.backdropFile) {
    errors.push("Video file, poster image, and backdrop image are required");
    return { isValid: false, errors };
  }

  const { videoFile, posterFile, backdropFile } = files;

  // Validate video file
  if (videoFile && videoFile[0]) {
    if (!videoFile[0].mimetype.startsWith("video/")) {
      errors.push("Video file must be a valid video format");
    }
    if (videoFile[0].size > 5 * 1024 * 1024 * 1024) {
      errors.push("Video file must be less than 5GB");
    }
  }

  // Validate poster file
  if (posterFile && posterFile[0]) {
    if (!posterFile[0].mimetype.startsWith("image/")) {
      errors.push("Poster must be a valid image format");
    }
    if (posterFile[0].size > 10 * 1024 * 1024) {
      errors.push("Poster image must be less than 10MB");
    }
  }

  // Validate backdrop file
  if (backdropFile && backdropFile[0]) {
    if (!backdropFile[0].mimetype.startsWith("image/")) {
      errors.push("Backdrop must be a valid image format");
    }
    if (backdropFile[0].size > 10 * 1024 * 1024) {
      errors.push("Backdrop image must be less than 10MB");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Format file size to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

/**
 * Format video duration to HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Generate video thumbnail from video URL
 * For B2, thumbnails need to be uploaded separately or generated via external service
 * @param {string} videoUrl - Video URL
 * @returns {string} Thumbnail URL (B2 doesn't support on-the-fly thumbnail generation)
 */
export const generateThumbnail = (videoUrl) => {
  // B2 doesn't support on-the-fly video transformations like Cloudinary
  // Thumbnails should be uploaded separately or generated via external service
  // For now, return the video URL as-is
  // In production, you'd integrate with FFmpeg or a video processing service
  if (videoUrl && videoUrl.includes("backblazeb2.com")) {
    // B2 doesn't support dynamic thumbnail generation
    // You can use external services like:
    // - Zencoder (Brightcove)
    // - Mux
    // - AWS MediaConvert
    // - Or generate locally with FFmpeg
    console.warn("⚠️ B2 doesn't support on-the-fly thumbnail generation. Consider uploading thumbnails separately.");
    return videoUrl;
  }
  return videoUrl;
};

/**
 * Sanitize filename
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export const sanitizeFilename = (filename) => {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/**
 * Parse array fields that might come as strings
 * @param {string|array} field - Field to parse
 * @returns {array} Parsed array
 */
export const parseArrayField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === "string") {
    return field.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

/**
 * Check if user is filmmaker or admin
 * @param {Object} user - User object
 * @param {string} filmamakerId - Filmmaker ID from movie
 * @returns {boolean} True if user has permission
 */
export const hasMoviePermission = (user, filmamakerId) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.id === filmamakerId;
};

/**
 * Calculate estimated processing time based on video duration
 * @param {number} duration - Video duration in seconds
 * @returns {string} Estimated processing time
 */
export const estimateProcessingTime = (duration) => {
  // Rough estimate: 1 minute of video = 30 seconds processing
  const processingSeconds = duration * 0.5;
  
  if (processingSeconds < 60) {
    return "Less than a minute";
  }
  
  const minutes = Math.ceil(processingSeconds / 60);
  
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours > 1 ? "s" : ""}`;
};

/**
 * Generate HLS playlist URL from B2 video URL
 * B2 doesn't support on-the-fly HLS conversion
 * HLS streaming requires external video processing service
 * @param {string} videoUrl - B2 video URL
 * @returns {string} Direct video URL (for now) or HLS URL if available
 */
export const generateHLSUrl = (videoUrl) => {
  if (!videoUrl) {
    return videoUrl;
  }

  // B2 doesn't support on-the-fly HLS conversion like Cloudinary
  // Options for HLS streaming with B2:
  // 1. Pre-encode videos to HLS format before uploading (recommended)
  // 2. Use external service: Mux, Zencoder, AWS MediaConvert, etc.
  // 3. Use player-side HLS.js for DASH/HLS playback

  if (videoUrl.includes("backblazeb2.com")) {
    console.warn("⚠️ B2 doesn't support on-the-fly HLS conversion.");
    console.info("💡 Consider: 1) Pre-encode to HLS, 2) Use Mux/Zencoder, 3) Use HLS.js on client");
    // Return direct URL - client should handle playback
    return videoUrl;
  }

  return videoUrl;
};

/**
 * Allowed video formats
 */
export const ALLOWED_VIDEO_FORMATS = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
];

/**
 * Allowed image formats
 */
export const ALLOWED_IMAGE_FORMATS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Movie categories
 */
export const MOVIE_CATEGORIES = [
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Thriller",
  "Romance",
  "Documentary",
  "Animation",
  "Sci-Fi",
  "Fantasy",
];

/**
 * Video quality options
 */
export const VIDEO_QUALITIES = ["240p", "360p", "480p", "720p", "1080p", "4K"];

/**
 * Currency options
 */
export const CURRENCIES = ["USD", "EUR", "RWF"];

/**
 * Movie status options
 */
export const MOVIE_STATUSES = ["draft", "submitted", "approved", "rejected", "hidden"];