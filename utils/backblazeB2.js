import B2 from "backblaze-b2";
import multer from "multer";
import path from "path";
import crypto from "crypto";

// Initialize B2 instance
let b2Instance = null;
let bucketInfo = null;

/**
 * Initialize B2 connection
 * @returns {Promise<B2>} B2 instance
 */
export const initializeB2 = async () => {
  if (b2Instance) return b2Instance;

  try {
    b2Instance = new B2({
      applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
      applicationKey: process.env.B2_APPLICATION_KEY,
    });

    await b2Instance.authorize();
    console.log("✅ B2 authorization successful");
    return b2Instance;
  } catch (error) {
    console.error("❌ B2 initialization error:", error.message);
    throw new Error(`B2 initialization failed: ${error.message}`);
  }
};

/**
 * Get bucket information
 */
export const getBucketInfo = async () => {
  if (bucketInfo) return bucketInfo;

  try {
    const b2 = await initializeB2();
    const result = await b2.getBucket({ bucketId: process.env.B2_BUCKET_ID });

    bucketInfo = {
      bucketId: result.data.bucketId,
      bucketName: result.data.bucketName,
      bucketType: result.data.bucketType,
      accountId: result.data.accountId,
    };

    return bucketInfo;
  } catch (error) {
    console.error("❌ Error getting bucket info:", error.message);
    throw error;
  }
};

/**
 * Get B2 file download URL
 * Format: https://{API_ENDPOINT}/file/{BUCKET_NAME}/{FILE_PATH}
 * @param {string} fileName - File name in B2 bucket
 * @returns {string} Download URL
 */
/**
 * Get B2 file download URL
 * Format: https://f003.backblazeb2.com/file/<BUCKET>/<FILE_PATH>
 */
export const getB2DownloadUrl = (fileName) => {
  const apiEndpoint = process.env.B2_DOWNLOAD_URL; // Example: f003.backblazeb2.com
  const bucketName = process.env.B2_BUCKET_NAME;

  if (!apiEndpoint) {
    throw new Error(
      "❌ Missing B2_DOWNLOAD_URL. Example: B2_DOWNLOAD_URL=f003.backblazeb2.com"
    );
  }

  if (!bucketName) {
    throw new Error(
      "❌ Missing B2_BUCKET_NAME. Example: B2_BUCKET_NAME=cinemarwanda"
    );
  }

  // Correct B2 public URL
  return `https://${apiEndpoint}/file/${bucketName}/${fileName}`;
};


/**
 * Upload file to B2
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original file name
 * @param {Object} options - Upload options
 * @returns {Promise} Upload result with URL and fileId
 */
export const uploadToB2 = async (fileBuffer, fileName, options = {}) => {
  try {
    const b2 = await initializeB2();

    // Determine file path based on type
    let filePath = fileName;

    if (options.folder) {
      // Remove extension from fileName for cleaner path
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);

      // Create unique file name to avoid conflicts
      const uniqueName = `${nameWithoutExt}-${crypto.randomBytes(4).toString("hex")}${ext}`;
      filePath = `${options.folder}/${uniqueName}`;
    }

    // Get bucket ID from environment
    const bucketId = process.env.B2_BUCKET_ID;

    // Get upload URL
    const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const authToken = uploadUrlResponse.data.authorizationToken;

    // Prepare upload data
    const uploadOptions = {
      uploadUrl,
      uploadAuthToken: authToken,
      fileName: filePath,
      data: fileBuffer,
      onUploadProgress: null,
      contentType: options.mimeType || "application/octet-stream",
    };

    // Upload file using B2 SDK
    const uploadResult = await b2.uploadFile(uploadOptions);

    // Extract file info from response
    const uploadData = uploadResult.data;
    const downloadUrl = getB2DownloadUrl(filePath);

    return {
      fileId: uploadData.fileId,
      fileName: filePath,
      downloadUrl: downloadUrl,
      secure_url: downloadUrl, // Keep Cloudinary compatibility
      public_id: filePath, // Keep Cloudinary compatibility
      bytes: uploadData.contentLength,
      mimeType: uploadData.contentType,
      uploadedAt: new Date(),
    };
  } catch (error) {
    let errorMsg = "Unknown error";

    if (error?.message) {
      errorMsg = error.message;
    } else if (error?.response?.data?.message) {
      errorMsg = error.response.data.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    }

    console.error("❌ B2 upload error:", errorMsg);
    throw new Error(`B2 upload failed: ${errorMsg}`);
  }
};

/**
 * Delete file from B2
 * @param {string} fileName - File name in B2 bucket
 * @returns {Promise} Deletion result
 */
export const deleteFromB2 = async (fileName) => {
  try {
    const b2 = await initializeB2();
    const bucketId = process.env.B2_BUCKET_ID;

    // List files to find the file to delete
    const listResponse = await b2.listFileNames({
      bucketId,
      startFileName: fileName,
      maxFileCount: 1,
    });

    // Find exact file match
    const fileToDelete = listResponse.data.files.find(
      (f) => f.fileName === fileName
    );

    if (!fileToDelete) {
      console.warn(`⚠️ File not found in B2: ${fileName}`);
      return { success: false, message: "File not found" };
    }

    // Delete the file
    const deleteResponse = await b2.deleteFile({
      fileId: fileToDelete.fileId,
      fileName: fileToDelete.fileName,
    });

    console.log(`✅ Deleted from B2: ${fileName}`);
    return { success: true, fileName };
  } catch (error) {
    let errorMsg = "Unknown error";

    if (error?.message) {
      errorMsg = error.message;
    } else if (error?.response?.data?.message) {
      errorMsg = error.response.data.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    }

    console.error("❌ B2 deletion error:", errorMsg);
    // Don't throw - file might already be deleted
    return { success: false, message: errorMsg };
  }
};

// ====== MULTER CONFIGURATION ======

/**
 * Multer memory storage for video uploads
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
      } else if (
        file.fieldname === "posterFile" ||
        file.fieldname === "backdropFile"
      ) {
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

export default {
  initializeB2,
  uploadToB2,
  deleteFromB2,
  uploadVideoMiddleware,
  uploadImageMiddleware,
  uploadMovieFilesMiddleware,
  getB2DownloadUrl,
  getBucketInfo,
};
