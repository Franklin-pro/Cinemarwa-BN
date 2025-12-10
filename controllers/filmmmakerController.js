import User from "../models/User.modal.js";
import Movie from "../models/Movie.model.js";
import Payment from "../models/Payment.model.js";
import Joi from "joi";
import { Op } from "sequelize";

// ====== VALIDATION SCHEMAS ======

const filmmmakerProfileSchema = Joi.object({
  bio: Joi.string().max(500),
  website: Joi.string().uri().optional(),
  socialLinks: Joi.object({
    twitter: Joi.string().uri().optional(),
    instagram: Joi.string().uri().optional(),
    youtube: Joi.string().uri().optional(),
    facebook: Joi.string().uri().optional(),
  }).optional(),
  bankDetails: Joi.object({
    accountName: Joi.string().required(),
    accountNumber: Joi.string().required(),
    bankName: Joi.string().required(),
    country: Joi.string().required(),
    swiftCode: Joi.string().optional(),
  }).optional(),
  payoutMethod: Joi.string()
    .valid("bank_transfer", "paypal", "stripe", "momo")
    .default("bank_transfer"),
});

const withdrawalSchema = Joi.object({
  amount: Joi.number().positive().required(),
  payoutMethod: Joi.string().valid("bank_transfer", "paypal", "stripe", "momo"),
  notes: Joi.string().max(500),
});

// Helper function to safely parse numeric values
const safeParseFloat = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

// ====== FILMMAKER PROFILE MANAGEMENT ======

/**
 * Get filmmaker profile and dashboard summary
 * GET /filmmaker/profile
 */
export const getFilmmmakerProfile = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId, {
      attributes: ["name", "email", "role", "filmmmakerIsVerified", "filmmmakerBio", "filmmmakerProfileImage", "filmmmakerBankDetails", "filmmmakerStatsTotalMovies", "filmmmakerStatsTotalRevenue", "filmmmakerStatsTotalViews", "filmmmakerFinancePendingBalance", "filmmmakerFinanceWithdrawnBalance", "approvalStatus"]
    });

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        filmmaker,
        verification: {
          profileVerified: filmmaker.filmmmakerIsVerified,
          bankDetailsVerified: filmmaker.filmmmakerBankDetails?.isVerified || false,
          accountApproved: filmmaker.approvalStatus === "approved",
        },
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Update filmmaker profile
 * PUT /filmmaker/profile
 */
