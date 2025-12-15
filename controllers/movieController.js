import Movie from "../models/Movie.model.js";
import UserAccess from "../models/userAccess.model.js"
import User from "../models/User.modal.js";
import slugify from "slugify";
import { uploadToB2, deleteFromB2 } from "../utils/backblazeB2.js";
import { Op } from "sequelize";

// Helper function to calculate expiry date
function calculateExpiryDate(period) {
  if (!period || period === "one-time") return null;
  
  const now = new Date();
  const periods = {
    "24h": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365
  };
  
  const days = periods[period];
  if (!days) return null;
  
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

// Helper to get access period label
function getAccessPeriodLabel(period) {
  const labels = {
    "24h": "24 Hours",
    "7d": "7 Days",
    "30d": "30 Days",
    "90d": "90 Days",
    "180d": "180 Days",
    "365d": "1 Year"
  };
  return labels[period] || period;
}

// ====== CRUD OPERATIONS ======

// 📌 Upload/Create Movie (Filmmaker) - FIXED VERSION
export const addMovie = async (req, res) => {
  try {
    // Extract form data
    const {
      title,
      original_title,
      overview,
      description, // Add description as alternative
      release_date,
      viewPrice,
      downloadPrice,
      currency,
      royaltyPercentage,
      videoQuality,
      videoDuration,
      allowDownload,
      downloadExpiry,
      language,
      tags,
      keywords,
      categories,
      
      // New fields for series
      contentType: rawContentType = "movie",
      seriesId,
      seasonNumber = 1,
      episodeNumber = 1,
      episodeTitle,
      accessPeriod = "one-time",
      pricingTiers,
      totalSeasons = 1,
      releaseSchedule,
    } = req.body;

    // Ensure contentType is a string (handle if it comes as array)
    const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType;
    // Use overview OR description (whichever is provided)
    const contentDescription = overview || description;

    // Validate required fields
    if (!title || !contentDescription) {
      return res.status(400).json({
        success: false,
        message: "Title and description/overview are required",
      });
    }

    // Ensure title is a string
    const titleStr = String(title || '');
    
    // Validate title length
    if (titleStr.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Title must be at least 3 characters long",
      });
    }

    // Ensure description is a string
    const descriptionStr = String(contentDescription || '');
    
    // Validate overview/description length
    if (descriptionStr.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Description must be at least 20 characters long",
      });
    }

    // If it's an episode, validate series
    if (contentType === "episode") {
      if (!seriesId) {
        return res.status(400).json({
          success: false,
          message: "Series ID is required for episodes",
        });
      }
      
      // Check if series exists
      const series = await Movie.findByPk(seriesId);
      if (!series || series.contentType !== "series") {
        return res.status(400).json({
          success: false,
          message: "Invalid series ID",
        });
      }
      
      // Check if episode already exists
      const existingEpisode = await Movie.findOne({
        where: {
          seriesId,
          seasonNumber: parseInt(seasonNumber),
          episodeNumber: parseInt(episodeNumber),
          contentType: "episode"
        }
      });
      
      if (existingEpisode) {
        return res.status(400).json({
          success: false,
          message: `Episode S${seasonNumber}E${episodeNumber} already exists in this series`,
        });
      }
    }

    // If creating a series, validate series-specific fields
    if (contentType === "series") {
      if (!releaseSchedule) {
        return res.status(400).json({
          success: false,
          message: "Release schedule is required for series",
        });
      }
    }

    // Check if files are uploaded based on content type
    if (contentType === "series") {
      // Series only needs poster and backdrop, NO video file
      if (!req.files || !req.files.posterFile || !req.files.backdropFile) {
        console.error("❌ Missing files for series:", {
          hasPosterFile: !!req.files?.posterFile,
          hasBackdropFile: !!req.files?.backdropFile,
        });
        return res.status(400).json({
          success: false,
          message: "Poster image and backdrop image are required for series",
        });
      }
    } else {
      // Movies and episodes need all files
      if (!req.files || !req.files.videoFile || !req.files.posterFile || !req.files.backdropFile) {
        console.error("❌ Missing files:", {
          hasVideoFile: !!req.files?.videoFile,
          hasPosterFile: !!req.files?.posterFile,
          hasBackdropFile: !!req.files?.backdropFile,
        });
        return res.status(400).json({
          success: false,
          message: "Video file, poster image, and backdrop image are required",
        });
      }
    }

    // Validate video file if provided (only for movies and episodes)
    if (contentType !== "series" && req.files?.videoFile && !req.files.videoFile[0].mimetype.startsWith("video/")) {
      return res.status(400).json({
        success: false,
        message: "Video file must be a valid video format",
      });
    }

    // Validate video file size (5GB = 5 * 1024 * 1024 * 1024 bytes)
    if (contentType !== "series" && req.files?.videoFile && req.files.videoFile[0].size > 5 * 1024 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Video file must be less than 5GB",
      });
    }

    // Validate poster image if provided
    if (req.files?.posterFile && !req.files.posterFile[0].mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Poster must be a valid image format",
      });
    }

    // Validate backdrop image if provided
    if (req.files?.backdropFile && !req.files.backdropFile[0].mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Backdrop must be a valid image format",
      });
    }

    // Parse categories robustly. Accept comma-separated string, array, or JSON stringified array
    let parsedCategories = [];
    if (categories) {
      if (typeof categories === "string") {
        const trimmed = categories.trim();
        // If looks like a JSON array, try to parse it
        if (trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              parsedCategories = parsed.map((cat) => String(cat).trim()).filter(Boolean);
            } else {
              // fallback to comma split
              parsedCategories = trimmed.split(",").map((cat) => cat.replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
            }
          } catch (err) {
            // if JSON.parse fails, fallback to comma-separated parsing
            parsedCategories = trimmed.split(",").map((cat) => cat.replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
          }
        } else {
          parsedCategories = trimmed.split(",").map((cat) => cat.trim()).filter(Boolean);
        }
      } else if (Array.isArray(categories)) {
        parsedCategories = categories.map((cat) => String(cat).replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
      }
    }

    // Validate categories ONLY for movies and series (NOT for episodes)
    // Episodes inherit categories from their parent series
    if (contentType === "movie" || contentType === "series") {
      if (!parsedCategories || parsedCategories.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one category is required for movies and series",
        });
      }
    }

    // Parse and validate pricing
    const parsedViewPrice = parseFloat(viewPrice) || 0;
    const parsedDownloadPrice = parseFloat(downloadPrice) || 0;

    if (parsedViewPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "View price cannot be negative",
      });
    }

    if (parsedDownloadPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Download price cannot be negative",
      });
    }

    // Validate royalty percentage
    const parsedRoyalty = parseInt(royaltyPercentage) || 70;
    if (parsedRoyalty < 0 || parsedRoyalty > 100) {
      return res.status(400).json({
        success: false,
        message: "Royalty percentage must be between 0 and 100",
      });
    }

    // Generate slug based on content type
    let slug;
    if (contentType === "episode") {
      // Get series info for episode slug
      const series = await Movie.findByPk(seriesId);
      slug = slugify(
        `${series.title}-s${seasonNumber}e${episodeNumber}-${episodeTitle || title}`,
        { lower: true, strict: true }
      );
    } else {
      slug = slugify(title, { lower: true, strict: true });
    }
    
    // Check if slug already exists
    const existingMovie = await Movie.findOne({ where: { slug } });
    if (existingMovie) {
      slug = `${slug}-${Date.now()}`;
    }

    // Handle file uploads based on content type
    let videoUploadResult = null;
    let posterUploadResult = null;
    let backdropUploadResult = null;

    if (req.files) {
      const { videoFile, posterFile, backdropFile } = req.files;

      // Upload video for movies and episodes ONLY (not for series)
      if (contentType !== "series" && videoFile && videoFile[0]) {
        videoUploadResult = await uploadToB2(
          videoFile[0].buffer,
          videoFile[0].originalname,
          {
            folder: contentType === "episode" ? "series/videos" : "movies/videos",
            resource_type: "video",
            mimeType: videoFile[0].mimetype,
          }
        );
      }

      // Upload poster for ALL content types
      if (posterFile && posterFile[0]) {
        posterUploadResult = await uploadToB2(
          posterFile[0].buffer,
          posterFile[0].originalname,
          {
            folder: contentType === "episode" ? "series/posters" : 
                    contentType === "series" ? "series/posters" : "movies/posters",
            resource_type: "image",
            mimeType: posterFile[0].mimetype,
          }
        );
      }

      // Upload backdrop for ALL content types
      if (backdropFile && backdropFile[0]) {
        backdropUploadResult = await uploadToB2(
          backdropFile[0].buffer,
          backdropFile[0].originalname,
          {
            folder: contentType === "episode" ? "series/backdrops" : 
                    contentType === "series" ? "series/backdrops" : "movies/backdrops",
            resource_type: "image",
            mimeType: backdropFile[0].mimetype,
          }
        );
      }
    }

    // Parse tags and keywords
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === "string" 
        ? tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : tags;
    }

    let parsedKeywords = [];
    if (keywords) {
      parsedKeywords = typeof keywords === "string" 
        ? keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean)
        : keywords;
    }

    // Get series info if this is an episode
    let seriesInfo = {};
    if (contentType === "episode" && seriesId) {
      const series = await Movie.findByPk(seriesId);
      seriesInfo = {
        seriesTitle: series.title,
        seriesOverview: series.overview || series.description,
        categories: series.categories,
        tags: series.tags,
        keywords: series.keywords,
        language: series.language,
      };
    }

    // Parse pricing tiers
    let parsedPricingTiers = {};
    if (pricingTiers) {
      try {
        parsedPricingTiers = typeof pricingTiers === "string" 
          ? JSON.parse(pricingTiers)
          : pricingTiers;
      } catch (error) {
        console.error("Error parsing pricing tiers:", error);
      }
    }

    // Create default pricing tiers for episodes
    if (contentType === "episode" && Object.keys(parsedPricingTiers).length === 0) {
      parsedPricingTiers = {
        "24h": parsedViewPrice * 0.2,
        "7d": parsedViewPrice * 0.5,
        "30d": parsedViewPrice * 1.5,
        "90d": parsedViewPrice * 3,
        "180d": parsedViewPrice * 5,
        "365d": parsedViewPrice * 8
      };
    }

    // Parse release schedule for series
    let parsedReleaseSchedule = {};
    if (releaseSchedule) {
      try {
        parsedReleaseSchedule = typeof releaseSchedule === "string"
          ? JSON.parse(releaseSchedule)
          : releaseSchedule;
      } catch (error) {
        console.error("Error parsing release schedule:", error);
      }
    }

    // Create movie/series/episode - USE descriptionStr instead of contentDescription
    const newContent = await Movie.create({
      title: titleStr.trim(),
      description: descriptionStr.trim(), // Use the string version
      release_date: release_date || new Date().toISOString().split("T")[0],
      slug,
      contentType,
      
      // Series/episode fields
      ...(contentType === "episode" && {
        seriesId,
        seasonNumber: parseInt(seasonNumber),
        episodeNumber: parseInt(episodeNumber),
      }),
      
      ...(contentType === "series" && {
        totalSeasons: parseInt(totalSeasons),
      }),
      
      // Video URLs (only for movies and episodes)
      ...(contentType !== "series" && videoUploadResult && {
        videoUrl: videoUploadResult.secure_url,
        streamingUrl: videoUploadResult.secure_url,
        videoQuality: videoQuality || "720p",
        videoDuration: parseInt(videoDuration) || 0,
        fileSize: Math.round(req.files.videoFile[0].size / (1024 * 1024)),
      }),
      
      // Image URLs (if uploaded)
      ...(posterUploadResult && {
        poster: posterUploadResult.secure_url,
        posterPublicId: posterUploadResult.public_id,
      }),
      
      ...(backdropUploadResult && {
        backdrop: backdropUploadResult.secure_url,
        backdropPublicId: backdropUploadResult.public_id,
      }),
      
      // Filmmaker info
      filmmakerId: req.user.id,
      
      // Pricing
      viewPrice: parsedViewPrice,
      downloadPrice: parsedDownloadPrice,
      price: parsedViewPrice,
      currency: currency || "RWF",
      royaltyPercentage: parsedRoyalty,
      
      // Categories and tags (use series categories for episodes)
      categories: contentType === "episode" ? seriesInfo.categories : parsedCategories,
      tags: contentType === "episode" ? seriesInfo.tags : parsedTags,
      
      // Settings
      language: contentType === "episode" ? seriesInfo.language : (language || "en"),
      
      // Status
      status: "submitted",
      uploadedAt: new Date(),
      processingStatus: "completed",
      
      // Initialize counters
      totalViews: 0,
      totalRevenue: 0,
      avgRating: 0,
      totalReviews: 0,
    });

    // Update series episode count if this is an episode
    if (contentType === "episode") {
      const episodeCount = await Movie.count({
        where: {
          seriesId,
          contentType: 'episode',
          status: { [Op.in]: ['approved', 'submitted'] }
        }
      });
      
      await Movie.update(
        { totalEpisodes: episodeCount },
        { where: { id: seriesId } }
      );
    }

    // Return success response
    const responseData = {
      id: newContent.id,
      title: newContent.title,
      slug: newContent.slug,
      contentType: newContent.contentType,
      status: newContent.status,
      poster: newContent.poster,
      backdrop: newContent.backdrop,
      viewPrice: newContent.viewPrice,
      downloadPrice: newContent.downloadPrice,
      currency: newContent.currency,
      categories: newContent.categories,
    };

    if (contentType === "episode") {
      responseData.seriesId = newContent.seriesId;
      responseData.seasonNumber = newContent.seasonNumber;
      responseData.episodeNumber = newContent.episodeNumber;
    }

    if (contentType === "series") {
      responseData.totalSeasons = newContent.totalSeasons;
      responseData.totalEpisodes = newContent.totalEpisodes;
    }

    res.status(201).json({
      success: true,
      message: contentType === "series" ? "Series created successfully!" : 
               contentType === "episode" ? "Episode uploaded successfully!" : 
               "Movie uploaded successfully! Awaiting admin approval.",
      data: {
        content: responseData,
      },
    });
  } catch (error) {
    console.error("❌ Error uploading content:", error);

    // Handle Sequelize validation errors
    if (error.name === "SequelizeValidationError") {
      const messages = error.errors.map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    // Handle duplicate slug error
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        success: false,
        message: "Content with this title already exists",
      });
    }

    // Handle B2 upload errors
    if (error.message && (error.message.includes("B2") || error.message.includes("upload"))) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload files to B2 storage. Please try again.",
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      message: "Failed to upload content. Please try again later.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get All Movies (with filtering for all content types)
export const getAllMovies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "approved",
      category,
      search,
      sortBy = "createdAt",
      order = "desc",
      minViewPrice,
      maxViewPrice,
      minDownloadPrice,
      maxDownloadPrice,
      freeToView,
      freeToDownload,
      
      // New filters
      contentType,
      seriesId,
      season,
      filmmakerId,
      excludeEpisodes = "true", // Default to TRUE to exclude episodes
      minRating,
      maxRating,
    } = req.query;

    // Build WHERE clause for Sequelize
    const where = {};
    
    // Status filter
    if (status) {
      where.status = status;
    } else {
      where.status = "approved";
    }

    // Content type filter
    if (contentType) {
      where.contentType = contentType;
    } else if (excludeEpisodes === "true") {
      // DEFAULT: Exclude episodes, only show movies and series
      where.contentType = { [Op.in]: ["movie", "series"] };
    }

    // Series filter - if seriesId provided, show episodes
    if (seriesId) {
      where.seriesId = seriesId;
      where.contentType = "episode";
    }

    // Season filter (for episodes)
    if (season) {
      where.seasonNumber = parseInt(season);
    }

    // Filmmaker filter
    if (filmmakerId) {
      where.filmmakerId = filmmakerId;
    }

    // Category filter
    if (category) {
      where.categories = { [Op.contains]: [category] };
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Rating filters
    if (minRating !== undefined) {
      where.avgRating = { ...where.avgRating, [Op.gte]: parseFloat(minRating) };
    }
    if (maxRating !== undefined) {
      where.avgRating = { ...where.avgRating, [Op.lte]: parseFloat(maxRating) };
    }

    // Price filters
    if (freeToView === "true") {
      where.viewPrice = 0;
    } else {
      const viewPriceConditions = {};
      if (minViewPrice !== undefined) viewPriceConditions[Op.gte] = parseFloat(minViewPrice);
      if (maxViewPrice !== undefined) viewPriceConditions[Op.lte] = parseFloat(maxViewPrice);
      if (Object.keys(viewPriceConditions).length > 0) {
        where.viewPrice = viewPriceConditions;
      }
    }

    if (freeToDownload === "true") {
      where.downloadPrice = 0;
    } else {
      const downloadPriceConditions = {};
      if (minDownloadPrice !== undefined) downloadPriceConditions[Op.gte] = parseFloat(minDownloadPrice);
      if (maxDownloadPrice !== undefined) downloadPriceConditions[Op.lte] = parseFloat(maxDownloadPrice);
      if (Object.keys(downloadPriceConditions).length > 0) {
        where.downloadPrice = downloadPriceConditions;
      }
    }

    // Handle "upcoming" filter
    if (sortBy === "upcoming") {
      where.release_date = { [Op.gt]: new Date() };
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Sorting
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    let orderOptions = [];
    
    // Handle different sort options - map query params to actual database columns
    switch (sortBy) {
      case "popular":
        orderOptions = [['totalViews', 'DESC']];
        break;
      case "trending":
        orderOptions = [['totalViews', 'DESC'], ['createdAt', 'DESC']];
        break;
      case "top-rated":
        orderOptions = [['avgRating', 'DESC'], ['totalReviews', 'DESC']];
        break;
      case "recent":
        orderOptions = [['createdAt', 'DESC']];
        break;
      case "price-low":
        orderOptions = [['viewPrice', 'ASC']];
        break;
      case "price-high":
        orderOptions = [['viewPrice', 'DESC']];
        break;
      case "title":
        orderOptions = [['title', sortOrder]];
        break;
      case "release":
        orderOptions = [['release_date', 'DESC']];
        break;
      case "popularity":
        orderOptions = [['popularity', 'DESC']];
        break;
      case "upcoming": // Handle upcoming properly - use release_date for future content
        orderOptions = [['release_date', 'ASC']];
        break;
      default:
        // Only allow sorting by actual database columns
        const validColumns = [
          'createdAt', 'updatedAt', 'title', 'release_date', 'viewPrice', 
          'downloadPrice', 'totalViews', 'avgRating', 'totalReviews', 
          'popularity', 'vote_average', 'totalRevenue', 'uploadedAt'
        ];
        
        if (validColumns.includes(sortBy)) {
          orderOptions = [[sortBy, sortOrder]];
        } else {
          // Default to createdAt if invalid column
          orderOptions = [['createdAt', 'DESC']];
        }
    }

    // For episodes, sort by season and episode number
    if (contentType === "episode" || seriesId) {
      orderOptions = [
        ['seasonNumber', 'ASC'],
        ['episodeNumber', 'ASC'],
        ...orderOptions
      ];
    }

    // Execute query with Sequelize
    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: orderOptions,
      offset,
      limit: parseInt(limit),
    });

    // Transform response based on content type
    const transformedMovies = movies.map(movie => {
      const base = {
        id: movie.id,
        title: movie.title,
        slug: movie.slug,
        contentType: movie.contentType,
        description: movie.description,
        overview: movie.description, // For backward compatibility
        poster: movie.poster,
        backdrop: movie.backdrop,
        viewPrice: movie.viewPrice,
        downloadPrice: movie.downloadPrice,
        currency: movie.currency,
        avgRating: movie.avgRating,
        totalViews: movie.totalViews,
        totalReviews: movie.totalReviews,
        status: movie.status,
        createdAt: movie.createdAt,
        categories: movie.categories,
        tags: movie.tags,
        language: movie.language,
        videoDuration: movie.videoDuration,
        release_date: movie.release_date,
      };

      if (movie.contentType === "episode") {
        return {
          ...base,
          seasonNumber: movie.seasonNumber,
          episodeNumber: movie.episodeNumber,
          seriesId: movie.seriesId,
        };
      }

      if (movie.contentType === "series") {
        return {
          ...base,
          totalSeasons: movie.totalSeasons,
          totalEpisodes: movie.totalEpisodes,
        };
      }

      return base;
    });

    res.status(200).json({
      success: true,
      data: {
        movies: transformedMovies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / parseInt(limit)),
        },
        filters: {
          contentType: contentType || (excludeEpisodes === "true" ? "movie,series" : "all"),
          status,
          category,
          search,
          seriesId,
          season,
          excludeEpisodes,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch content",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};



export const getFilmmakerSeries = async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const seriesList = await Movie.findAll({
      where: {
        filmmakerId,
        contentType: "series",
        status: { [Op.in]: ["approved", "submitted"] } // <-- Include both statuses
      },
      order: [["createdAt", "DESC"]]
    });
    
    res.status(200).json({
      success: true,
      data: seriesList
    });
  } catch (error) {
    console.error("Error fetching filmmaker series:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filmmaker series",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

// 📌 Get Movie by ID or Slug
export const getMovieById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Try to find by ID first
    let movie = await Movie.findByPk(id);

    // If not found by ID, try by slug
    if (!movie) {
      movie = await Movie.findOne({
        where: { slug: id }
      });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Check if user has access
    let userHasAccess = false;
    let accessType = null;
    let expiresAt = null;
    let accessDetails = null;

    if (userId) {
      
      // Check individual access - simplified query
      let individualAccess = await UserAccess.findOne({
        where: {
          userId: userId,
          movieId: movie.id,
          status: "active"
        },
      });

      // If found, check if it's still valid (or has no expiry)
      if (individualAccess) {
        const hasExpiry = individualAccess.expiresAt !== null && individualAccess.expiresAt !== undefined;
        const isExpired = hasExpiry && new Date(individualAccess.expiresAt) <= new Date();
        
        if (!isExpired) {
          userHasAccess = true;
          accessType = "individual";
          expiresAt = individualAccess.expiresAt;
          accessDetails = individualAccess;
          // console.log(`   ✅ Access GRANTED`);
        } else {
          console.log(`   ❌ Access expired`);
        }
      }

      // Check series access if this is an episode
      if (!userHasAccess && movie.contentType === "episode" && movie.seriesId) {
        const seriesAccess = await UserAccess.findOne({
          where: {
            userId,
            seriesId: movie.seriesId,
            status: "active"
          }
        });

        if (seriesAccess) {
          const hasExpiry = seriesAccess.expiresAt !== null && seriesAccess.expiresAt !== undefined;
          const isExpired = hasExpiry && new Date(seriesAccess.expiresAt) <= new Date();
          
          if (!isExpired) {
            userHasAccess = true;
            accessType = "series";
            expiresAt = seriesAccess.expiresAt;
            accessDetails = seriesAccess;
            // console.log(`   ✅ Series access GRANTED`);
          }
        }
      }

      // Check if user is the filmmaker
      if (!userHasAccess && movie.filmmakerId === userId) {
        userHasAccess = true;
        accessType = "owner";
      }

      // Check if user has active subscription
      if (!userHasAccess) {
        const user = await User.findByPk(userId);
        if (user && user.isUpgraded && user.subscription) {
          const subscriptionEndDate = new Date(user.subscription.endDate || user.subscription.expiresAt);
          if (subscriptionEndDate > new Date()) {
            userHasAccess = true;
            accessType = "subscription";
            expiresAt = subscriptionEndDate;
            accessDetails = {
              id: user.id,
              plan: user.subscription.planId || user.subscription.planName,
              status: "active",
              expiresAt: subscriptionEndDate
            };
          }
        }
      }
    }

    // Increment view count if user has access or content is free
    if (userHasAccess || movie.viewPrice === 0) {
      movie.totalViews = (movie.totalViews || 0) + 1;
      await movie.save();
    }

    // Get additional data based on content type
    let additionalData = {};
    
    if (movie.contentType === "series") {
      // Get episodes for series
      const episodes = await Movie.findAll({
        where: {
          seriesId: movie.id,
          contentType: "episode",
          status: "approved"
        },
        order: [
          ["seasonNumber", "ASC"],
          ["episodeNumber", "ASC"]
        ],
        limit: 20
      });

      additionalData.episodes = episodes;
      additionalData.totalEpisodes = await Movie.count({
        where: {
          seriesId: movie.id,
          contentType: "episode",
          status: "approved"
        }
      });

      // Get seasons
      const seasonsData = await Movie.findAll({
        where: {
          seriesId: movie.id,
          contentType: "episode",
          status: "approved"
        },
        attributes: [
          'seasonNumber',
          [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'episodeCount']
        ],
        group: ['seasonNumber'],
        order: [['seasonNumber', 'ASC']]
      });

      additionalData.seasons = seasonsData;
    }

    if (movie.contentType === "episode") {
      // Get series info
      const series = await Movie.findByPk(movie.seriesId);
      additionalData.series = series;

      // Get next and previous episodes
      const [nextEpisode, previousEpisode] = await Promise.all([
        Movie.findOne({
          where: {
            seriesId: movie.seriesId,
            seasonNumber: movie.seasonNumber,
            episodeNumber: movie.episodeNumber + 1,
            contentType: "episode",
            status: "approved"
          }
        }),
        Movie.findOne({
          where: {
            seriesId: movie.seriesId,
            seasonNumber: movie.seasonNumber,
            episodeNumber: movie.episodeNumber - 1,
            contentType: "episode",
            status: "approved"
          }
        })
      ]);

      additionalData.nextEpisode = nextEpisode;
      additionalData.previousEpisode = previousEpisode;
    }
    
    const responseData = {
      ...movie.toJSON(),
      userAccess: {
        hasAccess: userHasAccess,
        accessType,
        expiresAt,
        requiresPurchase: !userHasAccess && movie.viewPrice > 0,
        price: movie.viewPrice,
      },
      ...additionalData
    };

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error("Error in getMovieById:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Update Movie
export const updateMovie = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      overview,
      viewPrice,
      downloadPrice,
      currency,
      royaltyPercentage,
      categories,
      status,
      
      // New fields
      contentType,
      seriesId,
      seasonNumber,
      episodeNumber,
      totalSeasons,
    } = req.body;

    const movie = await Movie.findByPk(id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Content not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this content",
      });
    }

    // Update fields
    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (overview) updateData.description = overview; // Map overview to description
    if (viewPrice !== undefined) updateData.viewPrice = parseFloat(viewPrice);
    if (downloadPrice !== undefined) updateData.downloadPrice = parseFloat(downloadPrice);
    if (currency) updateData.currency = currency;
    if (royaltyPercentage !== undefined) updateData.royaltyPercentage = parseInt(royaltyPercentage);
    if (categories) {
      if (Array.isArray(categories)) {
        updateData.categories = categories.map((cat) => String(cat).replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
      } else if (typeof categories === 'string') {
        const trimmed = categories.trim();
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            updateData.categories = Array.isArray(parsed) ? parsed.map((c) => String(c).trim()).filter(Boolean) : trimmed.split(',').map(c => c.replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
          } catch (err) {
            updateData.categories = trimmed.split(',').map(c => c.replace(/^[\[\]"]+|[\[\]"]+$/g, "").trim()).filter(Boolean);
          }
        } else {
          updateData.categories = trimmed.split(',').map(c => c.trim()).filter(Boolean);
        }
      }
    }
    if (status) updateData.status = status;
    if (contentType) updateData.contentType = contentType;
    if (seriesId) updateData.seriesId = seriesId;
    if (seasonNumber !== undefined) updateData.seasonNumber = parseInt(seasonNumber);
    if (episodeNumber !== undefined) updateData.episodeNumber = parseInt(episodeNumber);
    if (totalSeasons !== undefined) updateData.totalSeasons = parseInt(totalSeasons);
    
    // Update legacy price field for backward compatibility
    if (viewPrice !== undefined) updateData.price = parseFloat(viewPrice);

    await movie.update(updateData);

    // Update series episode count if episode moved to different series
    if (movie.contentType === "episode" && 
        (seriesId !== movie.seriesId || episodeNumber !== movie.episodeNumber)) {
      
      // Update old series count
      if (movie.seriesId) {
        const oldEpisodeCount = await Movie.count({
          where: {
            seriesId: movie.seriesId,
            contentType: 'episode',
            status: { [Op.in]: ['approved', 'submitted'] }
          }
        });
        
        await Movie.update(
          { totalEpisodes: oldEpisodeCount },
          { where: { id: movie.seriesId } }
        );
      }
      
      // Update new series count
      if (seriesId) {
        const newEpisodeCount = await Movie.count({
          where: {
            seriesId: seriesId,
            contentType: 'episode',
            status: { [Op.in]: ['approved', 'submitted'] }
          }
        });
        
        await Movie.update(
          { totalEpisodes: newEpisodeCount },
          { where: { id: seriesId } }
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Content updated successfully",
      data: { movie },
    });
  } catch (error) {
    console.error("Error updating content:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update content",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Delete Movie (Admin or Filmmaker)
export const deleteMovie = async (req, res) => {
  try {
    const { id } = req.params;

    const movie = await Movie.findByPk(id);

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Authorization: Only filmmaker or admin can delete
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized to delete this content" 
      });
    }

    // If deleting a series, check if it has episodes
    if (movie.contentType === "series") {
      const episodeCount = await Movie.count({
        where: {
          seriesId: movie.id,
          contentType: 'episode'
        }
      });
      
      if (episodeCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete series with episodes. Delete episodes first.",
          episodeCount
        });
      }
    }

    // Delete associated files from B2
    if (movie.posterPublicId) {
      await deleteFromB2(movie.posterPublicId);
    }
    if (movie.backdropPublicId) {
      await deleteFromB2(movie.backdropPublicId);
    }
    // Note: Video file deletion might need additional handling
    if (movie.videoPublicId) {
      await deleteFromB2(movie.videoPublicId);
    }

    // Update series episode count if this is an episode
    const seriesId = movie.seriesId;
    
    await movie.destroy();

    if (movie.contentType === "episode" && seriesId) {
      const episodeCount = await Movie.count({
        where: {
          seriesId: seriesId,
          contentType: 'episode',
          status: { [Op.in]: ['approved', 'submitted'] }
        }
      });
      
      await Movie.update(
        { totalEpisodes: episodeCount },
        { where: { id: seriesId } }
      );
    }

    res.status(200).json({
      success: true,
      message: "Content deleted successfully",
      contentId: movie.id,
      contentType: movie.contentType,
    });
  } catch (error) {
    console.error("Error in deleteMovie:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Search Movies
export const searchMovies = async (req, res) => {
  try {
    const { query, page = 1, limit = 10, contentType, excludeEpisodes = false } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = {
      status: "approved",
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query] } },
      ]
    };

    // Content type filter
    if (contentType) {
      where.contentType = contentType;
    } else if (excludeEpisodes === "true") {
      where.contentType = { [Op.in]: ["movie", "series"] };
    }

    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      query,
      data: movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error in searchMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Movies by Filmmaker
