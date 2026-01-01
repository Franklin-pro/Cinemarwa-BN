import axios from "axios";
import multer from "multer";
import path from "path";
import crypto from "crypto";

const BUNNY_API_BASE = "https://dash.bunny.net/stream";

/* =====================================================
   BUNNY STREAM CORE
===================================================== */

/**
 * Upload video to Bunny Stream
 * @param {Buffer} fileBuffer
 * @param {string} originalFileName
 * @returns {Promise<Object>}
 */
export const uploadToBunnyStream = async (fileBuffer, originalFileName) => {
  try {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;
    const cdnHost = process.env.BUNNY_STREAM_CDN_HOSTNAME;

    if (!libraryId || !apiKey || !cdnHost) {
      throw new Error("Missing Bunny Stream environment variables");
    }

    // Clean & unique filename
    const ext = path.extname(originalFileName);
    const name = path.basename(originalFileName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    const uniqueName = `${name}-${crypto.randomBytes(4).toString("hex")}${ext}`;

    /* 1️⃣ Create video entry */
    const createResponse = await axios.post(
      `${BUNNY_API_BASE}/library/${libraryId}/videos`,
      { title: uniqueName },
      {
        headers: {
          AccessKey: apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const videoId = createResponse.data.guid;

    /* 2️⃣ Upload binary */
    await axios.put(
      `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`,
      fileBuffer,
      {
        headers: {
          AccessKey: apiKey,
          "Content-Type": "application/octet-stream",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    /* 3️⃣ Playback URL (HLS) */
    const playbackUrl = `https://${cdnHost}/${videoId}/playlist.m3u8`;

    return {
      fileId: videoId,
      public_id: videoId,
      fileName: uniqueName,
      playbackUrl,
      secure_url: playbackUrl,
      provider: "bunny-stream",
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error("❌ Bunny Stream upload error:", error.message);
    throw new Error(`Bunny Stream upload failed: ${error.message}`);
  }
};

/**
 * Delete video from Bunny Stream
 * @param {string} videoId
 */
export const deleteFromBunnyStream = async (videoId) => {
  try {
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;

    await axios.delete(
      `${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`,
      {
        headers: { AccessKey: apiKey },
      }
    );

    return { success: true, videoId };
  } catch (error) {
    console.error("❌ Bunny Stream delete error:", error.message);
    return { success: false, message: error.message };
  }
};

/* =====================================================
   MULTER CONFIGURATION
===================================================== */

/**
 * Video upload middleware (5GB max)
 */
export const uploadVideoMiddleware = (maxSize = 5 * 1024 * 1024 * 1024) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith("video/")) {
        cb(null, true);
      } else {
        cb(new Error("Only video files are allowed"), false);
      }
    },
  });
};

/**
 * Image upload middleware (posters, thumbnails)
 */
export const uploadImageMiddleware = (maxSize = 10 * 1024 * 1024) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed"), false);
      }
    },
  });
};

/**
 * Movie upload middleware (video + poster + backdrop)
 */
export const uploadMovieFilesMiddleware = () => {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === "videoFile") {
        return file.mimetype.startsWith("video/")
          ? cb(null, true)
          : cb(new Error("Invalid video format"), false);
      }

      if (file.fieldname === "posterFile" || file.fieldname === "backdropFile") {
        return file.mimetype.startsWith("image/")
          ? cb(null, true)
          : cb(new Error("Invalid image format"), false);
      }

      cb(new Error("Unexpected field"), false);
    },
  }).fields([
    { name: "videoFile", maxCount: 1 },
    { name: "posterFile", maxCount: 1 },
    { name: "backdropFile", maxCount: 1 },
  ]);
};

/* =====================================================
   EXPORT DEFAULT
===================================================== */

export default {
  uploadToBunnyStream,
  deleteFromBunnyStream,
  uploadVideoMiddleware,
  uploadImageMiddleware,
  uploadMovieFilesMiddleware,
};
