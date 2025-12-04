import User from "../models/User.modal.js";
import Movie from "../models/Movie.model.js";
import Payment from "../models/Payment.model.js";
import Review from "../models/Review.model.js";
import Joi from "joi";

// ====== VALIDATION SCHEMAS ======

const approveFilmmmakerSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required(),
  reason: Joi.string().when("status", {
    is: "rejected",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

const blockUserSchema = Joi.object({
  reason: Joi.string().required(),
  duration: Joi.number().min(1), // Days, 0 = permanent
});

// ====== ADMIN DASHBOARD & ANALYTICS ======

/**
 * Get admin dashboard overview
 * GET /admin/dashboard
 */
export const getAdminDashboard = async (req, res) => {
  try {
    // Get total statistics
    const totalUsers = await User.count();
    const totalViewers = await User.count({ where: { role: "viewer" } });
    const totalFilmmakers = await User.count({ where: { role: "filmmaker" } });
    const totalAdmins = await User.count({ where: { role: "admin" } });
    const totalMovies = await Movie.count();
    const approvedMovies = await Movie.count({ where: { status: "approved" } });
    const pendingMovies = await Movie.count({ where: { status: "submitted" } });

    // Get payment statistics
    const payments = await Payment.findAll({ where: { paymentStatus: "succeeded" } });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalTransactions = payments.length;

    // Get pending filmmaker approvals
    const pendingFilmmakers = await User.count({
      where: {
        role: "filmmaker",
        approvalStatus: "pending",
      },
    });

    // Blocked users
    const blockedUsers = await User.count({ where: { isBlocked: true } });

    res.status(200).json({
      users: {
        total: totalUsers,
        viewers: totalViewers,
        filmmakers: totalFilmmakers,
        admins: totalAdmins,
        blocked: blockedUsers,
        pendingApproval: pendingFilmmakers,
      },
      content: {
        totalMovies,
        approved: approvedMovies,
        pending: pendingMovies,
        rejected: await Movie.count({ where: { status: "rejected" } }),
      },
      finance: {
        totalRevenue: totalRevenue.toFixed(2),
        totalTransactions,
        averageTransaction:
          totalTransactions > 0
            ? (totalRevenue / totalTransactions).toFixed(2)
            : 0,
        platformEarnings: (totalRevenue * 0.1).toFixed(2), // 10% platform fee
      },
      alerts: {
        pendingFilmmakers,
        pendingMovies,
        blockedUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get detailed analytics
 * GET /admin/analytics
 */
export const getDetailedAnalytics = async (req, res) => {
  try {
    const { period = "month" } = req.query; // day, week, month, year

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get metrics for period
    const { Op } = require("sequelize");
    const newUsers = await User.count({
      where: {
        createdAt: { [Op.gte]: startDate },
      },
    });
    const newMovies = await Movie.count({
      where: {
        createdAt: { [Op.gte]: startDate },
      },
    });
    const periodPayments = await Payment.findAll({
      where: {
        paymentDate: { [Op.gte]: startDate },
        paymentStatus: "succeeded",
      },
    });
    const periodRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0);

    // Get top movies
    const topMovies = await Movie.findAll({
      where: { status: "approved" },
      order: [['totalViews', 'DESC']],
      limit: 10,
      attributes: ['title', 'totalViews', 'totalRevenue', 'avgRating']
    });

    // Get top filmmakers
    const topFilmmakers = await User.findAll({
      where: { role: "filmmaker" },
      order: [['filmmmakerStatsTotalRevenue', 'DESC']],
      limit: 10,
      attributes: ['name', 'filmmmakerIsVerified', 'filmmmakerBio', 'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue', 'filmmmakerStatsTotalViews', 'filmmmakerStatsTotalDownloads', 'filmmmakerFinancePendingBalance', 'filmmmakerFinanceWithdrawnBalance', 'approvalStatus']
    });

    // Payment methods distribution
    const paymentMethods = {};
    periodPayments.forEach((p) => {
      paymentMethods[p.paymentMethod] =
        (paymentMethods[p.paymentMethod] || 0) + 1;
    });

    res.status(200).json({
      period,
      dateRange: {
        start: startDate,
        end: now,
      },
      metrics: {
        newUsers,
        newMovies,
        transactions: periodPayments.length,
        revenue: periodRevenue.toFixed(2),
        platformEarnings: (periodRevenue * 0.1).toFixed(2),
      },
      top: {
        movies: topMovies,
        filmmakers: topFilmmakers,
      },
      paymentDistribution: paymentMethods,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== FILMMAKER MANAGEMENT ======

/**
 * Get all filmmakers with pending approval
 * GET /admin/filmmakers/pending
 */
export const getPendingFilmmakers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filmmakers = await User.findAll({
      where: {
        role: "filmmaker",
        approvalStatus: "pending",
      },
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
      attributes: ['name', 'email', 'filmmmakerIsVerified', 'approvalStatus', 'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue', 'createdAt', 'rejectionReason']
    });

    const total = await User.count({
      where: {
        role: "filmmaker",
        approvalStatus: "pending",
      },
    });

    res.status(200).json({
      data: filmmakers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Approve or reject filmmaker
 * PATCH /admin/filmmakers/:filmamakerId/approve
 */
export const approveFilmmaker = async (req, res) => {
  try {
    const { error, value } = approveFilmmmakerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { filmamakerId } = req.params;
    const filmmaker = await User.findByPk(filmamakerId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    const updateData = {
      approvalStatus: value.status,
      "approvalHistory": [
        ...filmmaker.approvalHistory,
        {
          status: value.status,
          approvedBy: req.userId,
          reason: value.reason,
          approvedAt: new Date(),
        },
      ],
    };

    if (value.status === "rejected") {
      updateData.rejectionReason = value.reason;
    }

    // const filmmaker = await User.findByPk(filmamakerId);

    if (filmmaker) {
      Object.assign(filmmaker, updateData);
      await filmmaker.save();
    }

    res.status(200).json({
      message: `Filmmaker ${value.status} successfully`,
      filmmaker: filmmaker ? { name: filmmaker.name, email: filmmaker.email, approvalStatus: filmmaker.approvalStatus, rejectionReason: filmmaker.rejectionReason } : null,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get all filmmakers
 * GET /admin/filmmakers
 */
export const getAllFilmmakers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let where = { role: "filmmaker" };
    if (status) where.approvalStatus = status;

    const filmmakers = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
      attributes: ['name', 'email', 'filmmmakerIsVerified', 'approvalStatus', 'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue', 'filmmmakerStatsTotalViews', 'filmmmakerFinancePendingBalance', 'filmmmakerFinanceWithdrawnBalance', 'isBlocked']
    });

    const total = await User.count({ where });

    res.status(200).json({
      data: filmmakers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Verify filmmaker bank details
 * PATCH /admin/filmmakers/:filmamakerId/verify-bank
 */
export const verifyFilmmmakerBank = async (req, res) => {
  try {
    const { filmamakerId } = req.params;

    const filmmaker = await User.findByPk(filmamakerId);

    if (!filmmaker) {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    if (!filmmaker.filmmaker) filmmaker.filmmaker = {};
    if (filmmaker.filmmaker.bankDetails) {
      filmmaker.filmmaker.bankDetails.isVerified = true;
    }
    filmmaker.filmmaker.isVerified = true;
    filmmaker.filmmaker.verifiedAt = new Date();

    await filmmaker.save();

    res.status(200).json({
      message: "Bank details verified successfully",
      filmmaker: filmmaker.filmmaker,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== USER MANAGEMENT ======

/**
 * Get all users
 * GET /admin/users
 */
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { Op } = require("sequelize");
    let where = {};
    if (role) where.role = role;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
      attributes: ['name', 'email', 'role', 'isBlocked', 'approvalStatus', 'createdAt', 'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue']
    });

    const total = await User.count({ where });

    res.status(200).json({
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Block user account
 * PATCH /admin/users/:userId/block
 */
export const blockUser = async (req, res) => {
  try {
    const { error, value } = blockUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { userId } = req.params;

    // Prevent blocking admin
    const user = await User.findByPk(userId);
    if (user?.role === "admin") {
      return res.status(403).json({
        message: "Cannot block admin users",
      });
    }

    const blockedUntil = value.duration
      ? new Date(Date.now() + value.duration * 24 * 60 * 60 * 1000)
      : null;

    // const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = true;
    user.blockedReason = value.reason;
    user.blockedAt = new Date();
    user.blockedBy = req.userId;

    await user.save();

    const updatedUser = user;

    res.status(200).json({
      message: "User blocked successfully",
      user: updatedUser,
      blockedUntil: value.duration ? blockedUntil : "Permanently",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Unblock user account
 * PATCH /admin/users/:userId/unblock
 */
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = false;
    user.blockedReason = null;
    user.blockedAt = null;
    user.blockedBy = null;

    await user.save();

    const updatedUser = user;

    res.status(200).json({
      message: "User unblocked successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Delete user account
 * DELETE /admin/users/:userId
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting admin
    const user = await User.findByPk(userId);
    if (user?.role === "admin") {
      return res.status(403).json({
        message: "Cannot delete admin users",
      });
    }

    // If filmmaker, mark all their movies as hidden
    if (user?.role === "filmmaker") {
      await Movie.update(
        { status: "hidden" },
        { where: { filmmakerId: userId } }
      );
    }

    await user.destroy();

    res.status(200).json({
      message: "User deleted successfully",
      userId,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== CONTENT MODERATION ======

/**
 * Get pending movie approvals
 * GET /admin/movies/pending
 */
export const getPendingMovies = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const movies = await Movie.findAll({
      where: { status: "submitted" },
      include: [{ association: 'filmmaker', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
      attributes: ['title', 'overview', 'filmmaker', 'avgRating', 'reviewCount', 'status', 'submittedAt', 'release_date', 'videoDuration']
    });

    const total = await Movie.count({ where: { status: "submitted" } });

    res.status(200).json({
      data: movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Approve or reject movie
 * PATCH /admin/movies/:movieId/approve
 */
export const approveMovie = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { status, reason } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: 'Status must be "approved" or "rejected"',
      });
    }

    const updateData = {
      status,
      approvedBy: req.userId,
      approvedAt: new Date(),
    };

    if (status === "rejected") {
      if (!reason) {
        return res.status(400).json({
          message: "Rejection reason is required",
        });
      }
      updateData.rejectionReason = reason;
    }

    const movie = await Movie.findByPk(movieId);

    if (!movie) {
      return res.status(404).json({ message: "Movie not found" });
    }

    Object.assign(movie, updateData);
    await movie.save();

    res.status(200).json({
      message: `Movie ${status} successfully`,
      movie,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get flagged content for review
 * GET /admin/flagged-content
 */
export const getFlaggedContent = async (req, res) => {
  try {
    const { page = 1, limit = 10, type = "all" } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Get low-rated movies (potential quality issues)
    const flaggedMovies =
      type === "all" || type === "movies"
        ? await Movie.findAll({
            where: { avgRating: { [require('sequelize').Op.lt]: 3 } },
            attributes: ["title", "avgRating", "reviewCount", "status"],
            order: [['avgRating', 'ASC']],
            offset: skip,
            limit: limitNum
          })
        : [];

    // Get reviews with many negative comments (potential spam)
    const flaggedReviews =
      type === "all" || type === "reviews"
        ? await Review.findAll({
            where: { rating: { [require('sequelize').Op.lt]: 2 } },
            attributes: ["comment", "rating", "movie"],
            include: [{ association: "movie", attributes: ["title"] }],
            order: [['rating', 'ASC']],
            offset: skip,
            limit: limitNum
          })
        : [];

    res.status(200).json({
      flaggedMovies: flaggedMovies || [],
      flaggedReviews: flaggedReviews || [],
      totalFlagged: (flaggedMovies?.length || 0) + (flaggedReviews?.length || 0),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== PAYMENT RECONCILIATION ======

/**
 * Get payment reconciliation for filmmakers
 * GET /admin/payments/reconciliation
 */
export const getPaymentReconciliation = async (req, res) => {
  try {
    const { period = "month" } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const payments = await Payment.find({
      paymentDate: { $gte: startDate },
      paymentStatus: "succeeded",
    }).populate("movieId", "title filmmaker");

    let totalPlatformEarnings = 0;
    let filmmmakerPayouts = {};

    payments.forEach((payment) => {
      const platformFee = payment.amount * 0.1; // 10% platform fee
      totalPlatformEarnings += platformFee;

      const filmamakerId = payment.movieId?.filmmaker?.filmamakerId;
      if (filmamakerId) {
        filmmmakerPayouts[filmamakerId] =
          (filmmmakerPayouts[filmamakerId] || 0) + (payment.amount * 0.9);
      }
    });

    res.status(200).json({
      period,
      dateRange: { start: startDate, end: now },
      totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2),
      platformEarnings: totalPlatformEarnings.toFixed(2),
      filmmmakerPayouts: Object.entries(filmmmakerPayouts).map(
        ([filmamakerId, amount]) => ({
          filmamakerId,
          payoutAmount: amount.toFixed(2),
        })
      ),
      transactionCount: payments.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const recentAdminActivities = async (req, res) => {
  try {
    // This is a placeholder implementation. In a real application, you would fetch this data from an AdminActivity model.
    const activities = [
      {
        action: "Approved filmmaker",
        performedBy: "Admin User",
        timestamp: new Date(),
        details: "Approved filmmaker John Doe",
      },
      {
        action: "Blocked user",
        performedBy: "Admin User",
        timestamp: new Date(),
        details: "Blocked user"
      },
    ];

    res.status(200).json({ activities });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }

};
