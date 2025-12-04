import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Movie = sequelize.define(
  "Movie",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // Basic Information
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    original_title: DataTypes.STRING,
    overview: DataTypes.TEXT,
    release_date: DataTypes.STRING,
    poster_path: DataTypes.STRING,
    backdrop_path: DataTypes.STRING,
    popularity: DataTypes.DECIMAL(10, 2),
    vote_average: DataTypes.DECIMAL(3, 1),
    vote_count: DataTypes.INTEGER,
    adult: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    video: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    genre_ids: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    original_language: DataTypes.STRING,

    // Filmmaker Information
    filmmakerId: DataTypes.UUID,
    filmmakerName: DataTypes.STRING,
    filmmakerBio: DataTypes.TEXT,
    filmmakerProfileImage: DataTypes.STRING,

    // Video/Media Storage
    streamingUrl: DataTypes.STRING,
    videoUrl: DataTypes.STRING,
    hlsUrl: DataTypes.STRING,
    videoQuality: {
      type: DataTypes.ENUM("240p", "360p", "480p", "720p", "1080p", "4K"),
      defaultValue: "720p",
    },
    videoDuration: DataTypes.INTEGER,
    fileSize: DataTypes.DECIMAL(10, 2),
    uploadedAt: DataTypes.DATE,
    processingStatus: {
      type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
      defaultValue: "pending",
    },

    // Images
    poster: DataTypes.STRING,
    backdrop: DataTypes.STRING,
    posterPublicId: DataTypes.STRING,
    backdropPublicId: DataTypes.STRING,
    thumbnail: DataTypes.STRING,

    // Pricing & Monetization
    price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    viewPrice: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    downloadPrice: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.ENUM("RWF", "EUR", "USD"),
      defaultValue: "RWF",
    },
    royaltyPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 95,
    },
    totalRevenue: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
    },
    totalDownloads: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalViews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // Moderation
    status: {
      type: DataTypes.ENUM("draft", "submitted", "approved", "rejected", "hidden"),
      defaultValue: "draft",
    },
    rejectionReason: DataTypes.TEXT,
    submittedAt: DataTypes.DATE,
    approvedBy: DataTypes.UUID,
    approvedAt: DataTypes.DATE,

    // Categories
    categories: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
    },

    // SEO
    slug: {
      type: DataTypes.STRING,
      unique: true,
    },
    keywords: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    language: DataTypes.STRING,
    subtitles: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: "Array of { language, url }",
    },

    // Downloads
    allowDownload: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    downloadExpiry: DataTypes.INTEGER,

    // Analytics
    avgRating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0,
    },
    reviewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["filmmakerId"] },
      { fields: ["status"] },
      { fields: ["slug"] },
      { fields: ["createdAt"] },
      { fields: ["avgRating", "totalViews"] },
      { fields: ["viewPrice", "downloadPrice"] },
    ],
  }
);

export default Movie;
