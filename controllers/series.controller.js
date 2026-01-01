import Movie from "../models/Movie.model.js";
import UserAccess from "../models/userAccess.model.js";
import slugify from "slugify";
import { uploadToB2, deleteFromB2, clearUrl } from "../utils/backblazeB2.js"; 
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

// 📌 Create Series (Parent) - FIXED to handle FormData
export const createSeries = async (req, res) => {
  try {
    console.log('📦 Incoming request to create series');
    console.log('📦 req.body:', req.body);
    console.log('📦 req.files:', req.files);
    
    // Parse data from FormData
    let title = req.body.title;
    let overview = req.body.overview;
    let original_title = req.body.original_title || req.body.title;
    let release_date = req.body.release_date || new Date().toISOString().split("T")[0];
    let language = req.body.language || "en";
    let original_language = req.body.original_language || "en";
    let totalSeasons = parseInt(req.body.totalSeasons) || 1;
    let viewPrice = parseFloat(req.body.viewPrice) || 0;
    let downloadPrice = parseFloat(req.body.downloadPrice) || 0;
    let currency = req.body.currency || "RWF";
    let royaltyPercentage = parseInt(req.body.royaltyPercentage) || 95;
    
    // Parse categories (sent as JSON string)
    let categories = [];
    if (req.body.categories) {
      try {
        categories = JSON.parse(req.body.categories);
      } catch (e) {
        // If not JSON, try comma-separated
        categories = req.body.categories.split(',').map(c => c.trim()).filter(c => c);
      }
    }
    
    // Parse tags (sent as JSON string)
    let tags = [];
    let keywords = [];
    if (req.body.tags) {
      try {
        tags = JSON.parse(req.body.tags);
        keywords = [...tags];
      } catch (e) {
        tags = req.body.tags.split(',').map(t => t.trim()).filter(t => t);
        keywords = [...tags];
      }
    }
    
    // Validate required fields
    if (!title || !overview) {
      return res.status(400).json({
        success: false,
        message: "Title and overview are required",
        received: { title, overview }
      });
    }

    // Generate slug
    let slug = slugify(title, { lower: true, strict: true });
    const existing = await Movie.findOne({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    // Parse release schedule (default values)
    let releaseSchedule = {
      pattern: "weekly",
      dayOfWeek: 0,
      time: "20:00",
      interval: 7
    };

    // Parse pricing tiers (default based on view price)
    let pricingTiers = {};
    const basePrice = parseFloat(viewPrice) || 0;
    pricingTiers = {
      "24h": basePrice * 0.2,
      "7d": basePrice * 0.5,
      "30d": basePrice * 1.5,
      "90d": basePrice * 3,
      "180d": basePrice * 5,
      "365d": basePrice * 8
    };

    // Handle file uploads if provided
    let posterUploadResult = null;
    let backdropUploadResult = null;

    if (req.files) {
      console.log('📁 Processing files:', Object.keys(req.files));
      
      if (req.files.posterFile && req.files.posterFile[0]) {
        console.log('📷 Uploading poster...');
        const posterFile = req.files.posterFile[0];
        posterUploadResult = await uploadToB2(
          posterFile.buffer,
          posterFile.originalname,
          {
            folder: "series/posters",
            resource_type: "image",
            mimeType: posterFile.mimetype,
          }
        );
        console.log('✅ Poster uploaded:', posterUploadResult.secure_url);
      }

      if (req.files.backdropFile && req.files.backdropFile[0]) {
        console.log('🌅 Uploading backdrop...');
        const backdropFile = req.files.backdropFile[0];
        backdropUploadResult = await uploadToB2(
          backdropFile.buffer,
          backdropFile.originalname,
          {
            folder: "series/backdrops",
            resource_type: "image",
            mimeType: backdropFile.mimetype,
          }
        );
        console.log('✅ Backdrop uploaded:', backdropUploadResult.secure_url);
      }
    }

    // Create series
    const series = await Movie.create({
      title: title.trim(),
      original_title: original_title.trim(),
      overview: overview.trim(),
      release_date: release_date,
      slug,
      contentType: "series",
      filmmakerId: req.user.id,
      categories: categories,
      tags: tags,
      keywords: keywords,
      language: language,
      original_language: original_language,
      totalSeasons: totalSeasons,
      releaseSchedule: releaseSchedule,
      status: "submitted",
      submittedAt: new Date(),
      totalEpisodes: 0,
      
      // Pricing
      viewPrice: viewPrice,
      downloadPrice: downloadPrice,
      price: viewPrice,
      currency: currency,
      royaltyPercentage: royaltyPercentage,
      accessPeriod: "30d",
      pricingTiers: pricingTiers,
      
      // Images
      ...(posterUploadResult && {
        poster: posterUploadResult.secure_url,
        poster_path: posterUploadResult.secure_url,
        posterPublicId: posterUploadResult.public_id,
      }),
      
      ...(backdropUploadResult && {
        backdrop: backdropUploadResult.secure_url,
        backdrop_path: backdropUploadResult.secure_url,
        backdropPublicId: backdropUploadResult.public_id,
      }),
      
      // Initialize counters
      totalViews: 0,
      totalDownloads: 0,
      totalRevenue: 0,
      avgRating: 0,
      reviewCount: 0,
    });

    console.log('🎉 Series created successfully:', series.id);

    res.status(201).json({
      success: true,
      message: "Series created successfully",
      data: {
        series: {
          id: series.id,
          title: series.title,
          slug: series.slug,
          contentType: series.contentType,
          totalSeasons: series.totalSeasons,
          totalEpisodes: series.totalEpisodes,
          viewPrice: series.viewPrice,
          accessPeriod: series.accessPeriod,
          pricingTiers: series.pricingTiers,
          releaseSchedule: series.releaseSchedule,
          poster: clearUrl(series.poster),
          backdrop: clearUrl(series.backdrop),
          status: series.status,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error creating series:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create series",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Add Episode to Series (works with FormData)
export const addEpisode = async (req, res) => {
  try {
    const { seriesId } = req.params;
    console.log('📦 Adding episode to series:', seriesId);
    console.log('📦 req.body:', req.body);
    console.log('📦 req.files:', req.files);

    // Find parent series
    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Check authorization
    if (series.filmmakerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to add episodes to this series",
      });
    }

    // Parse data from FormData
    const title = req.body.title;
    const episodeTitle = req.body.episodeTitle || req.body.title;
    const overview = req.body.overview;
    const seasonNumber = parseInt(req.body.seasonNumber) || 1;
    const episodeNumber = parseInt(req.body.episodeNumber);
    const videoQuality = req.body.videoQuality || "720p";
    const videoDuration = parseInt(req.body.videoDuration) || 0;
    const allowDownload = req.body.allowDownload === "true" || req.body.allowDownload === true;
    const downloadExpiry = parseInt(req.body.downloadExpiry) || 30;
    const viewPrice = parseFloat(req.body.viewPrice) || 0;
    const downloadPrice = parseFloat(req.body.downloadPrice) || 0;
    const accessPeriod = req.body.accessPeriod || "one-time";

    // Validate required fields
    if (!title || !overview || !episodeNumber) {
      return res.status(400).json({
        success: false,
        message: "Title, overview, and episode number are required",
      });
    }

    // Check if episode already exists
    const existingEpisode = await Movie.findOne({
      where: {
        seriesId,
        seasonNumber: seasonNumber,
        episodeNumber: episodeNumber,
        contentType: "episode"
      }
    });

    if (existingEpisode) {
      return res.status(400).json({
        success: false,
        message: `Episode S${seasonNumber}E${episodeNumber} already exists`,
      });
    }

    // Validate required files
    if (!req.files || !req.files.videoFile || !req.files.posterFile) {
      return res.status(400).json({
        success: false,
        message: "Video file and poster image are required for episodes",
      });
    }

    const videoFile = req.files.videoFile[0];
    const posterFile = req.files.posterFile[0];
    const backdropFile = req.files.backdropFile ? req.files.backdropFile[0] : null;

    // Generate slug for episode
    const episodeSlug = slugify(
      `${series.title}-s${seasonNumber}e${episodeNumber}-${episodeTitle}`,
      { lower: true, strict: true }
    );

    // Upload video
    console.log('🎥 Uploading video...');
    const videoUploadResult = await uploadToB2(
      videoFile.buffer,
      videoFile.originalname,
      {
        folder: "series/videos",
        resource_type: "video",
        mimeType: videoFile.mimetype,
      }
    );

    // Upload poster
    console.log('📷 Uploading poster...');
    const posterUploadResult = await uploadToB2(
      posterFile.buffer,
      posterFile.originalname,
      {
        folder: "series/posters",
        resource_type: "image",
        mimeType: posterFile.mimetype,
      }
    );

    // Upload backdrop if provided
    let backdropUploadResult = null;
    if (backdropFile) {
      console.log('🌅 Uploading backdrop...');
      backdropUploadResult = await uploadToB2(
        backdropFile.buffer,
        backdropFile.originalname,
        {
          folder: "series/backdrops",
          resource_type: "image",
          mimeType: backdropFile.mimetype,
        }
      );
    }

    // Create pricing tiers from series or default
    let pricingTiers = {};
    if (series.pricingTiers && Object.keys(series.pricingTiers).length > 0) {
      pricingTiers = series.pricingTiers;
    } else {
      const basePrice = parseFloat(viewPrice) || 0;
      pricingTiers = {
        "24h": basePrice * 0.2,
        "7d": basePrice * 0.5,
        "30d": basePrice * 1.5,
        "90d": basePrice * 3,
        "180d": basePrice * 5,
        "365d": basePrice * 8
      };
    }

    // Create episode
    const episode = await Movie.create({
      title: title.trim(),
      episodeTitle: episodeTitle.trim(),
      overview: overview.trim(),
      contentType: "episode",
      seriesId: series.id,
      seriesTitle: series.title,
      seriesOverview: series.overview,
      seasonNumber: seasonNumber,
      episodeNumber: episodeNumber,
      slug: episodeSlug,
      filmmakerId: req.user.id,
      
      // Video info
      videoUrl: videoUploadResult.secure_url,
      streamingUrl: videoUploadResult.secure_url,
      videoQuality,
      videoDuration: videoDuration,
      fileSize: Math.round(videoFile.size / (1024 * 1024)),
      
      // Images
      poster: posterUploadResult.secure_url,
      poster_path: posterUploadResult.secure_url,
      posterPublicId: posterUploadResult.public_id,
      ...(backdropUploadResult && {
        backdrop: backdropUploadResult.secure_url,
        backdrop_path: backdropUploadResult.secure_url,
        backdropPublicId: backdropUploadResult.public_id,
      }),
      
      // Pricing
      viewPrice: viewPrice,
      downloadPrice: downloadPrice,
      price: viewPrice,
      currency: series.currency || "RWF",
      royaltyPercentage: series.royaltyPercentage || 95,
      accessPeriod,
      pricingTiers: pricingTiers,
      
      // Use series categories and tags
      categories: series.categories,
      tags: series.tags,
      keywords: series.keywords,
      language: series.language,
      original_language: series.original_language,
      
      // Settings
      allowDownload: allowDownload,
      downloadExpiry: downloadExpiry,
      
      // Status
      status: series.status === "approved" ? "approved" : "submitted",
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

    // Update series total episodes count
    const episodeCount = await Movie.count({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: { [Op.in]: ['approved', 'submitted'] }
      }
    });
    
    await series.update({
      totalEpisodes: episodeCount,
    });

    console.log('✅ Episode created successfully:', episode.id);

    res.status(201).json({
      success: true,
      message: "Episode added successfully",
      data: {
        episode: {
          id: episode.id,
          title: episode.title,
          episodeTitle: episode.episodeTitle,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          seriesId: episode.seriesId,
          seriesTitle: episode.seriesTitle,
          viewPrice: episode.viewPrice,
          accessPeriod: episode.accessPeriod,
          pricingTiers: episode.pricingTiers,
          poster: clearUrl(episode.poster),
          videoUrl: clearUrl(episode.videoUrl),
          videoDuration: episode.videoDuration,
          status: episode.status,
        },
        series: {
          totalEpisodes: series.totalEpisodes,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error adding episode:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add episode",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get Series Episodes
export const getSeriesEpisodes = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { season, page = 1, limit = 20, status = "approved" } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = {
      seriesId,
      contentType: "episode",
    };

    if (status) {
      where.status = status;
    }

    if (season) {
      where.seasonNumber = parseInt(season);
    }

    const { count, rows: episodes } = await Movie.findAndCountAll({
      where,
      order: [
        ["seasonNumber", "ASC"],
        ["episodeNumber", "ASC"],
      ],
      offset,
      limit: limitNum,
    });

    // Group episodes by season
    const seasons = {};
    episodes.forEach(episode => {
      const seasonNum = episode.seasonNumber;
      if (!seasons[seasonNum]) {
        seasons[seasonNum] = [];
      }
      seasons[seasonNum].push(episode);
    });

    // Get series info
    const series = await Movie.findByPk(seriesId);

    // Get season stats
    const seasonStats = await Movie.findAll({
      where: {
        seriesId,
        contentType: "episode",
        status: "approved"
      },
      attributes: [
        'seasonNumber',
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'episodeCount'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalViews')), 'totalViews'],
        [Movie.sequelize.fn('AVG', Movie.sequelize.col('avgRating')), 'avgRating']
      ],
      group: ['seasonNumber'],
      order: [['seasonNumber', 'ASC']]
    });

    res.status(200).json({
      success: true,
      data: {
        series: {
          id: series.id,
          title: series.title,
          overview: series.overview,
          poster: clearUrl(series.poster),
          backdrop: clearUrl(series.backdrop),
          totalSeasons: Object.keys(seasons).length,
          totalEpisodes: count,
          viewPrice: series.viewPrice,
          pricingTiers: series.pricingTiers,
        },
        seasons,
        seasonStats,
        episodes,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching series episodes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch episodes",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get Series by Filmmaker
export const getFilmmakerSeries = async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const { page = 1, limit = 10, includeEpisodes = false } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const where = { 
      filmmakerId,
      contentType: "series",
      status: "approved"
    };

    const { count, rows: series } = await Movie.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum
    });

    // Include episodes if requested
    if (includeEpisodes === "true") {
      const seriesWithEpisodes = await Promise.all(
        series.map(async (s) => {
          const episodes = await Movie.findAll({
            where: {
              seriesId: s.id,
              contentType: "episode",
              status: "approved"
            },
            order: [
              ['seasonNumber', 'ASC'],
              ['episodeNumber', 'ASC']
            ],
            limit: 5
          });
          
          return {
            ...s.toJSON(),
            episodes
          };
        })
      );

      res.status(200).json({
        success: true,
        data: seriesWithEpisodes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      });
    } else {
      res.status(200).json({
        success: true,
        data: series,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      });
    }
  } catch (error) {
    console.error("❌ Error fetching filmmaker series:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// 📌 Get Series Statistics
export const getSeriesStats = async (req, res) => {
  try {
    const { seriesId } = req.params;

    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Get episode statistics
    const episodeStats = await Movie.findAll({
      where: {
        seriesId,
        contentType: "episode",
        status: "approved"
      },
      attributes: [
        'seasonNumber',
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'episodeCount'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalViews')), 'totalViews'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalDownloads')), 'totalDownloads'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalRevenue')), 'totalRevenue'],
        [Movie.sequelize.fn('AVG', Movie.sequelize.col('avgRating')), 'avgRating']
      ],
      group: ['seasonNumber'],
      order: [['seasonNumber', 'ASC']]
    });

    // Get total series access purchases
    const seriesAccessCount = await UserAccess.count({
      where: {
        seriesId,
        accessType: "series",
        status: "active"
      }
    });

    // Calculate total series revenue from access purchases
    const seriesAccessRevenue = await UserAccess.sum('pricePaid', {
      where: {
        seriesId,
        accessType: "series",
        status: "active"
      }
    });

    // Calculate filmmaker revenue
    const filmmakerRevenue = ((seriesAccessRevenue || 0) * (series.royaltyPercentage || 95)) / 100;

    res.status(200).json({
      success: true,
      data: {
        series: {
          id: series.id,
          title: series.title,
          totalSeasons: series.totalSeasons,
          totalEpisodes: series.totalEpisodes,
          totalViews: series.totalViews || 0,
          totalRevenue: series.totalRevenue || 0,
          avgRating: series.avgRating || 0,
        },
        statistics: {
          episodeStats,
          seriesAccess: {
            totalPurchases: seriesAccessCount,
            totalRevenue: seriesAccessRevenue || 0,
            filmmakerRevenue,
          },
          totalEpisodes: episodeStats.reduce((sum, stat) => sum + parseInt(stat.get('episodeCount')), 0),
          totalEpisodeViews: episodeStats.reduce((sum, stat) => sum + parseInt(stat.get('totalViews') || 0), 0),
          totalEpisodeDownloads: episodeStats.reduce((sum, stat) => sum + parseInt(stat.get('totalDownloads') || 0), 0),
          totalEpisodeRevenue: episodeStats.reduce((sum, stat) => sum + parseFloat(stat.get('totalRevenue') || 0), 0),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching series statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch series statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Purchase Series Access
export const purchaseSeriesAccess = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { 
      accessPeriod = "30d", 
      paymentMethod, 
      paymentId,
      autoRenew = false
    } = req.body;
    
    const userId = req.user.id;

    // Find series
    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Check if user already has active access
    const existingAccess = await UserAccess.findOne({
      where: {
        userId,
        seriesId,
        status: "active",
        expiresAt: { [Op.gt]: new Date() }
      },
    });

    if (existingAccess) {
      return res.status(400).json({
        success: false,
        message: "You already have active access to this series",
        data: {
          accessId: existingAccess.id,
          expiresAt: existingAccess.expiresAt,
          accessPeriod: existingAccess.accessPeriod,
        },
      });
    }

    // Get all approved episodes of the series
    const episodes = await Movie.findAll({
      where: {
        seriesId,
        contentType: "episode",
        status: "approved",
      },
    });

    if (episodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No episodes available for this series yet",
      });
    }

    // Calculate price based on access period
    const pricingTiers = series.pricingTiers || {};
    let price = 0;
    
    if (pricingTiers[accessPeriod] !== undefined) {
      price = pricingTiers[accessPeriod];
    } else {
      // Calculate total of individual episode prices
      price = episodes.reduce((sum, ep) => sum + (ep.viewPrice || 0), 0);
      
      // Apply series discount based on period
      const discounts = {
        "30d": 0.3,  // 30% discount for 30 days
        "90d": 0.4,  // 40% discount for 90 days
        "180d": 0.5, // 50% discount for 180 days
        "365d": 0.6, // 60% discount for 1 year
      };
      
      if (discounts[accessPeriod]) {
        price = price * (1 - discounts[accessPeriod]);
      }
    }

    // Calculate expiry date
    const expiryDate = calculateExpiryDate(accessPeriod);

    // Create master series access record
    const seriesAccess = await UserAccess.create({
      userId,
      movieId: series.id,
      seriesId: series.id,
      accessType: "series",
      accessPeriod,
      pricePaid: price,
      currency: series.currency || "RWF",
      expiresAt: expiryDate,
      paymentMethod,
      paymentId,
      autoRenew: autoRenew === true || autoRenew === "true",
      status: "active",
    });

    // Create access records for each episode (optional - can be done on-demand)
    // This improves performance when checking episode access
    const accessPromises = episodes.map(episode => 
      UserAccess.create({
        userId,
        movieId: episode.id,
        seriesId: series.id,
        accessType: "series",
        accessPeriod,
        pricePaid: 0, // Episode access is included in series price
        currency: series.currency || "RWF",
        expiresAt: expiryDate,
        paymentId,
        status: "active",
      })
    );

    await Promise.all(accessPromises);

    // Update series revenue
    const revenueIncrease = (price * (series.royaltyPercentage || 95)) / 100;
    await series.update({
      totalRevenue: (series.totalRevenue || 0) + revenueIncrease,
      totalViews: (series.totalViews || 0) + 1,
    });

    // Update filmmaker's total revenue across all movies
    // This would typically be done in a separate service

    res.status(200).json({
      success: true,
      message: `Series access granted for ${getAccessPeriodLabel(accessPeriod)}`,
      data: {
        access: {
          id: seriesAccess.id,
          seriesId: series.id,
          seriesTitle: series.title,
          accessPeriod,
          accessPeriodLabel: getAccessPeriodLabel(accessPeriod),
          pricePaid: price,
          currency: seriesAccess.currency,
          expiresAt: seriesAccess.expiresAt,
          autoRenew: seriesAccess.autoRenew,
          totalEpisodes: episodes.length,
          episodes: episodes.map(ep => ({
            id: ep.id,
            title: ep.title,
            episodeTitle: ep.episodeTitle,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
          })),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error purchasing series access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to purchase series access",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Check Episode Access (Enhanced version)
export const checkEpisodeAccess = async (req, res) => {
  try {
    const { episodeId } = req.params;
    const userId = req.user.id;

    const episode = await Movie.findByPk(episodeId);
    if (!episode) {
      return res.status(404).json({
        success: false,
        message: "Episode not found",
      });
    }

    // Check if episode is free
    if (episode.viewPrice === 0) {
      return res.status(200).json({
        success: true,
        data: {
          hasAccess: true,
          accessType: "free",
          expiresAt: null,
          episode: {
            id: episode.id,
            title: episode.title,
            episodeTitle: episode.episodeTitle,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            seriesId: episode.seriesId,
            seriesTitle: episode.seriesTitle,
          },
        },
      });
    }

    // Check if user is the filmmaker
    if (episode.filmmakerId === userId) {
      return res.status(200).json({
        success: true,
        data: {
          hasAccess: true,
          accessType: "owner",
          expiresAt: null,
          episode: {
            id: episode.id,
            title: episode.title,
            episodeTitle: episode.episodeTitle,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            seriesId: episode.seriesId,
            seriesTitle: episode.seriesTitle,
          },
        },
      });
    }

    // Check if user has purchased this specific episode
    const episodeAccess = await UserAccess.findOne({
      where: {
        userId,
        movieId: episodeId,
        status: "active",
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
    });

    // Check if user has series access
    const seriesAccess = episode.seriesId ? await UserAccess.findOne({
      where: {
        userId,
        seriesId: episode.seriesId,
        status: "active",
        expiresAt: { [Op.gt]: new Date() }
      },
    }) : null;

    const hasAccess = !!(episodeAccess || seriesAccess);
    const accessType = episodeAccess ? 'episode' : (seriesAccess ? 'series' : null);
    const expiresAt = episodeAccess?.expiresAt || seriesAccess?.expiresAt;

    // Calculate days remaining
    let daysRemaining = null;
    if (expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      daysRemaining = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
    }

    // Get series pricing info if no access
    let pricingInfo = null;
    if (!hasAccess && episode.seriesId) {
      const series = await Movie.findByPk(episode.seriesId);
      if (series) {
        pricingInfo = {
          seriesId: series.id,
          seriesTitle: series.title,
          pricingTiers: series.pricingTiers,
          individualEpisodePrice: episode.viewPrice,
          accessPeriods: Object.keys(series.pricingTiers || {}).map(period => ({
            period,
            label: getAccessPeriodLabel(period),
            price: series.pricingTiers[period]
          }))
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        hasAccess,
        accessType,
        expiresAt,
        daysRemaining,
        requiresPurchase: !hasAccess && episode.viewPrice > 0,
        episode: {
          id: episode.id,
          title: episode.title,
          episodeTitle: episode.episodeTitle,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          seriesId: episode.seriesId,
          seriesTitle: episode.seriesTitle,
          viewPrice: episode.viewPrice,
          accessPeriod: episode.accessPeriod,
          pricingTiers: episode.pricingTiers,
        },
        pricingInfo,
      },
    });
  } catch (error) {
    console.error("❌ Error checking episode access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check access",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get User's Series Access
export const getUserSeriesAccess = async (req, res) => {
  try {
    const userId = req.user.id;
    const { activeOnly = true } = req.query;

    const where = {
      userId,
      accessType: "series",
    };
    
    if (activeOnly === "true") {
      where.status = "active";
      where.expiresAt = { [Op.gt]: new Date() };
    }

    const seriesAccess = await UserAccess.findAll({
      where,
      order: [['expiresAt', 'DESC']],
      include: [{
        model: Movie,
        as: 'series',
        attributes: ['id', 'title', 'overview', 'poster', 'backdrop', 
                    'totalEpisodes', 'totalSeasons', 'createdAt']
      }]
    });

    // Get episodes for each series
    const accessWithEpisodes = await Promise.all(
      seriesAccess.map(async (access) => {
        const episodes = await Movie.findAll({
          where: {
            seriesId: access.seriesId,
            contentType: "episode",
            status: "approved"
          },
          order: [
            ['seasonNumber', 'ASC'],
            ['episodeNumber', 'ASC']
          ],
          limit: 10,
          attributes: ['id', 'title', 'episodeTitle', 'seasonNumber', 
                      'episodeNumber', 'poster', 'videoDuration']
        });

        // Calculate days remaining
        const now = new Date();
        const expiry = new Date(access.expiresAt);
        const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

        return {
          id: access.id,
          seriesId: access.seriesId,
          seriesTitle: access.series?.title,
          seriesPoster: clearUrl(access.series?.poster),
          accessPeriod: access.accessPeriod,
          accessPeriodLabel: getAccessPeriodLabel(access.accessPeriod),
          pricePaid: access.pricePaid,
          currency: access.currency,
          purchasedAt: access.createdAt,
          expiresAt: access.expiresAt,
          daysRemaining: Math.max(0, daysRemaining),
          autoRenew: access.autoRenew,
          status: access.status,
          totalEpisodes: access.series?.totalEpisodes || 0,
          recentEpisodes: episodes,
        };
      })
    );

    // Separate active and expired access
    const activeAccess = accessWithEpisodes.filter(a => a.daysRemaining > 0);
    const expiredAccess = accessWithEpisodes.filter(a => a.daysRemaining <= 0);

    res.status(200).json({
      success: true,
      data: {
        active: activeAccess,
        expired: expiredAccess,
        summary: {
          total: seriesAccess.length,
          active: activeAccess.length,
          expired: expiredAccess.length,
          totalSpent: seriesAccess.reduce((sum, acc) => sum + parseFloat(acc.pricePaid || 0), 0),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching user series access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch series access",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Get Series Pricing Information
export const getSeriesPricing = async (req, res) => {
  try {
    const { seriesId } = req.params;

    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Get all episodes of the series
    const episodes = await Movie.findAll({
      where: {
        seriesId,
        contentType: "episode",
        status: "approved",
      },
      attributes: ['id', 'title', 'viewPrice', 'episodeNumber', 'seasonNumber', 'episodeTitle']
    });

    // Calculate total individual price
    const totalIndividualPrice = episodes.reduce((sum, ep) => sum + (ep.viewPrice || 0), 0);
    
    // Get series pricing tiers or create defaults
    const pricingTiers = series.pricingTiers || {
      "24h": totalIndividualPrice * 0.2,
      "7d": totalIndividualPrice * 0.5,
      "30d": totalIndividualPrice * 1.5,
      "90d": totalIndividualPrice * 3,
      "180d": totalIndividualPrice * 5,
      "365d": totalIndividualPrice * 8
    };

    // Calculate savings for each period
    const savings = {};
    Object.keys(pricingTiers).forEach(period => {
      savings[period] = totalIndividualPrice - pricingTiers[period];
    });

    // Get best value (most savings)
    let bestValue = null;
    if (Object.keys(savings).length > 0) {
      bestValue = Object.keys(savings).reduce((a, b) => 
        savings[a] > savings[b] ? a : b
      );
    }

    res.status(200).json({
      success: true,
      data: {
        series: {
          id: series.id,
          title: series.title,
          overview: series.overview,
          poster: clearUrl(series.poster),
          totalEpisodes: episodes.length,
          totalSeasons: series.totalSeasons,
          currency: series.currency || "RWF",
          royaltyPercentage: series.royaltyPercentage,
        },
        episodes: episodes.map(ep => ({
          id: ep.id,
          title: ep.title,
          episodeTitle: ep.episodeTitle,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber,
          individualPrice: ep.viewPrice,
          currency: series.currency || "RWF",
        })),
        pricing: {
          totalIndividualPrice,
          seriesPricing: Object.keys(pricingTiers).map(period => ({
            period,
            periodLabel: getAccessPeriodLabel(period),
            price: pricingTiers[period],
            savings: savings[period],
            savingsPercentage: totalIndividualPrice > 0 ? 
              Math.round((savings[period] / totalIndividualPrice) * 100) : 0,
            isBestValue: period === bestValue,
          })),
          bestValue: bestValue ? {
            period: bestValue,
            periodLabel: getAccessPeriodLabel(bestValue),
            price: pricingTiers[bestValue],
            savings: savings[bestValue],
          } : null,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching series pricing:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


// 📌 Update Series Information
export const updateSeries = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const {
      title,
      overview,
      totalSeasons,
      releaseSchedule,
      viewPrice,
      pricingTiers,
      status,
    } = req.body;

    const series = await Movie.findByPk(seriesId);

    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin" && series.filmmakerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this series",
      });
    }

    // Update fields
    const updateData = {};
    if (title) updateData.title = title;
    if (overview) updateData.overview = overview;
    if (totalSeasons !== undefined) updateData.totalSeasons = parseInt(totalSeasons);
    if (viewPrice !== undefined) updateData.viewPrice = parseFloat(viewPrice);
    if (status) updateData.status = status;
    
    // Parse JSON fields
    if (releaseSchedule) {
      try {
        updateData.releaseSchedule = typeof releaseSchedule === "string"
          ? JSON.parse(releaseSchedule)
          : releaseSchedule;
      } catch (error) {
        console.error("Error parsing release schedule:", error);
      }
    }
    
    if (pricingTiers) {
      try {
        updateData.pricingTiers = typeof pricingTiers === "string" 
          ? JSON.parse(pricingTiers)
          : pricingTiers;
      } catch (error) {
        console.error("Error parsing pricing tiers:", error);
      }
    }

    updateData.lastUpdated = new Date();

    await series.update(updateData);

    // Update price for backward compatibility
    if (viewPrice !== undefined) {
      updateData.price = parseFloat(viewPrice);
    }

    res.status(200).json({
      success: true,
      message: "Series updated successfully",
      data: { series },
    });
  } catch (error) {
    console.error("❌ Error updating series:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update series",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Bulk Add Episodes
export const bulkAddEpisodes = async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { episodes } = req.body; // Array of episode objects

    if (!Array.isArray(episodes) || episodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Episodes array is required",
      });
    }

    // Find parent series
    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== "series") {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Check authorization
    if (series.filmmakerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to add episodes to this series",
      });
    }

    const results = {
      success: [],
      failed: []
    };

    // Process each episode
    for (const episodeData of episodes) {
      try {
        const {
          title,
          episodeTitle,
          overview,
          seasonNumber = 1,
          episodeNumber,
          viewPrice = 0,
          accessPeriod = "one-time",
        } = episodeData;

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
          results.failed.push({
            seasonNumber,
            episodeNumber,
            reason: "Episode already exists"
          });
          continue;
        }

        // Generate slug
        const episodeSlug = slugify(
          `${series.title}-s${seasonNumber}e${episodeNumber}-${episodeTitle || title}`,
          { lower: true, strict: true }
        );

        // Create episode (without files - files can be uploaded separately)
        const episode = await Movie.create({
          title: title.trim(),
          episodeTitle: episodeTitle?.trim() || title.trim(),
          overview: overview.trim(),
          contentType: "episode",
          seriesId: series.id,
          seriesTitle: series.title,
          seriesOverview: series.overview,
          seasonNumber: parseInt(seasonNumber),
          episodeNumber: parseInt(episodeNumber),
          slug: episodeSlug,
          filmmakerId: req.user.id,
          
          // Pricing
          viewPrice: parseFloat(viewPrice),
          downloadPrice: parseFloat(viewPrice),
          price: parseFloat(viewPrice),
          currency: series.currency || "RWF",
          royaltyPercentage: series.royaltyPercentage || 95,
          accessPeriod,
          
          // Use series categories and tags
          categories: series.categories,
          tags: series.tags,
          keywords: series.keywords,
          language: series.language,
          
          // Status
          status: "draft", // Set as draft until files are uploaded
          submittedAt: new Date(),
          
          // Initialize counters
          totalViews: 0,
          totalDownloads: 0,
          totalRevenue: 0,
          avgRating: 0,
          reviewCount: 0,
        });

        results.success.push({
          id: episode.id,
          title: episode.title,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          status: episode.status,
        });
      } catch (error) {
        results.failed.push({
          episodeData,
          reason: error.message
        });
      }
    }

    // Update series episode count
    const episodeCount = await Movie.count({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: { [Op.in]: ['approved', 'submitted', 'draft'] }
      }
    });
    
    await series.update({
      totalEpisodes: episodeCount,
    });

    res.status(200).json({
      success: true,
      message: `Bulk episode creation completed. Success: ${results.success.length}, Failed: ${results.failed.length}`,
      data: {
        results,
        series: {
          id: series.id,
          title: series.title,
          totalEpisodes: series.totalEpisodes,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in bulk add episodes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to bulk add episodes",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// 📌 Renew Series Access
export const renewSeriesAccess = async (req, res) => {
  try {
    const { accessId } = req.params;
    const { 
      accessPeriod = "30d",
      paymentMethod,
      paymentId
    } = req.body;
    
    const userId = req.user.id;

    // Find existing access
    const existingAccess = await UserAccess.findOne({
      where: {
        id: accessId,
        userId,
        accessType: "series",
        status: "active"
      },
      include: [{
        model: Movie,
        as: 'series',
        attributes: ['id', 'title', 'pricingTiers', 'currency']
      }]
    });

    if (!existingAccess) {
      return res.status(404).json({
        success: false,
        message: "Access not found or not authorized",
      });
    }

    const series = existingAccess.series;
    if (!series) {
      return res.status(404).json({
        success: false,
        message: "Series not found",
      });
    }

    // Calculate new expiry date
    let newExpiryDate = calculateExpiryDate(accessPeriod);
    
    // If access hasn't expired yet, add to current expiry
    if (existingAccess.expiresAt && existingAccess.expiresAt > new Date()) {
      const currentExpiry = new Date(existingAccess.expiresAt);
      const additionalDays = {
        "24h": 1,
        "7d": 7,
        "30d": 30,
        "90d": 90,
        "180d": 180,
        "365d": 365
      }[accessPeriod] || 30;
      
      newExpiryDate = new Date(currentExpiry.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    }

    // Calculate price
    const pricingTiers = series.pricingTiers || {};
    const price = pricingTiers[accessPeriod] || 0;

    // Create renewal record
    const renewalAccess = await UserAccess.create({
      userId,
      movieId: series.id,
      seriesId: series.id,
      accessType: "series",
      accessPeriod,
      pricePaid: price,
      currency: series.currency || "RWF",
      expiresAt: newExpiryDate,
      paymentMethod,
      paymentId,
      autoRenew: existingAccess.autoRenew,
      status: "active",
      previousAccessId: existingAccess.id,
    });

    // Update existing access to mark as renewed
    await existingAccess.update({
      status: "renewed",
      renewedById: renewalAccess.id
    });

    // Update all episode accesses
    await UserAccess.update({
      expiresAt: newExpiryDate,
      status: "active"
    }, {
      where: {
        userId,
        seriesId: series.id,
        accessType: "series",
        status: "active"
      }
    });

    res.status(200).json({
      success: true,
      message: "Series access renewed successfully",
      data: {
        renewal: {
          id: renewalAccess.id,
          seriesId: series.id,
          seriesTitle: series.title,
          accessPeriod,
          accessPeriodLabel: getAccessPeriodLabel(accessPeriod),
          pricePaid: price,
          currency: renewalAccess.currency,
          expiresAt: renewalAccess.expiresAt,
          previousAccessId: existingAccess.id,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error renewing series access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to renew series access",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};