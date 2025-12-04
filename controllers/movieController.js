import Movie from "../models/Movie.model.js";
import slugify from "slugify";
import { uploadToB2, deleteFromB2 } from "../utils/backblazeB2.js";
import { Op } from "sequelize";

// ====== CRUD OPERATIONS ======

// 📌 Upload/Create Movie (Filmmaker) - WITH SEPARATE VIEW/DOWNLOAD PRICING
export const addMovie = async (req, res) => {
  try {
    // Extract form data
    const {
      title,
      original_title,
      overview,
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
    } = req.body;

    // Validate required fields
    if (!title || !overview) {
      return res.status(400).json({
        success: false,
        message: "Title and overview are required",
      });
    }

    // Validate title length
    if (title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Title must be at least 3 characters long",
      });
    }

    // Validate overview length
    if (overview.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Overview must be at least 20 characters long",
      });
    }

    // Check if files are uploaded
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

    const { videoFile, posterFile, backdropFile } = req.files;

    // Validate video file
    if (!videoFile[0].mimetype.startsWith("video/")) {
      return res.status(400).json({
        success: false,
        message: "Video file must be a valid video format",
      });
    }

    // Validate video file size (5GB = 5 * 1024 * 1024 * 1024 bytes)
    if (videoFile[0].size > 5 * 1024 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Video file must be less than 5GB",
      });
    }

    // Validate poster image
    if (!posterFile[0].mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Poster must be a valid image format",
      });
    }

    // Validate backdrop image
    if (!backdropFile[0].mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Backdrop must be a valid image format",
      });
    }

    // Parse categories - handle both comma-separated string and array
    let parsedCategories = [];
    if (categories) {
      if (typeof categories === "string") {
        parsedCategories = categories.split(",").map((cat) => cat.trim()).filter(Boolean);
      } else if (Array.isArray(categories)) {
        parsedCategories = categories.map((cat) => cat.trim()).filter(Boolean);
      }
    }

    // Validate categories
    if (!parsedCategories || parsedCategories.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one category is required",
      });
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

    // Generate unique slug from title
    let slug = slugify(title, { lower: true, strict: true });
    
    // Check if slug already exists
    const existingMovie = await Movie.findOne({ where: { slug } });
    if (existingMovie) {
      slug = `${slug}-${Date.now()}`;
    }

    // Upload video to Backblaze B2
    const videoUploadResult = await uploadToB2(
      videoFile[0].buffer,
      videoFile[0].originalname,
      {
        folder: "movies/videos",
        resource_type: "video",
        mimeType: videoFile[0].mimetype,
      }
    );

    // Upload poster to Backblaze B2
    const posterUploadResult = await uploadToB2(
      posterFile[0].buffer,
      posterFile[0].originalname,
      {
        folder: "movies/posters",
        resource_type: "image",
        mimeType: posterFile[0].mimetype,
      }
    );

    // Upload backdrop to Backblaze B2
    const backdropUploadResult = await uploadToB2(
      backdropFile[0].buffer,
      backdropFile[0].originalname,
      {
        folder: "movies/backdrops",
        resource_type: "image",
        mimeType: backdropFile[0].mimetype,
      }
    );

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

    // Create new movie with Sequelize
    const newMovie = await Movie.create({
      title: title.trim(),
      original_title: original_title?.trim() || title.trim(),
      overview: overview.trim(),
      release_date: release_date || new Date().toISOString().split("T")[0],
      slug,
      
      // Video URLs
      videoUrl: videoUploadResult.secure_url,
      streamingUrl: videoUploadResult.secure_url,
      videoQuality: videoQuality || "720p",
      videoDuration: parseInt(videoDuration) || 0,
      fileSize: Math.round(videoFile[0].size / (1024 * 1024)),
      
      // Image URLs
      poster: posterUploadResult.secure_url,
      posterPublicId: posterUploadResult.public_id,
      backdrop: backdropUploadResult.secure_url,
      backdropPublicId: backdropUploadResult.public_id,
      poster_path: posterUploadResult.secure_url,
      backdrop_path: backdropUploadResult.secure_url,
      
      // Filmmaker info
      filmmakerId: req.user.id,
      
      // Pricing
      viewPrice: parsedViewPrice,
      downloadPrice: parsedDownloadPrice,
      price: parsedViewPrice,
      currency: currency || "RWF",
      royaltyPercentage: parsedRoyalty,
      
      // Categories and tags
      categories: parsedCategories,
      tags: parsedTags,
      keywords: parsedKeywords,
      
      // Settings
      allowDownload: allowDownload === "true" || allowDownload === true,
      downloadExpiry: parseInt(downloadExpiry) || 30,
      language: language || "en",
      
      // Status
      status: "submitted",
      submittedAt: new Date(),
      uploadedAt: new Date(),
      processingStatus: "completed",
      
      // Initialize counters
      totalViews: 0,
      totalDownloads: 0,
      totalRevenue: 0,
      avgRating: 0,
      reviewCount: 0,
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: "Movie uploaded successfully! Awaiting admin approval.",
      data: {
        movie: {
          id: newMovie.id,
          title: newMovie.title,
          slug: newMovie.slug,
          status: newMovie.status,
          poster: newMovie.poster,
          backdrop: newMovie.backdrop,
          videoUrl: newMovie.videoUrl,
          viewPrice: newMovie.viewPrice,
          downloadPrice: newMovie.downloadPrice,
          currency: newMovie.currency,
          categories: newMovie.categories,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error uploading movie:", error);

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
        message: "A movie with this title already exists",
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
      message: "Failed to upload movie. Please try again later.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get All Movies (with pricing filters)
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
    } = req.query;

    // Build WHERE clause for Sequelize
    const where = { status };

    // Category filter
    if (category) {
      where.categories = { [Op.contains]: [category] };
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { overview: { [Op.iLike]: `%${search}%` } },
      ];
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

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Sorting
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    const orderOptions = [[sortBy, sortOrder]];

    // Execute query with Sequelize
    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: orderOptions,
      offset,
      limit: parseInt(limit),
    });

    res.status(200).json({
      success: true,
      data: {
        movies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching movies:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch movies",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Update Movie (with pricing)
export const updateMovie = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      overview,
      viewPrice,
      downloadPrice,
      currency,
      royaltyPercentage,
      categories,
      allowDownload,
      status,
    } = req.body;

    const movie = await Movie.findByPk(id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this movie",
      });
    }

    // Update fields
    const updateData = {};
    if (title) updateData.title = title;
    if (overview) updateData.overview = overview;
    if (viewPrice !== undefined) updateData.viewPrice = parseFloat(viewPrice);
    if (downloadPrice !== undefined) updateData.downloadPrice = parseFloat(downloadPrice);
    if (currency) updateData.currency = currency;
    if (royaltyPercentage !== undefined) updateData.royaltyPercentage = parseInt(royaltyPercentage);
    if (categories) updateData.categories = Array.isArray(categories) ? categories : categories.split(',').map(cat => cat.trim());
    if (allowDownload !== undefined) updateData.allowDownload = allowDownload === "true" || allowDownload === true;
    if (status) updateData.status = status;

    // Update legacy price field for backward compatibility
    if (viewPrice !== undefined) updateData.price = parseFloat(viewPrice);

    updateData.lastUpdated = new Date();

    await movie.update(updateData);

    res.status(200).json({
      success: true,
      message: "Movie updated successfully",
      data: { movie },
    });
  } catch (error) {
    console.error("Error updating movie:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update movie",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get All Movies (with Pagination, Filtering, Sorting)
export const getMovies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      sortBy,
      order = "desc",
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    let where = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.categories = { [Op.contains]: [category] };
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { overview: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Determine sort order
    let orderOptions = [];
    let appliedSort = "none";

    if (sortBy) {
      const sortByLower = sortBy.toLowerCase();

      switch (sortByLower) {
        case "upcoming":
          orderOptions = [['createdAt', 'DESC']];
          appliedSort = "upcoming";
          break;
        case "trending":
          orderOptions = [['totalViews', 'DESC'], ['totalDownloads', 'DESC'], ['totalRevenue', 'DESC']];
          appliedSort = "trending";
          break;
        case "top-rated":
        case "toprated":
          orderOptions = [['avgRating', 'DESC'], ['reviewCount', 'DESC']];
          appliedSort = "top-rated";
          break;
        case "featured":
          orderOptions = [['totalRevenue', 'DESC'], ['totalViews', 'DESC']];
          appliedSort = "featured";
          break;
        case "popular":
          orderOptions = [['totalViews', 'DESC'], ['totalDownloads', 'DESC']];
          appliedSort = "popular";
          break;
        case "recent":
          orderOptions = [['updatedAt', 'DESC']];
          appliedSort = "recent";
          break;
        default:
          orderOptions = [[sortByLower, order === "asc" ? "ASC" : "DESC"]];
          appliedSort = sortByLower;
      }
    }

    // Execute query
    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: orderOptions,
      offset,
      limit: limitNum,
    });

    res.status(200).json({
      success: true,
      sortedBy: appliedSort === "none" ? "none (default insertion order)" : appliedSort,
      requestedSort: sortBy || null,
      data: movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
      availableSorts: [
        "upcoming",
        "trending",
        "top-rated",
        "featured",
        "popular",
        "recent"
      ],
    });
  } catch (error) {
    console.error("Error in getMovies:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Movie by ID or Slug
export const getMovieById = async (req, res) => {
  try {
    const { id } = req.params;

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
        message: "Movie not found" 
      });
    }

    // Increment view count
    movie.totalViews = (movie.totalViews || 0) + 1;
    await movie.save();

    res.status(200).json({
      success: true,
      data: movie
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

// 📌 Delete Movie (Admin or Filmmaker)
export const deleteMovie = async (req, res) => {
  try {
    const { id } = req.params;

    const movie = await Movie.findByPk(id);

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Movie not found" 
      });
    }

    // Authorization: Only filmmaker or admin can delete
    if (req.user.role !== "admin" && movie.filmmakerId !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized to delete this movie" 
      });
    }

    // Delete associated files from B2
    if (movie.posterPublicId) {
      await deleteFromB2(movie.posterPublicId);
    }
    if (movie.backdropPublicId) {
      await deleteFromB2(movie.backdropPublicId);
    }

    await movie.destroy();

    res.status(200).json({
      success: true,
      message: "Movie deleted successfully",
      movieId: movie.id,
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
    const { query, page = 1, limit = 10 } = req.query;

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
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { overview: { [Op.iLike]: `%${query}%` } },
      ]
    };

    const { count, rows: movies } = await Movie.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum
    });

    res.status(200).json({
      success: true,
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
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows: movies } = await Movie.findAndCountAll({
      where: { filmmakerId },
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum
    });

    res.status(200).json({
      success: true,
      data: movies,
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
    const { limit = 10 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const movies = await Movie.findAll({
      where: { status: "approved" },
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
    const { limit = 10 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const movies = await Movie.findAll({
      where: { 
        status: "approved",
        avgRating: { [Op.gt]: 0 }
      },
      order: [['avgRating', 'DESC'], ['reviewCount', 'DESC']],
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
    const { page = 1, limit = 10 } = req.query;

    const validCategories = [
      "Action", "Comedy", "Drama", "Horror", "Thriller", 
      "Romance", "Documentary", "Animation", "Sci-Fi", "Fantasy",
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

    const { count, rows: movies } = await Movie.findAndCountAll({
      where: { 
        categories: { [Op.contains]: [category] },
        status: "approved" 
      },
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
export const getMovieCategories = async (req, res) => {
  try {
    const categories = [
      "Action", "Comedy", "Drama", "Horror", "Thriller", 
      "Romance", "Documentary", "Animation", "Sci-Fi", "Fantasy",
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
        message: "Movie not found" 
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
        message: "Movie not found" 
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
      folder: "movies/posters",
      resource_type: "image",
      mimeType: req.file.mimetype,
    });

    // Update movie
    await movie.update({
      poster: uploadResult.secure_url,
      poster_path: uploadResult.secure_url,
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
        message: "Movie not found" 
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
      folder: "movies/backdrops",
      resource_type: "image",
      mimeType: req.file.mimetype,
    });

    // Update movie
    await movie.update({
      backdrop: uploadResult.secure_url,
      backdrop_path: uploadResult.secure_url,
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

    let movie = await Movie.findByPk(movieId);
    if (!movie) {
      movie = await Movie.findOne({ where: { slug: movieId } });
    }

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Movie not found" 
      });
    }

    if (!movie.hlsUrl && !movie.streamingUrl) {
      return res.status(400).json({ 
        success: false,
        message: "Movie video not uploaded yet" 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        movieId: movie.id,
        title: movie.title,
        duration: movie.videoDuration,
        hlsUrl: movie.hlsUrl,
        streamingUrl: movie.streamingUrl,
        streamingUrls: {
          default: movie.videoUrl,
        },
        subtitles: movie.subtitles || [],
        thumbnail: movie.thumbnail,
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

// 📌 Get Recent Movies
export const getRecentMovies = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const movies = await Movie.findAll({
      where: { status: "approved" },
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

    const totalMovies = await Movie.count({ where: { filmmakerId } });
    const totalViews = await Movie.sum('totalViews', { where: { filmmakerId } });
    const totalRevenue = await Movie.sum('totalRevenue', { where: { filmmakerId } });

    res.status(200).json({
      success: true,
      data: {
        totalMovies,
        totalViews: totalViews || 0,
        totalRevenue: totalRevenue || 0,
        byStatus: stats
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