export const updateFilmmmakerProfile = async (req, res) => {
  try {
    const { error, value } = filmmmakerProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker) {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    if (value.bio) filmmaker.filmmmakerBio = value.bio;
    if (value.website) filmmaker.filmmmakerWebsite = value.website;
    if (value.socialLinks) filmmaker.filmmmakerSocialLinks = value.socialLinks;
    if (value.bankDetails) {
      filmmaker.filmmmakerBankDetails = {
        ...value.bankDetails,
        isVerified: false, // Admin must verify
        updatedAt: new Date()
      };
    }
    if (value.payoutMethod) {
      filmmaker.filmmmakerFinancePayoutMethod = value.payoutMethod;
    }
    
    await filmmaker.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        filmmaker,
        nextStep: value.bankDetails
          ? "Bank details submitted. Awaiting admin verification"
          : "Profile updated",
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== FILMMAKER ANALYTICS DASHBOARD ======

/**
 * Get filmmaker dashboard summary
 * GET /filmmaker/dashboard
 */
export const getFilmmmakerDashboard = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Get movie statistics
    const movies = await Movie.findAll({
      where: { filmmakerId: req.user.id || req.userId },
      attributes: ["id", "title", "totalViews", "totalRevenue", "avgRating", "totalReviews", "viewPrice", "status", "createdAt"]
    });

    // Initialize with 0 values to handle empty results
    const totalViews = movies.reduce((sum, m) => sum + safeParseFloat(m.totalViews), 0);
    const totalRevenue = movies.reduce((sum, m) => sum + safeParseFloat(m.totalRevenue), 0);
    const totalMovies = movies.length;

    // Calculate average rating
    const avgRating = movies.length > 0 
      ? movies.reduce((sum, m) => sum + safeParseFloat(m.avgRating), 0) / movies.length
      : 0;

    // Calculate filmmaker earnings (default: 70% filmmaker, 30% platform)
    const royaltyPercentage = movies.reduce((sum, m) => {
      const royalty = safeParseFloat(m.royaltyPercentage);
      return royalty > 0 ? royalty : 70; // Default 70%
    }, 0) / Math.max(movies.length, 1);
    
    const platformFeePercentage = 100 - royaltyPercentage;
    const platformFee = (totalRevenue * platformFeePercentage) / 100;
    const filmmmakerEarnings = totalRevenue - platformFee;

    // Get payment history
    const payments = await Payment.findAll({
      where: {
        filmmakerId: req.user.id || req.userId,
        paymentStatus: "succeeded"
      },
      attributes: ["id", "amount", "paymentMethod", "createdAt"]
    });

    const totalSales = payments.length;

    // Get recent movies
    const recentMovies = movies.slice(0, 5).map(m => ({
      id: m.id,
      title: m.title,
      views: safeParseFloat(m.totalViews),
      revenue: safeParseFloat(m.totalRevenue),
      rating: safeParseFloat(m.avgRating),
      status: m.status,
      createdAt: m.createdAt
    }));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalMovies,
          totalViews,
          totalSales,
          totalRevenue: totalRevenue.toFixed(2),
          filmmmakerEarnings: filmmmakerEarnings.toFixed(2),
          platformFee: platformFee.toFixed(2),
          royaltyPercentage: royaltyPercentage.toFixed(1),
          avgRating: avgRating.toFixed(1),
        },
        finance: {
          pendingBalance: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance),
          withdrawnBalance: safeParseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance),
          totalEarned: safeParseFloat(filmmaker.filmmmakerFinanceTotalEarned),
          minimumWithdrawalAmount: safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
          canWithdraw: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance) >= 
                     (safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100),
          payoutMethod: filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
        },
        approval: {
          status: filmmaker.approvalStatus || "pending",
          isVerified: filmmaker.filmmmakerIsVerified || false,
          bankVerified: filmmaker.filmmmakerBankDetails?.isVerified || false,
        },
        recentMovies,
        performance: {
          bestPerforming: movies.length > 0 ? movies.reduce((best, current) => 
            safeParseFloat(current.totalRevenue) > safeParseFloat(best.totalRevenue) ? current : best
          ) : null,
          recentlyAdded: movies.length > 0 ? movies.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
          )[0] : null
        }
      }
    });
  } catch (error) {
    console.error("Error in getFilmmmakerDashboard:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get detailed analytics for a specific movie
 * GET /filmmaker/analytics/:movieId
 */
export const getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;

    const movie = await Movie.findByPk(movieId, {
      attributes: ["id", "title", "description", "status", "totalViews", "totalRevenue", "avgRating", "totalReviews", "createdAt", "viewPrice", "downloadPrice", "currency", "royaltyPercentage", "filmmakerId"]
    });

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Movie not found" 
      });
    }

    // Check ownership
    if (movie.filmmakerId !== (req.user.id || req.userId)) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized to view analytics for this movie" 
      });
    }

    // Get payment data for this movie
    const payments = await Payment.findAll({
      where: {
        movieId: movieId,
        paymentStatus: "succeeded"
      },
      attributes: ["id", "amount", "paymentMethod", "userId", "createdAt"]
    });

    const totalRevenue = payments.reduce((sum, p) => sum + safeParseFloat(p.amount), 0);
    const royaltyPercentage = safeParseFloat(movie.royaltyPercentage) || 70;
    const platformFeePercentage = 100 - royaltyPercentage;
    const platformFee = (totalRevenue * platformFeePercentage) / 100;
    const filmmmakerShare = totalRevenue - platformFee;

    // Group payments by method
    const paymentsByMethod = {};
    payments.forEach((p) => {
      if (p.paymentMethod) {
        paymentsByMethod[p.paymentMethod] = (paymentsByMethod[p.paymentMethod] || 0) + 1;
      }
    });

    // Get payment timeline (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentPayments = payments.filter(p => 
      new Date(p.createdAt) >= thirtyDaysAgo
    );

    res.status(200).json({
      success: true,
      data: {
        movie: {
          id: movie.id,
          title: movie.title,
          description: movie.description,
          status: movie.status,
          totalViews: safeParseFloat(movie.totalViews),
          totalRevenue: safeParseFloat(movie.totalRevenue),
          avgRating: safeParseFloat(movie.avgRating),
          reviewCount: safeParseFloat(movie.totalReviews),
          createdAt: movie.createdAt,
          price: {
            viewPrice: safeParseFloat(movie.viewPrice),
            downloadPrice: safeParseFloat(movie.downloadPrice),
            currency: movie.currency
          }
        },
        revenue: {
          totalRevenue: totalRevenue.toFixed(2),
          filmmmakerShare: filmmmakerShare.toFixed(2),
          platformFee: platformFee.toFixed(2),
          royaltyPercentage,
          platformFeePercentage,
        },
        sales: {
          totalSales: payments.length,
          byPaymentMethod: paymentsByMethod,
          averageSalePrice: payments.length > 0 ? (totalRevenue / payments.length).toFixed(2) : "0.00",
          recentSales: recentPayments.length,
          revenueTrend: recentPayments.length > 0 ? 
            (recentPayments.reduce((sum, p) => sum + safeParseFloat(p.amount), 0) / 30).toFixed(2) : "0.00"
        },
        timeline: {
          createdAt: movie.createdAt,
          lastPayment: payments.length > 0 ? 
            payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt : null,
          daysSinceCreated: Math.floor((new Date() - new Date(movie.createdAt)) / (1000 * 60 * 60 * 24))
        }
      }
    });
  } catch (error) {
    console.error("Error in getMovieAnalytics:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== FILMMAKER REVENUE & WITHDRAWAL MANAGEMENT ======

/**
 * Get filmmaker financial summary
 * GET /filmmaker/finance
 */
export const getFinancialSummary = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Calculate total from movies
    const movies = await Movie.findAll({
      where: { filmmakerId: req.user.id || req.userId },
      attributes: ["totalRevenue", "royaltyPercentage"]
    });

    const totalRevenue = movies.reduce((sum, m) => sum + safeParseFloat(m.totalRevenue), 0);
    const avgRoyalty = movies.length > 0 ? 
      movies.reduce((sum, m) => sum + (safeParseFloat(m.royaltyPercentage) || 70), 0) / movies.length : 70;
    
    const filmmmakerEarnings = (totalRevenue * avgRoyalty) / 100;

    res.status(200).json({
      success: true,
      data: {
        balance: {
          pendingBalance: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance),
          withdrawnBalance: safeParseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance),
          totalEarned: safeParseFloat(filmmaker.filmmmakerFinanceTotalEarned),
          calculatedEarnings: filmmmakerEarnings.toFixed(2),
          currentBalance: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance) + 
                         safeParseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance),
        },
        withdrawalSettings: {
          minimumAmount: safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
          payoutMethod: filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
          lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
          canWithdraw: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance) >= 
                     (safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100),
          nextPayoutDate: filmmaker.filmmmakerFinanceNextPayoutDate,
        },
        bankDetails: filmmaker.filmmmakerBankDetails || {},
        revenueSummary: {
          totalMovieRevenue: totalRevenue.toFixed(2),
          averageRoyalty: avgRoyalty.toFixed(1) + "%",
          platformFee: (100 - avgRoyalty).toFixed(1) + "%",
          estimatedMonthly: (filmmakerEarnings / 30).toFixed(2)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Request withdrawal (creates withdrawal request)
 * POST /filmmaker/withdraw
 */
export const requestWithdrawal = async (req, res) => {
  try {
    const { error, value } = withdrawalSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Check if verified
    if (!filmmaker.filmmmakerBankDetails?.isVerified || !filmmaker.filmmmakerIsVerified) {
      return res.status(400).json({
        success: false,
        message: "Bank details must be verified before withdrawal",
        requiredAction: "Submit and verify bank details first"
      });
    }

    // Check minimum balance
    const minimumAmount = safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100;
    if (value.amount < minimumAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ${minimumAmount}`,
        minimumAmount,
        requestedAmount: value.amount,
      });
    }

    // Check available balance
    const pendingBalance = safeParseFloat(filmmaker.filmmmakerFinancePendingBalance);
    if (value.amount > pendingBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance for withdrawal",
        availableBalance: pendingBalance,
        requestedAmount: value.amount,
        difference: pendingBalance - value.amount
      });
    }

    // Create withdrawal request (in production, this would be a separate model)
    const withdrawalRequest = {
      id: `WDR-${Date.now()}`,
      amount: value.amount,
      payoutMethod: value.payoutMethod || filmmaker.filmmmakerFinancePayoutMethod,
      status: "pending",
      submittedAt: new Date(),
      estimatedTime: "3-5 business days",
      notes: value.notes
    };

    // Update the user document
    filmmaker.filmmmakerFinancePendingBalance = pendingBalance - value.amount;
    filmmaker.filmmmakerFinanceLastWithdrawalDate = new Date();
    filmmaker.filmmmakerFinancePayoutMethod = value.payoutMethod || filmmaker.filmmmakerFinancePayoutMethod;
    
    // Store withdrawal history
    const withdrawalHistory = filmmaker.filmmmakerFinanceWithdrawalHistory || [];
    withdrawalHistory.push(withdrawalRequest);
    filmmaker.filmmmakerFinanceWithdrawalHistory = withdrawalHistory;
    
    await filmmaker.save();

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: {
        withdrawal: withdrawalRequest,
        newBalance: {
          pendingBalance: filmmaker.filmmmakerFinancePendingBalance,
          withdrawnBalance: safeParseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance) + value.amount,
          totalEarned: safeParseFloat(filmmaker.filmmmakerFinanceTotalEarned),
        },
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get withdrawal history
 * GET /filmmaker/withdrawals
 */
export const getWithdrawalHistory = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker) {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    const withdrawalHistory = filmmaker.filmmmakerFinanceWithdrawalHistory || [];
    const totalWithdrawn = withdrawalHistory
      .filter(w => w.status === "completed")
      .reduce((sum, w) => sum + safeParseFloat(w.amount), 0);

    res.status(200).json({
      success: true,
      data: {
        withdrawnBalance: safeParseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance),
        lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
        payoutMethod: filmmaker.filmmmakerFinancePayoutMethod,
        totalWithdrawn: totalWithdrawn.toFixed(2),
        withdrawalHistory: withdrawalHistory.map(w => ({
          ...w,
          amount: safeParseFloat(w.amount)
        })),
        pendingWithdrawals: withdrawalHistory.filter(w => w.status === "pending").length,
        completedWithdrawals: withdrawalHistory.filter(w => w.status === "completed").length
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== FILMMAKER MOVIE MANAGEMENT ======

// controllers/filmmaker.controller.js
/**
 * Get all filmmaker content (movies and series with episodes)
 * GET /filmmaker/movies
 */
export const getFilmmmakerMovies = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Get movies and series (NO episodes directly)
    const where = { 
      filmmakerId: req.user.id || req.userId,
      contentType: { [Op.in]: ["movie", "series"] } // Only movies and series
    };
    
    if (status) where.status = status;

    const { count, rows: content } = await Movie.findAndCountAll({
      where,
      attributes: [
        "id", "title", "description", "poster", "backdrop", 
        "status", "totalViews", "videoDuration", "totalRevenue", 
        "avgRating", "totalReviews", "createdAt", "viewPrice", 
        "downloadPrice", "currency", "contentType", "slug",
        "seasonNumber", "episodeNumber"
      ],
      order: [['createdAt', 'DESC']],
      offset,
      limit: limitNum
    });

    // Get episodes for all series
    const seriesIds = content.filter(item => item.contentType === "series").map(s => s.id);
    let episodesBySeries = {};
    
    if (seriesIds.length > 0) {
      const episodes = await Movie.findAll({
        where: {
          seriesId: { [Op.in]: seriesIds },
          contentType: "episode",
          status: "approved"
        },
        attributes: [
          "id", "title", "description", "poster", "backdrop", 
          "status", "totalViews", "videoDuration", "totalRevenue", 
          "avgRating", "totalReviews", "createdAt", "viewPrice", 
          "downloadPrice", "currency", "slug",
          "seriesId", "seasonNumber", "episodeNumber"
        ],
        order: [
          ["seriesId", "ASC"],
          ["seasonNumber", "ASC"],
          ["episodeNumber", "ASC"]
        ]
      });

      // Group episodes by seriesId
      episodesBySeries = episodes.reduce((acc, episode) => {
        const seriesId = episode.seriesId;
        if (!acc[seriesId]) acc[seriesId] = [];
        acc[seriesId].push(episode);
        return acc;
      }, {});
    }

    // Transform the response
    const transformedContent = content.map(item => {
      const base = {
        id: item.id,
        title: item.title,
        slug: item.slug,
        description: item.description || item.overview,
        overview: item.overview || item.description,
        poster: item.poster,
        backdrop: item.backdrop,
        status: item.status,
        totalViews: safeParseFloat(item.totalViews),
        videoDuration: safeParseFloat(item.videoDuration),
        totalRevenue: safeParseFloat(item.totalRevenue),
        avgRating: safeParseFloat(item.avgRating),
        totalReviews: safeParseFloat(item.totalReviews),
        createdAt: item.createdAt,
        viewPrice: safeParseFloat(item.viewPrice),
        downloadPrice: safeParseFloat(item.downloadPrice),
        currency: item.currency,
        contentType: item.contentType,
      };

      if (item.contentType === "series") {
        return {
          ...base,
          totalSeasons: item.totalSeasons,
          totalEpisodes: item.totalEpisodes,
          episodes: episodesBySeries[item.id] || [], // Include episodes
        };
      }

      return base; // Movie
    });

    res.status(200).json({
      success: true,
      data: {
        movies: transformedContent, // Contains movies and series with episodes
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Error in getFilmmmakerMovies:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};


// In your filmmaker.controller.js
export const getSeriesEpisodes = async (req, res) => {
  try {
    const { seriesId } = req.params;

    // Get series info
    const series = await Movie.findByPk(seriesId, {
      attributes: [
        "id", "title", "description", "poster", "backdrop", 
        "status", "totalViews","filmmakerId","contentType", "totalRevenue", "avgRating", "totalReviews",
        "createdAt", "viewPrice", "downloadPrice", "currency", "seasonNumber", "episodeNumber"
      ]
    });
    if (!series || series.contentType !== "series") {
   
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    // Check ownership
    if (series.filmmakerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this series"
      });
    }

    // Get episodes
    const episodes = await Movie.findAll({
      where: {
        seriesId: seriesId,
        contentType: "episode",
        status: { [Op.in]: ["approved", "submitted", "pending"] }
      },
      attributes: [
        "id", "title", "description", "poster", "backdrop", 
        "status", "totalViews", "videoDuration", "totalRevenue", 
        "avgRating", "totalReviews", "createdAt", "viewPrice", 
        "downloadPrice", "currency", "slug",
        "seasonNumber", "episodeNumber"
      ],
      order: [
        ["seasonNumber", "ASC"],
        ["episodeNumber", "ASC"]
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        series,
        episodes,
        totalEpisodes: episodes.length,
        seasons: episodes.reduce((acc, episode) => {
          const season = episode.seasonNumber || 1;
          if (!acc[season]) acc[season] = [];
          acc[season].push(episode);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("Error in getSeriesEpisodes:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

/**
 * Edit movie details (filmmaker only)
 * PUT /filmmaker/movies/:movieId
 */
export const editFilmmmakerMovie = async (req, res) => {
  try {
    const { movieId } = req.params;

    const movie = await Movie.findByPk(movieId);

    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Movie not found" 
      });
    }

    // Check ownership
    if (movie.filmmakerId !== (req.user.id || req.userId)) {
      return res.status(403).json({ 
        success: false,
        message: "Not authorized to edit this movie" 
      });
    }

    // Allow editing certain fields only
    const allowedFields = [
      "title",
      "description",
      "categories",
      "tags",
      "viewPrice",
      "downloadPrice",
      "currency",
      "language",
      "royaltyPercentage",
      "status"
    ];
    
    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Update legacy price field for backward compatibility
    if (req.body.viewPrice !== undefined) {
      updateData.price = req.body.viewPrice;
    }

    const updatedMovie = await movie.update(updateData);

    res.status(200).json({
      success: true,
      message: "Movie updated successfully",
      data: {
        movie: updatedMovie
      }
    });
  } catch (error) {
    console.error("Error in editFilmmmakerMovie:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get filmmaker statistics
 * GET /filmmaker/stats
 */
export const getFilmmmakerStats = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker) {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Get movie statistics from actual movies
    const movies = await Movie.findAll({
      where: { filmmakerId: req.user.id || req.userId },
      attributes: [
        'status',
        'contentType',
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'count'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalViews')), 'totalViews'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('totalRevenue')), 'totalRevenue'],
        [Movie.sequelize.fn('AVG', Movie.sequelize.col('avgRating')), 'avgRating']
      ],
      group: ['status', 'contentType']
    });

    // Calculate totals
    const totalMovies = movies.reduce((sum, m) => sum + parseInt(m.dataValues.count), 0);
    const totalViews = movies.reduce((sum, m) => sum + safeParseFloat(m.dataValues.totalViews), 0);
    const totalRevenue = movies.reduce((sum, m) => sum + safeParseFloat(m.dataValues.totalRevenue), 0);
    const avgRating = movies.reduce((sum, m, index, array) => {
      const rating = safeParseFloat(m.dataValues.avgRating);
      return sum + (rating / array.length);
    }, 0);

    // Get payment statistics
    const payments = await Payment.findAll({
      where: {
        filmmakerId: req.user.id || req.userId,
        paymentStatus: "succeeded"
      },
      attributes: [
        [Movie.sequelize.fn('COUNT', Movie.sequelize.col('id')), 'count'],
        [Movie.sequelize.fn('SUM', Movie.sequelize.col('amount')), 'totalAmount']
      ]
    });

    const totalSales = payments[0] ? parseInt(payments[0].dataValues.count) : 0;

    res.status(200).json({
      success: true,
      data: {
        totalMovies,
        totalViews,
        totalRevenue: totalRevenue.toFixed(2),
        totalSales,
        totalEarnings: safeParseFloat(filmmaker.filmmmakerFinanceTotalEarned),
        averageRating: avgRating.toFixed(1),
        byContentType: movies.reduce((acc, m) => {
          const type = m.contentType || "movie";
          if (!acc[type]) acc[type] = 0;
          acc[type] += parseInt(m.dataValues.count);
          return acc;
        }, {}),
        byStatus: movies.reduce((acc, m) => {
          const status = m.status || "unknown";
          if (!acc[status]) acc[status] = 0;
          acc[status] += parseInt(m.dataValues.count);
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("Error in getFilmmmakerStats:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== PAYMENT METHOD MANAGEMENT ======

/**
 * Update payment method for filmmaker
 * PUT /filmmaker/payment-method
 */
export const updatePaymentMethod = async (req, res) => {
  try {
    const {
      payoutMethod,
      momoPhoneNumber,
      bankAccountHolder,
      bankName,
      accountNumber,
      accountType,
      routingNumber,
      swiftCode,
      country,
      stripeAccountId,
    } = req.body;

    // Validate payment method
    const validMethods = ["bank_transfer", "paypal", "stripe", "momo"];
    if (!payoutMethod || !validMethods.includes(payoutMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
        validMethods,
        receivedMethod: payoutMethod,
      });
    }

    // Update payment method
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker) {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    filmmaker.filmmmakerFinancePayoutMethod = payoutMethod;

    // Add method-specific details
    if (payoutMethod === "momo") {
      filmmaker.filmmmakerMomoPhoneNumber = momoPhoneNumber;
    } else if (payoutMethod === "bank_transfer") {
      filmmaker.filmmmakerBankDetails = {
        accountName: bankAccountHolder,
        accountNumber,
        bankName,
        country,
        accountType: accountType || "checking",
        routingNumber: routingNumber || "",
        swiftCode: swiftCode || "",
        isVerified: false, // Admin must verify
        updatedAt: new Date()
      };
    } else if (payoutMethod === "stripe") {
      filmmaker.filmmmakerStripeAccountId = stripeAccountId;
    }

    await filmmaker.save();

    // Build response with updated payment details
    const responsePaymentDetails = {
      payoutMethod: filmmaker.filmmmakerFinancePayoutMethod,
    };

    if (payoutMethod === "momo") {
      responsePaymentDetails.momoPhoneNumber = filmmaker.filmmmakerMomoPhoneNumber;
    } else if (payoutMethod === "bank_transfer") {
      responsePaymentDetails.bankDetails = filmmaker.filmmmakerBankDetails;
    } else if (payoutMethod === "stripe") {
      responsePaymentDetails.stripeAccountId = filmmaker.filmmmakerStripeAccountId;
    }

    res.status(200).json({
      success: true,
      message: "Payment method updated successfully",
      data: {
        paymentMethod: payoutMethod,
        paymentDetails: responsePaymentDetails,
        nextStep: payoutMethod === "bank_transfer"
          ? "Bank details submitted for admin verification"
          : "Payment method ready to use",
      }
    });
  } catch (error) {
    console.error("Error in updatePaymentMethod:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get current payment method
 * GET /filmmaker/payment-method
 */
export const getPaymentMethod = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Build payment details based on current method
    const currentMethod = filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer";
    let paymentDetails = {
      momoPhoneNumber: filmmaker.filmmmakerMomoPhoneNumber || null,
      bankDetails: filmmaker.filmmmakerBankDetails || null,
      stripeAccountId: filmmaker.filmmmakerStripeAccountId || null,
      paypalEmail: filmmaker.filmmmakerPaypalEmail || null,
    };

    res.status(200).json({
      success: true,
      data: {
        currentMethod: currentMethod,
        paymentDetails: {
          [currentMethod]: currentMethod === "momo" ? paymentDetails.momoPhoneNumber :
                         currentMethod === "stripe" ? paymentDetails.stripeAccountId :
                         currentMethod === "paypal" ? paymentDetails.paypalEmail :
                         paymentDetails.bankDetails,
          allMethods: paymentDetails,
        },
        financialInfo: {
          pendingBalance: safeParseFloat(filmmaker.filmmmakerFinancePendingBalance),
          totalEarned: safeParseFloat(filmmaker.filmmmakerFinanceTotalEarned),
          minimumWithdrawalAmount: safeParseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
          lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate || null,
        },
        verificationStatus: {
          bankDetails: filmmaker.filmmmakerBankDetails?.isVerified || false,
          lastVerified: filmmaker.filmmmakerBankDetails?.verifiedAt || null,
        },
        availableMethods: [
          { id: "bank_transfer", name: "Bank Transfer", description: "Direct bank deposit" },
          { id: "paypal", name: "PayPal", description: "PayPal account transfer" },
          { id: "stripe", name: "Stripe", description: "Stripe connected account" },
          { id: "momo", name: "MTN MoMo", description: "MTN Mobile Money" },
        ],
      }
    });
  } catch (error) {
    console.error("Error in getPaymentMethod:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};