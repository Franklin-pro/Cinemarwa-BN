import B2 from "backblaze-b2";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import axios from "axios";

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

// ====== BUNNY CDN INTEGRATION ======

/**
 * Get Bunny CDN URL for file
 * Format: https://{pull-zone-hostname}/{file-path}
 * @param {string} fileName - File name in B2 bucket
 * @returns {string} Bunny CDN URL
 */
export const getBunnyCDNUrl = (fileInput) => {
  // Check if input is null/undefined/empty
  if (!fileInput) {
    // console.warn('⚠️ getBunnyCDNUrl: fileInput is null or empty');
    return null;
  }

  // Extract the file path from the input
  let filePath = fileInput;
  
  // CASE 1: Input is a full S3 URL (e.g., https://s3.us-east-005.backblazeb2.com/file/cinemarwanda/...)
  if (fileInput.includes('s3.us-east-005.backblazeb2.com')) {
    try {
      const url = new URL(fileInput);
      // Extract path after '/file/cinemarwanda/'
      // Example: "/file/cinemarwanda/movies/videos/file.mp4" → "movies/videos/file.mp4"
      const fullPath = url.pathname;
      
      // Remove '/file/cinemarwanda/' prefix
      if (fullPath.startsWith('/file/cinemarwanda/')) {
        filePath = fullPath.substring('/file/cinemarwanda/'.length);
      } else if (fullPath.startsWith('/')) {
        // If it starts with just '/', remove it
        filePath = fullPath.substring(1);
      } else {
        filePath = fullPath;
      }
    } catch (e) {
      console.warn('⚠️ Could not parse S3 URL:', fileInput);
    }
  }
  // CASE 2: Input is a full friendly B2 URL (e.g., https://f005.backblazeb2.com/file/cinemarwanda/...)
  else if (fileInput.includes('backblazeb2.com/file/')) {
    try {
      const url = new URL(fileInput);
      const fullPath = url.pathname;
      
      // Remove '/file/cinemarwanda/' prefix
      if (fullPath.startsWith('/file/cinemarwanda/')) {
        filePath = fullPath.substring('/file/cinemarwanda/'.length);
      } else {
        filePath = fullPath.substring(1); // Remove leading '/'
      }
    } catch (e) {
      console.warn('⚠️ Could not parse B2 URL:', fileInput);
    }
  }
  // CASE 3: Input is already just a file path (e.g., "movies/videos/file.mp4")
  else {
    filePath = fileInput;
  }

  // Now generate the Bunny CDN URL
  if (!process.env.BUNNY_ENABLED || process.env.BUNNY_ENABLED !== 'true') {
    return getDirectB2Url(filePath);
  }

  if (!process.env.BUNNY_PULL_ZONE_HOSTNAME) {
    return getDirectB2Url(filePath);
  }

  // Clean up the file path (remove leading slash if present)
  const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
  
  // CORRECT Bunny CDN URL format
  const cdnUrl = `https://${process.env.BUNNY_PULL_ZONE_HOSTNAME}/${cleanFilePath}`;
  
  // console.log('🔗 Generated Bunny CDN URL:', cdnUrl);
  // console.log('📁 Extracted file path:', cleanFilePath);
  
  return cdnUrl;
};

export const getDirectB2Url = (fileName) => {
  // Check if fileName is null, undefined, or empty
  if (!fileName) {
    console.warn('⚠️ getDirectB2Url: fileName is null or empty');
    return null;
  }

  const bucketName = process.env.B2_BUCKET_NAME;
  const s3Endpoint = process.env.B2_S3_ENDPOINT || `https://${bucketName}.s3.us-east-005.backblazeb2.com`;
  
  if (!bucketName) {
    throw new Error("❌ Missing B2_BUCKET_NAME. Example: B2_BUCKET_NAME=cinemarwanda");
  }

  // Now it's safe to call .startsWith()
  const cleanFileName = fileName.startsWith('/') ? fileName.substring(1) : fileName;
  const b2Url = `${s3Endpoint}/${cleanFileName}`;
  
  console.log('🔗 Generated Direct B2 URL:', b2Url);
  return b2Url;
};
/**
 * Get streaming URLs with fallback logic
 * Returns primary (Bunny CDN) and fallback (direct B2) URLs
 * @param {string} filePath - File path in B2 bucket
 * @param {Object} options - Options
 * @returns {Object} Streaming URLs object
 */
export const getStreamingUrls = (filePath, options = {}) => {
  const useCDN = options.useCDN !== false && process.env.BUNNY_ENABLED === 'true';
  const cdnUrl = getBunnyCDNUrl(filePath);
  const directUrl = getDirectB2Url(filePath);
  
  return {
    primary: useCDN ? cdnUrl : directUrl,
    fallback: directUrl,
    cdnUrl: cdnUrl,
    directUrl: directUrl,
    cdnEnabled: process.env.BUNNY_ENABLED === 'true',
    cdnHostname: process.env.BUNNY_PULL_ZONE_HOSTNAME,
    cdnType: 'bunny',
  };
};