export const getFilmmakerMovies = async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const { page = 1, limit = 10, contentType } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = { 
      filmmakerId,
      status: "approved"
    };

    if (contentType) {
      where.contentType = contentType;
    }

    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum,
    });

    // Group by content type
    const groupedByType = {
      movies: movies.filter(m => m.contentType === "movie"),
      series: movies.filter(m => m.contentType === "series"),
      episodes: movies.filter(m => m.contentType === "episode"),
    };

    res.status(200).json({
      success: true,
      data: {
        all: movies,
        groupedByType,
        counts: {
          total: count,
          movies: groupedByType.movies.length,
          series: groupedByType.series.length,
          episodes: groupedByType.episodes.length,
        }
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error in getFilmmakerMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Popular/Trending Movies
export const getTrendingMovies = async (req, res) => {
  try {
    const { limit = 10, contentType } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where = { status: "approved" };
    
    if (contentType) {
      where.contentType = contentType;
    }

    const movies = await Movie.findAll({
      where,
      order: [['totalViews', 'DESC'], ['avgRating', 'DESC']],
      limit: limitNum
    });

    res.status(200).json({
      success: true,
      data: movies
    });
  } catch (error) {
    console.error("Error in getTrendingMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Top Rated Movies
export const getTopRatedMovies = async (req, res) => {
  try {
    const { limit = 10, contentType } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where = { 
      status: "approved",
      avgRating: { [Op.gt]: 0 }
    };

    if (contentType) {
      where.contentType = contentType;
    }

    const movies = await Movie.findAll({
      where,
      order: [['avgRating', 'DESC'], ['totalReviews', 'DESC']],
      limit: limitNum
    });

    res.status(200).json({
      success: true,
      data: movies
    });
  } catch (error) {
    console.error("Error in getTopRatedMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Movies by Category
export const getMoviesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, contentType, excludeEpisodes = true } = req.query;

    const validCategories = [
      "Action", "Comedy", "Drama", "Horror", "Thriller", 
      "Romance", "Documentary", "Animation", "Sci-Fi", "Fantasy",
      "Adventure", "Crime", "Mystery", "Family", "Music",
      "History", "War", "Western", "Sport", "Reality"
    ];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Valid categories: ${validCategories.join(", ")}`,
      });
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = { 
      categories: { [Op.contains]: [category] },
      status: "approved" 
    };

    if (contentType) {
      where.contentType = contentType;
    } else if (excludeEpisodes === "true") {
      where.contentType = { [Op.in]: ["movie", "series"] };
    }

    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum
    });

    res.status(200).json({
      success: true,
      category,
      data: movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error in getMoviesByCategory:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Movie Categories
export const getMovieCategories = async (req, res) => {
  try {
    const categories = [
      "Action", "Comedy", "Drama", "Horror", "Thriller", 
      "Romance", "Documentary", "Animation", "Sci-Fi", "Fantasy",
      "Adventure", "Crime", "Mystery", "Family", "Music",
      "History", "War", "Western", "Sport", "Reality"
    ];
    
    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Error in getMovieCategories:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// 📌 Get Recent Movies
export const getRecentMovies = async (req, res) => {
  try {
    const { limit = 10, contentType } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where = { status: "approved" };
    
    if (contentType) {
      where.contentType = contentType;
    }

    const movies = await Movie.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum
    });

    res.status(200).json({
      success: true,
      data: movies
    });
  } catch (error) {
    console.error("Error in getRecentMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Movie Statistics
export const getMovieStats = async (req, res) => {
  try {
    const { filmmakerId } = req.params;

    const stats = await Movie.findAll({
      where: { filmmakerId },
      attributes: [
        'status',
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    // Get stats by content type
    const typeStats = await Movie.findAll({
      where: { filmmakerId },
      attributes: [
        'contentType',
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'count'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalViews')), 'totalViews'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalRevenue')), 'totalRevenue']
      ],
      group: ['contentType']
    });

    const totalMovies = await Movie.count({ where: { filmmakerId } });
    const totalViews = await Movie.sum('totalViews', { where: { filmmakerId } });
    const totalRevenue = await Movie.sum('totalRevenue', { where: { filmmakerId } });
    const totalReviews = await Movie.sum('totalReviews', { where: { filmmakerId } });

    res.status(200).json({
      success: true,
      data: {
        totalMovies,
        totalViews: totalViews || 0,
        totalRevenue: totalRevenue || 0,
        totalReviews: totalReviews || 0,
        byStatus: stats,
        byType: typeStats
      }
    });
  } catch (error) {
    console.error("Error in getMovieStats:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== MEDIA UPLOAD FUNCTIONS ======

// 📌 Add Movie Video URL
export const uploadMovieVideo = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { streamingUrl, hlsUrl, quality = "720p", duration, fileSize } = req.body;

    if (!streamingUrl) {
      return res.status(400).json({
        success: false,
        message: "Video URL is required",
      });
    }

    // Validate URL format
    try {
      new URL(streamingUrl);
    } catch (err) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid streaming URL format" 
      });
    }

    // Find movie
    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized" 
      });
    }

    // Update movie with video details
    await movie.update({
      streamingUrl,
      videoUrl: streamingUrl,
      hlsUrl: hlsUrl || streamingUrl,
      videoQuality: quality,
      videoDuration: duration || movie.videoDuration,
      fileSize: fileSize || movie.fileSize,
      processingStatus: "completed",
      uploadedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Video URL added successfully",
      data: {
        id: movie.id,
        title: movie.title,
        contentType: movie.contentType,
        streamingUrl: movie.streamingUrl,
        videoUrl: movie.videoUrl,
        hlsUrl: movie.hlsUrl,
        duration: movie.videoDuration,
        quality: movie.videoQuality,
        processingStatus: movie.processingStatus,
      },
    });
  } catch (error) {
    console.error("Error in uploadMovieVideo:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Upload Poster Image
export const uploadPoster = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No image file provided" 
      });
    }

    const { movieId } = req.params;

    // Find movie
    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized" 
      });
    }

    // Delete old poster if exists
    if (movie.posterPublicId) {
      await deleteFromB2(movie.posterPublicId);
    }

    // Upload new poster to B2
    const uploadResult = await uploadToB2(req.file.buffer, req.file.originalname, {
      folder: movie.contentType === "episode" ? "series/posters" : "movies/posters",
      resource_type: "image",
      mimeType: req.file.mimetype,
    });

    // Update movie
    await movie.update({
      poster: uploadResult.secure_url,
      posterPublicId: uploadResult.public_id,
    });

    res.status(200).json({
      success: true,
      message: "Poster uploaded successfully",
      data: {
        posterUrl: movie.poster,
      },
    });
  } catch (error) {
    console.error("Error in uploadPoster:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Upload Backdrop Image
export const uploadBackdrop = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No image file provided" 
      });
    }

    const { movieId } = req.params;

    // Find movie
    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized" 
      });
    }

    // Delete old backdrop if exists
    if (movie.backdropPublicId) {
      await deleteFromB2(movie.backdropPublicId);
    }

    // Upload new backdrop to B2
    const uploadResult = await uploadToB2(req.file.buffer, req.file.originalname, {
      folder: movie.contentType === "episode" ? "series/backdrops" : "movies/backdrops",
      resource_type: "image",
      mimeType: req.file.mimetype,
    });

    // Update movie
    await movie.update({
      backdrop: uploadResult.secure_url,
      backdropPublicId: uploadResult.public_id,
    });

    res.status(200).json({
      success: true,
      message: "Backdrop uploaded successfully",
      data: {
        backdropUrl: movie.backdrop,
      },
    });
  } catch (error) {
    console.error("Error in uploadBackdrop:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Streaming URLs
export const getStreamingUrls = async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user?.id;

    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // Check access
    let hasAccess = false;
    if (userId) {
      // Check individual access
      const individualAccess = await UserAccess.findOne({
        where: {
          userId,
          movieId: movie.id,
          status: "active",
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: new Date() } }
          ]
        },
      });

      // Check series access for episodes
      if (!individualAccess && movie.contentType === "episode" && movie.seriesId) {
        const seriesAccess = await UserAccess.findOne({
          where: {
            userId,
            seriesId: movie.seriesId,
            status: "active",
            expiresAt: { [Op.gt]: new Date() }
          },
        });
        
        if (seriesAccess) hasAccess = true;
      } else if (individualAccess) {
        hasAccess = true;
      }

      // Check if user is filmmaker
      if (!hasAccess && movie.filmmakerId === userId) {
        hasAccess = true;
      }
    }

    // Check if content is free
    if (!hasAccess && movie.viewPrice === 0) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Purchase required.",
        data: {
          contentId: movie.id,
          title: movie.title,
          contentType: movie.contentType,
          price: movie.viewPrice,
          requiresPurchase: true,
        },
      });
    }

    if (!movie.hlsUrl && !movie.streamingUrl) {
      return res.status(400).json({ 
        success: false,
        message: "Content video not uploaded yet" 
      });
    }

    // Increment view count
    movie.totalViews = (movie.totalViews || 0) + 1;
    await movie.save();

    // Get episode info if applicable
    let episodeInfo = {};
    if (movie.contentType === "episode" && movie.seriesId) {
      const series = await Movie.findByPk(movie.seriesId);
      episodeInfo.series = {
        id: series.id,
        title: series.title,
      };
      
      // Get next and previous episodes
      const [nextEpisode, previousEpisode] = await Promise.all([
        Movie.findOne({
          where: {
            seriesId: movie.seriesId,
            seasonNumber: movie.seasonNumber,
            episodeNumber: movie.episodeNumber + 1,
            contentType: "episode",
            status: "approved"
          },
          attributes: ['id', 'title', 'slug']
        }),
        Movie.findOne({
          where: {
            seriesId: movie.seriesId,
            seasonNumber: movie.seasonNumber,
            episodeNumber: movie.episodeNumber - 1,
            contentType: "episode",
            status: "approved"
          },
          attributes: ['id', 'title', 'slug']
        })
      ]);
      
      episodeInfo.nextEpisode = nextEpisode;
      episodeInfo.previousEpisode = previousEpisode;
    }

    res.status(200).json({
      success: true,
      data: {
        movieId: movie.id,
        title: movie.title,
        contentType: movie.contentType,
        duration: movie.videoDuration,
        hlsUrl: movie.hlsUrl,
        streamingUrl: movie.streamingUrl,
        streamingUrls: {
          default: movie.videoUrl,
          hls: movie.hlsUrl,
        },
        thumbnail: movie.thumbnail,
        ...episodeInfo
      },
    });
  } catch (error) {
    console.error("Error in getStreamingUrls:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Check Access for Content
export const checkContentAccess = async (req, res) => {
  try {
    const { movieId } = req.params;
    const userId = req.user?.id;

    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Content not found",
      });
    }

    let hasAccess = false;
    let accessType = null;
    let expiresAt = null;
    let accessDetails = null;

    if (userId) {
      // Check individual access
      const individualAccess = await UserAccess.findOne({
        where: {
          userId,
          movieId: movie.id,
          status: "active",
          [Op.or]: [
            { expiresAt: null },
            { expiresAt: { [Op.gt]: new Date() } }
          ]
        },
      });

      if (individualAccess) {
        hasAccess = true;
        accessType = "individual";
        expiresAt = individualAccess.expiresAt;
        accessDetails = individualAccess;
      }

      // Check series access for episodes
      if (!hasAccess && movie.contentType === "episode" && movie.seriesId) {
        const seriesAccess = await UserAccess.findOne({
          where: {
            userId,
            seriesId: movie.seriesId,
            status: "active",
            expiresAt: { [Op.gt]: new Date() }
          },
        });

        if (seriesAccess) {
          hasAccess = true;
          accessType = "series";
          expiresAt = seriesAccess.expiresAt;
          accessDetails = seriesAccess;
        }
      }

      // Check if user is filmmaker
      if (!hasAccess && movie.filmmakerId === userId) {
        hasAccess = true;
        accessType = "owner";
      }
    }

    // Check if content is free
    if (!hasAccess && movie.viewPrice === 0) {
      hasAccess = true;
      accessType = "free";
    }

    // Calculate days remaining if expiresAt exists
    let daysRemaining = null;
    if (expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    }

    res.status(200).json({
      success: true,
      data: {
        hasAccess,
        accessType,
        expiresAt,
        daysRemaining,
        requiresPurchase: !hasAccess && movie.viewPrice > 0,
        content: {
          id: movie.id,
          title: movie.title,
          contentType: movie.contentType,
          viewPrice: movie.viewPrice,
          seriesId: movie.seriesId,
          seasonNumber: movie.seasonNumber,
          episodeNumber: movie.episodeNumber,
        },
        accessDetails: accessDetails ? {
          id: accessDetails.id,
          accessPeriod: accessDetails.accessPeriod,
          purchasedAt: accessDetails.createdAt,
        } : null,
      },
    });
  } catch (error) {
    console.error("Error in checkContentAccess:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// 📌 Get User's Purchased Content
export const getUserPurchasedContent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, contentType, activeOnly = true } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = { userId };
    
    if (activeOnly === "true") {
      where.status = "active";
      where[Op.or] = [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ];
    }

    // Get user access records
    const { count, rows: accessRecords } = await UserAccess.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum,
      include: [{
        model: Movie,
        as: 'content',
        attributes: ['id', 'title', 'contentType', 'poster', 'backdrop', 'description', 
                    'videoDuration', 'avgRating', 'totalViews', 'createdAt',
                    'seriesId', 'seasonNumber', 'episodeNumber']
      }]
    });

    // Group by content type and series
    const groupedContent = {
      movies: [],
      series: [],
      episodes: [],
      seriesAccess: []
    };

    accessRecords.forEach(access => {
      const content = access.content;
      if (!content) return;

      const item = {
        accessId: access.id,
        purchasedAt: access.createdAt,
        expiresAt: access.expiresAt,
        accessPeriod: access.accessPeriod,
        pricePaid: access.pricePaid,
        currency: access.currency,
        ...content.toJSON()
      };

      if (access.accessType === "series") {
        groupedContent.seriesAccess.push(item);
      } else if (content.contentType === "movie") {
        groupedContent.movies.push(item);
      } else if (content.contentType === "series") {
        groupedContent.series.push(item);
      } else if (content.contentType === "episode") {
        groupedContent.episodes.push(item);
      }
    });

    // Calculate summary
    const totalSpent = await UserAccess.sum('pricePaid', { where: { userId, status: 'active' } });
    const activeAccessCount = await UserAccess.count({
      where: {
        userId,
        status: 'active',
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      }
    });

    res.status(200).json({
      success: true,
      data: {
        groupedContent,
        summary: {
          totalPurchases: count,
          activeAccess: activeAccessCount,
          totalSpent: totalSpent || 0,
          moviesCount: groupedContent.movies.length,
          seriesCount: groupedContent.series.length,
          episodesCount: groupedContent.episodes.length,
          seriesAccessCount: groupedContent.seriesAccess.length,
        }
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error in getUserPurchasedContent:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const addRatingMovies = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { rating } = req.body;
    const userId = req.user.id; 
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }
    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Content not found",
      });
    } 
    let existingRating = await MovieRating.findOne({
      where: {
        userId,
        movieId: movie.id
      }
    });
    if (existingRating) {
      existingRating.rating = rating;
      await existingRating.save();
    }
    else {
      existingRating = await MovieRating.create({
        userId,
        movieId: movie.id,
        rating
      });
    }
    const ratings = await MovieRating.findAll({
      where: { movieId: movie.id }
    });
    const totalRatings = ratings.length;
    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;
    movie.avgRating = parseFloat(avgRating.toFixed(2));
    movie.totalReviews = totalRatings;
    await movie.save();
    res.status(200).json({
      success: true,
      data: {
        movieId: movie.id,
        title: movie.title,
        avgRating: movie.avgRating,
        totalReviews: movie.totalReviews,
        rating: existingRating.rating
      }
    });
  }
  catch (error) {
    console.error("Error in addRatingMovies:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};