import B2 from "backblaze-b2";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import axios from "axios";

/* =========================================================
   BACKBLAZE B2 INITIALIZATION
========================================================= */

let b2Instance = null;
let bucketInfo = null;

export const initializeB2 = async () => {
  if (b2Instance) return b2Instance;

  b2Instance = new B2({
    applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
    applicationKey: process.env.B2_APPLICATION_KEY,
  });

  await b2Instance.authorize();
  console.log("✅ B2 authorized");
  return b2Instance;
};

export const getBucketInfo = async () => {
  if (bucketInfo) return bucketInfo;

  const b2 = await initializeB2();
  const res = await b2.getBucket({ bucketId: process.env.B2_BUCKET_ID });

  bucketInfo = {
    bucketId: res.data.bucketId,
    bucketName: res.data.bucketName,
    bucketType: res.data.bucketType,
  };

  return bucketInfo;
};

/* =========================================================
   CLOUDFLARE CDN (ACTIVE)
========================================================= */

export const getCloudflareCDNUrl = (fileInput) => {
  if (!fileInput) return null;

  let filePath = fileInput;

  // Handle full B2 URLs
  if (fileInput.includes("backblazeb2.com")) {
    try {
      const url = new URL(fileInput);
      filePath = url.pathname.replace(/^\/file\/[^/]+\//, "");
    } catch {}
  }

  const cleanPath = filePath.startsWith("/")
    ? filePath.slice(1)
    : filePath;

  return `https://${process.env.B2_DOWNLOAD_URL}/${cleanPath}`;
};


/* =========================================================
   DIRECT B2 URL (PRIMARY)
========================================================= */

export const getDirectB2Url = (fileName) => {
  if (!fileName) return null;

  // If already a full URL, extract the path
  if (fileName.startsWith("http")) {
    try {
      const url = new URL(fileName);
      // Extract path and remove leading slash
      const path = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
      return `https://cinemarwanda.s3.us-east-005.backblazeb2.com/${path}`;
    } catch {
      return fileName;
    }
  }

  const clean = fileName.startsWith("/") ? fileName.slice(1) : fileName;
  return `https://cinemarwanda.s3.us-east-005.backblazeb2.com/${clean}`;
};

/* =========================================================
   CLEAR URL (NORMALIZE B2 / CDN URL → FILE PATH)
========================================================= */

export const clearUrl = (fileInput) => {
  if (!fileInput) return null;

  // If it's a full URL
  if (fileInput.startsWith("http")) {
    try {
      const url = new URL(fileInput);

      // Remove `/file/bucket-name/`
      return url.pathname.replace(/^\/file\/[^/]+\//, "");
    } catch {
      return fileInput;
    }
  }

  // If already a file path
  return fileInput.startsWith("/") ? fileInput.slice(1) : fileInput;
};


/* =========================================================
   STREAMING URLS (DIRECT B2)
========================================================= */

export const getStreamingUrls = (filePath) => {
  const directUrl = getDirectB2Url(filePath);
  const cdnUrl = getCloudflareCDNUrl(filePath);

  return {
    primary: directUrl,
    fallback: cdnUrl,
    cdnType: "direct-b2",
    cdnEnabled: false,
  };
};

/* =========================================================
   UPLOAD TO B2
========================================================= */

export const uploadToB2 = async (fileBuffer, fileName, options = {}) => {
  const b2 = await initializeB2();

  // Handle undefined or empty filename
  const safeFileName = fileName || options.defaultName || "file";
  const ext = path.extname(safeFileName).toLowerCase() || (options.mimeType && options.mimeType.includes("image") ? ".jpg" : ".bin");
  const base = path.basename(safeFileName, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") || "file";

  const unique = crypto.randomBytes(4).toString("hex");
  const finalName = `${base}-${unique}${ext}`;
  const folder = options.folder || "uploads";
  const filePath = `${folder}/${finalName}`;

  const { data } = await b2.getUploadUrl({
    bucketId: process.env.B2_BUCKET_ID,
  });

  await b2.uploadFile({
    uploadUrl: data.uploadUrl,
    uploadAuthToken: data.authorizationToken,
    fileName: filePath,
    data: fileBuffer,
    contentType: options.mimeType || "application/octet-stream",
  });

  const streamingUrls = getStreamingUrls(filePath);

  return {
    fileName: filePath,
    secure_url: streamingUrls.primary,
    directUrl: streamingUrls.fallback,
    streamingUrls,
    folder,
    uploadedAt: new Date(),
  };
};

/* =========================================================
   DELETE FROM B2
========================================================= */

export const deleteFromB2 = async (fileName) => {
  const b2 = await initializeB2();

  const list = await b2.listFileNames({
    bucketId: process.env.B2_BUCKET_ID,
    startFileName: fileName,
    maxFileCount: 1,
  });

  const file = list.data.files.find(f => f.fileName === fileName);
  if (!file) return { success: false };

  await b2.deleteFile({
    fileId: file.fileId,
    fileName: file.fileName,
  });

  return { success: true };
};

/* =========================================================
   MULTER CONFIG
========================================================= */

const memory = multer.memoryStorage();

export const uploadVideoMiddleware = (max = 5 * 1024 * 1024 * 1024) =>
  multer({
    storage: memory,
    limits: { fileSize: max },
    fileFilter: (req, file, cb) =>
      file.mimetype.startsWith("video/")
        ? cb(null, true)
        : cb(new Error("Only video files")),
  });

export const uploadImageMiddleware = (max = 10 * 1024 * 1024) =>
  multer({
    storage: memory,
    limits: { fileSize: max },
    fileFilter: (req, file, cb) =>
      file.mimetype.startsWith("image/")
        ? cb(null, true)
        : cb(new Error("Only images")),
  });

export const uploadMovieFilesMiddleware = (maxVideoSize = 5 * 1024 * 1024 * 1024, maxImageSize = 10 * 1024 * 1024) =>
  multer({
    storage: memory,
    limits: { 
      fileSize: maxVideoSize,
      files: 3 // videoFile + posterFile + backdropFile
    },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === "videoFile") {
        return file.mimetype.startsWith("video/")
          ? cb(null, true)
          : cb(new Error("Only video files are allowed for videoFile"));
      }
      
      if (file.fieldname === "posterFile" || file.fieldname === "backdropFile") {
        return file.mimetype.startsWith("image/")
          ? cb(null, true)
          : cb(new Error("Only image files are allowed for " + file.fieldname));
      }
      
      cb(new Error("Unexpected field: " + file.fieldname));
    },
  }).fields([
    { name: "videoFile", maxCount: 1 },
    { name: "posterFile", maxCount: 1 },
    { name: "backdropFile", maxCount: 1 },
  ]);

/* =========================================================
   EXPORTS
========================================================= */

export default {
  initializeB2,
  uploadToB2,
  deleteFromB2,
  getCloudflareCDNUrl,
  getDirectB2Url,
  getStreamingUrls,
  uploadVideoMiddleware,
  uploadImageMiddleware,
  uploadMovieFilesMiddleware,
};
