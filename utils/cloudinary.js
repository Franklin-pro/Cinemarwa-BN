import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload buffer or file to Cloudinary using streaming
 * @param {Buffer|string} file - File buffer or path
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise} Cloudinary upload result
 */
export const uploadToCloudinary = async (file, options = {}) => {
  try {
    // If file is a buffer, use streaming upload to avoid base64 size limits
    if (Buffer.isBuffer(file)) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: options.resource_type || "auto",
            folder: options.folder || "movies",
            ...options,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        // Write buffer to the stream
        uploadStream.end(file);
      });
    }

    // If file is a path or URL
    return await cloudinary.uploader.upload(file, {
      resource_type: options.resource_type || "auto",
      folder: options.folder || "movies",
      ...options,
    });
  } catch (error) {
    // Extract the actual error message
    let errorMsg = "Unknown error";

    if (error?.message) {
      errorMsg = error.message;
    } else if (error?.error?.message) {
      errorMsg = error.error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (error?.http_code) {
      errorMsg = `HTTP ${error.http_code}: ${error.message || "Upload failed"}`;
    }

    console.error("❌ Cloudinary upload error:", errorMsg);
    throw new Error(errorMsg);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type (image, video, raw)
 * @returns {Promise} Cloudinary deletion result
 */
export const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (error) {
    let errorMsg = "Unknown error";

    if (error?.message) {
      errorMsg = error.message;
    } else if (error?.error?.message) {
      errorMsg = error.error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (error?.http_code) {
      errorMsg = `HTTP ${error.http_code}: ${error.message || "Deletion failed"}`;
    }

    console.error("❌ Cloudinary deletion error:", errorMsg);
    throw new Error(errorMsg);
  }
};

// ====== MULTER CONFIGURATION ======

/**
 * Multer memory storage for video uploads
 * Stores files in memory as Buffer objects
 */
const videoStorage = multer.memoryStorage();

/**
 * Multer memory storage for image uploads
 */
const imageStorage = multer.memoryStorage();

/**
 * File filter for videos
 */
const videoFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed"), false);
  }
};

/**
 * File filter for images
 */
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

/**
 * Multer middleware for video uploads
 * @param {number} maxSize - Maximum file size in bytes (default: 5GB)
 */
export const uploadVideoMiddleware = (maxSize = 5 * 1024 * 1024 * 1024) => {
  return multer({
    storage: videoStorage,
    fileFilter: videoFileFilter,
    limits: {
      fileSize: maxSize,
    },
  });
};

/**
 * Multer middleware for image uploads
 * @param {number} maxSize - Maximum file size in bytes (default: 10MB)
 */
export const uploadImageMiddleware = (maxSize = 10 * 1024 * 1024) => {
  return multer({
    storage: imageStorage,
    fileFilter: imageFileFilter,
    limits: {
      fileSize: maxSize,
    },
  });
};

/**
 * Multer middleware for mixed uploads (video + images)
 * Used for complete movie uploads with video, poster, and backdrop
 */
export const uploadMovieFilesMiddleware = () => {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024 * 1024, // 5GB max for video
    },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === "videoFile") {
        if (file.mimetype.startsWith("video/")) {
          cb(null, true);
        } else {
          cb(new Error("Video file must be a valid video format"), false);
        }
      } else if (file.fieldname === "posterFile" || file.fieldname === "backdropFile") {
        if (file.mimetype.startsWith("image/")) {
          cb(null, true);
        } else {
          cb(new Error("Image files must be valid image formats"), false);
        }
      } else {
        cb(new Error("Unexpected field"), false);
      }
    },
  }).fields([
    { name: "videoFile", maxCount: 1 },
    { name: "posterFile", maxCount: 1 },
    { name: "backdropFile", maxCount: 1 },
  ]);
};

export default cloudinary;