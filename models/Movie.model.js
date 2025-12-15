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

    filmmakerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // ======= BASIC INFO =======
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      unique: true,
    },
    description: DataTypes.TEXT,
    language: {
      type: DataTypes.STRING,
      defaultValue: "en",
    },
    original_language: {
      type: DataTypes.STRING,
      defaultValue: "en",
    },

    // ======= VIDEO FILES =======
    streamingUrl: DataTypes.STRING,
    videoUrl: DataTypes.STRING,
    hlsUrl: DataTypes.STRING,
    videoQuality: DataTypes.STRING,
    videoDuration: DataTypes.FLOAT,
    fileSize: DataTypes.FLOAT,

    // ======= POSTERS / IMAGES =======
    poster: DataTypes.STRING,
    backdrop: DataTypes.STRING,
    thumbnail: DataTypes.STRING,

    posterPublicId: DataTypes.STRING,
    backdropPublicId: DataTypes.STRING,

    // ======= CATEGORIES / TAGS / RESTRICTIONS =======
    categories: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },

    geoRestrictions: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },

    ageRestriction: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // ======= PRICING =======
    price: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('price');
        return parseFloat(value) || 0;
      }
    },
    viewPrice: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('viewPrice');
        return parseFloat(value) || 0;
      }
    },
    downloadPrice: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('downloadPrice');
        return parseFloat(value) || 0;
      }
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: "USD",
    },

    // ======= ROYALTY & REVENUE =======
    royaltyPercentage: {
      type: DataTypes.FLOAT,
      defaultValue: 70, // Default 70% for filmmaker
      get() {
        const value = this.getDataValue('royaltyPercentage');
        return parseFloat(value) || 70;
      }
    },
    totalRevenue: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('totalRevenue');
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
      },
      set(value) {
        // Ensure we always store a number
        const num = parseFloat(value);
        this.setDataValue('totalRevenue', isNaN(num) ? 0 : num);
      }
    },

    // ======= RATINGS =======
    avgRating: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      get() {
        const value = this.getDataValue('avgRating');
        return parseFloat(value) || 0;
      }
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // ======= PERFORMANCE =======
    totalViews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    popularity: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    vote_average: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    vote_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // ======= FLAGS =======
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isTrending: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "pending",
    },

    // ======= SERIES SUPPORT =======
    contentType: {
      type: DataTypes.STRING,
      defaultValue: "movie",
    },
    seriesId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    seasonNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    episodeNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // ======= TIME =======
    release_date: DataTypes.DATE,
    uploadedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    processingStatus: {
      type: DataTypes.STRING,
      defaultValue: "completed",
    },
  },

  {
    tableName: "Movies",
    timestamps: true,

    // ===================== CLEAN INDEXES =====================
    indexes: [
      { fields: ["filmmakerId"] },
      { fields: ["status"] },
      { fields: ["slug"] },
      { fields: ["createdAt"] },
      { fields: ["avgRating", "totalViews"] },
      { fields: ["viewPrice", "downloadPrice"] },

      { fields: ["contentType"] },
      { fields: ["seriesId"] },
      { fields: ["seriesId", "seasonNumber"] },

      // UNIQUE EPISODE INDEX – only once!
      {
        fields: ["seriesId", "seasonNumber", "episodeNumber"],
        unique: true,
      },

      { fields: ["seriesId", "status"] },

      { fields: ["title"] },
      { fields: ["language"] },
      { fields: ["original_language"] },

      { fields: ["isFeatured"] },
      { fields: ["isTrending"] },
      { fields: ["popularity"] },
      { fields: ["vote_average"] },
      { fields: ["totalRevenue"] },
      { fields: ["release_date"] },
      { fields: ["ageRestriction"] },

      // Composite indexes
      { fields: ["contentType", "status", "createdAt"] },
      { fields: ["filmmakerId", "status", "createdAt"] },
    ],
  }
);

export default Movie;