/**
 * Purge Bunny CDN cache for a specific file
 * @param {string} filePath - File path to purge
 * @returns {Promise<Object>} Purge result
 */
export const purgeBunnyCache = async (filePath) => {
  if (process.env.BUNNY_ENABLED !== 'true') {
    console.log('ℹ️ Bunny CDN not enabled, skipping cache purge');
    return { success: false, message: 'Bunny CDN not enabled' };
  }

  try {
    const bunnyApiKey = process.env.BUNNY_API_KEY;
    const pullZoneId = process.env.BUNNY_PULL_ZONE_ID;
    
    if (!bunnyApiKey) {
      return { 
        success: false, 
        message: 'BUNNY_API_KEY not configured'
      };
    }

    // Method 1: Using Bunny's purge URL endpoint
    const purgeUrl = `https://api.bunny.net/purge`;
    const fullUrl = `https://${process.env.BUNNY_PULL_ZONE_HOSTNAME}/${filePath}`;
    
    const response = await axios.post(purgeUrl, 
      { url: fullUrl },
      {
        headers: {
          'AccessKey': bunnyApiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('🔄 Bunny cache purged for:', filePath);
    return { 
      success: true, 
      data: response.data,
      message: 'Cache purged successfully'
    };
  } catch (error) {
    console.error('❌ Bunny cache purge failed:', error.message);
    return { 
      success: false, 
      message: error.message,
      error: error.response?.data || error.message
    };
  }
};

/**
 * Upload file to B2 and return Bunny CDN URLs
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original file name
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URLs
 */
export const uploadToB2 = async (fileBuffer, fileName, options = {}) => {
  try {
    console.log('🔼 uploadToB2 called', { fileName, folder: options.folder });
    const b2 = await initializeB2();

    // Sanitize and create unique filename
    const ext = path.extname(fileName).toLowerCase();
    const nameWithoutExt = path.basename(fileName, ext);

    const sanitizedName = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    const uniqueId = crypto.randomBytes(4).toString("hex");
    const sanitizedFileName = `${sanitizedName}-${uniqueId}${ext}`;

    // Determine file path
    let filePath = sanitizedFileName;
    let folder = options.folder || "uploads";

    if (options.folder) {
      filePath = `${options.folder}/${sanitizedFileName}`;
      folder = options.folder;
    }

    // Get upload URL from B2
    const bucketId = process.env.B2_BUCKET_ID;
    const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const authToken = uploadUrlResponse.data.authorizationToken;

    // Determine content type
    let contentType = options.mimeType || "application/octet-stream";
    const contentTypeMap = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.m3u8': 'application/x-mpegURL',
      '.ts': 'video/MP2T',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };

    if (contentTypeMap[ext]) {
      contentType = contentTypeMap[ext];
    }

    // Upload to B2
    const uploadOptions = {
      uploadUrl,
      uploadAuthToken: authToken,
      fileName: filePath,
      data: fileBuffer,
      onUploadProgress: options.onUploadProgress || null,
      contentType: contentType,
    };

    const uploadResult = await b2.uploadFile(uploadOptions);
    const uploadData = uploadResult.data;

    // Generate URLs
    const streamingUrls = getStreamingUrls(filePath);
    const cdnUrl = getBunnyCDNUrl(filePath);
    const directUrl = getDirectB2Url(filePath);

    console.log('✅ Upload successful', { 
      originalFileName: fileName,
      sanitizedFileName: sanitizedFileName,
      filePath, 
      cdnUrl, 
      directUrl,
      fileId: uploadData.fileId,
      contentType 
    });

    return {
      fileId: uploadData.fileId,
      fileName: filePath,
      downloadUrl: cdnUrl,
      directUrl: directUrl,
      secure_url: cdnUrl,
      public_id: filePath, 
      bytes: uploadData.contentLength,
      mimeType: contentType,
      uploadedAt: new Date(),
      folder: folder,
      cdnEnabled: process.env.BUNNY_ENABLED === 'true',
      originalName: fileName,
      streamingUrls: streamingUrls,
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
 * Delete file from B2 and optionally purge CDN cache
 * @param {string} fileName - File name in B2 bucket
 * @param {boolean} purgeCache - Whether to purge CDN cache
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFromB2 = async (fileName, purgeCache = true) => {
  try {
    const b2 = await initializeB2();
    const bucketId = process.env.B2_BUCKET_ID;

    // List files to find the file to delete
    const listResponse = await b2.listFileNames({
      bucketId,
      startFileName: fileName,
      maxFileCount: 1,
    });

    const fileToDelete = listResponse.data.files.find(
      (f) => f.fileName === fileName
    );

    if (!fileToDelete) {
      console.warn(`⚠️ File not found in B2: ${fileName}`);
      return { success: false, message: "File not found" };
    }

    // Delete from B2
    await b2.deleteFile({
      fileId: fileToDelete.fileId,
      fileName: fileToDelete.fileName,
    });

    // Purge from Bunny CDN cache if enabled
    let purgeResult = null;
    if (purgeCache && process.env.BUNNY_ENABLED === 'true') {
      purgeResult = await purgeBunnyCache(fileName);
    }

    console.log(`✅ Deleted from B2: ${fileName}`);
    return { 
      success: true, 
      fileName,
      cdnPurged: purgeCache && process.env.BUNNY_ENABLED === 'true',
      purgeResult: purgeResult
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

    console.error("❌ B2 deletion error:", errorMsg);
    return { success: false, message: errorMsg };
  }
};

/**
 * Test Bunny CDN connection
 * @returns {Promise<Object>} Test result
 */
export const testBunnyCDN = async () => {
  try {
    if (process.env.BUNNY_ENABLED !== 'true') {
      return {
        success: false,
        message: 'Bunny CDN is not enabled',
        enabled: false
      };
    }

    if (!process.env.BUNNY_PULL_ZONE_HOSTNAME) {
      return {
        success: false,
        message: 'BUNNY_PULL_ZONE_HOSTNAME not configured',
        enabled: false
      };
    }

    const testUrl = `https://${process.env.BUNNY_PULL_ZONE_HOSTNAME}/`;
    
    const response = await axios.head(testUrl, { timeout: 5000 });
    
    return {
      success: true,
      message: 'Bunny CDN is responding',
      enabled: true,
      hostname: process.env.BUNNY_PULL_ZONE_HOSTNAME,
      status: response.status,
      statusText: response.statusText,
      configStatus: '✅ Bunny CDN properly configured'
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        message: 'Bunny CDN hostname not reachable',
        enabled: process.env.BUNNY_ENABLED === 'true',
        hostname: process.env.BUNNY_PULL_ZONE_HOSTNAME,
        error: error.message,
        configStatus: '❌ DNS or connectivity issue'
      };
    }
    
    return {
      success: true, 
      message: 'Bunny CDN is responding (non-200 status expected for root)',
      enabled: true,
      hostname: process.env.BUNNY_PULL_ZONE_HOSTNAME,
      error: error.message,
      configStatus: '✅ Bunny CDN reachable'
    };
  }
};

/**
 * Get Bunny CDN statistics
 * @returns {Promise<Object>} CDN statistics
 */
export const getBunnyStats = async () => {
  try {
    if (process.env.BUNNY_ENABLED !== 'true' || !process.env.BUNNY_API_KEY) {
      return {
        success: false,
        message: 'Bunny CDN not configured for statistics'
      };
    }

    const statsUrl = `https://api.bunny.net/statistics`;
    
    const response = await axios.get(statsUrl, {
      headers: {
        'AccessKey': process.env.BUNNY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      data: response.data,
      message: 'Bunny CDN statistics retrieved'
    };
  } catch (error) {
    console.error('❌ Failed to get Bunny CDN statistics:', error.message);
    return {
      success: false,
      message: error.message,
      error: error.response?.data || error.message
    };
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
  const allowedVideoTypes = [
    'video/mp4', 
    'video/quicktime', 
    'video/x-msvideo', 
    'video/x-matroska',
    'video/webm',
    'application/x-mpegURL'
  ];
  
  if (file.mimetype.startsWith("video/") || allowedVideoTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed (MP4, MOV, AVI, MKV, WebM, HLS)"), false);
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

/**
 * Utility to clear URL formatting
 * @param {string} url - URL to clean
 * @returns {string} Cleaned URL
 */
export const clearUrl = (url) => {
  if (!url) return url;

  let u = url.split('?')[0].split('#')[0];

  // Convert s3.us-east-005.backblazeb2.com/file/... -> f005.backblazeb2.com/file/...
  const s3Regex = /^https?:\/\/s3\.us-(?:east|west)-0*(\d+)\.backblazeb2\.com\/file\/(.+)$/;
  const m = u.match(s3Regex);
  if (m) {
    const fNumber = m[1].padStart(3, '0');
    return `https://f${fNumber}.backblazeb2.com/file/${m[2]}`;
  }

  u = u.replace(/^https?:\/\/s3\.us-(?:east|west)-0*(\d+)\./, (match, p1) => `https://f${String(p1).padStart(3, '0')}.`);

  return u;
};

// Legacy compatibility
export const getB2DownloadUrl = getDirectB2Url;
export const getCDNUrl = getBunnyCDNUrl;

export default {
  initializeB2,
  uploadToB2,
  deleteFromB2,
  uploadVideoMiddleware,
  uploadImageMiddleware,
  uploadMovieFilesMiddleware,
  getB2DownloadUrl,
  getBucketInfo,
  clearUrl,
  // Bunny CDN functions
  getBunnyCDNUrl,
  getDirectB2Url,
  getStreamingUrls,
  purgeBunnyCache,
  testBunnyCDN,
  getBunnyStats,
};