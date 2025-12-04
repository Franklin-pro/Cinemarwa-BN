import User from "../models/User.modal.js";
import Movie from "../models/Movie.model.js";
import Payment from "../models/Payment.model.js";
import Joi from "joi";

// ====== AUTHORIZATION HELPER ======
/**
 * Verify that filmmaker can only access their own data
 * @param {string} requestedId - The ID being requested (from params)
 * @param {string} authenticatedId - The authenticated user's ID
 * @returns {boolean} True if authorized
 */
const canAccessFilmmakerData = (requestedId, authenticatedId) => {
  // If no ID is being requested, it's the authenticated user's own data
  if (!requestedId) return true;

  // Compare IDs as strings to handle ObjectId comparison
  return requestedId.toString() === authenticatedId.toString();
};

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

// ====== FILMMAKER PROFILE MANAGEMENT ======

/**
 * Get filmmaker profile and dashboard summary
 * GET /filmmaker/profile
 */
export const getFilmmmakerProfile = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.userId, {
      attributes: ["name", "email", "role", "filmmmakerIsVerified", "filmmmakerBio", "filmmmakerProfileImage", "filmmmakerBankDetails", "filmmmakerStatsTotalMovies", "filmmmakerStatsTotalRevenue", "filmmmakerStatsTotalViews", "filmmmakerStatsTotalDownloads", "filmmmakerFinancePendingBalance", "filmmmakerFinanceWithdrawnBalance", "approvalStatus"]
    });

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    res.status(200).json({
      filmmaker,
      verification: {
        profileVerified: filmmaker.filmmmakerIsVerified,
        bankDetailsVerified: filmmaker.filmmmakerBankDetails?.isVerified,
        accountApproved: filmmaker.approvalStatus === "approved",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
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
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const filmmaker = await User.findByPk(req.userId);

    if (filmmaker) {
      if (value.bio) filmmaker.filmmmakerBio = value.bio;
      if (value.website) filmmaker.filmmmakerWebsite = value.website;
      if (value.socialLinks) filmmaker.filmmmakerSocialLinks = value.socialLinks;
      if (value.bankDetails) {
        filmmaker.filmmmakerBankDetails = value.bankDetails;
        filmmaker.filmmmakerBankDetails.isVerified = false; // Admin must verify
      }
      if (value.payoutMethod) {
        filmmaker.filmmmakerFinancePayoutMethod = value.payoutMethod;
      }
      await filmmaker.save();
    }

    res.status(200).json({
      message: "Profile updated successfully",
      filmmaker,
      nextStep: value.bankDetails
        ? "Bank details submitted. Awaiting admin verification"
        : "Profile updated",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== FILMMAKER ANALYTICS DASHBOARD ======

/**
 * Get filmmaker dashboard summary
 * GET /filmmaker/dashboard
 */
/**
 * Get filmmaker dashboard summary
 * GET /filmmaker/dashboard
 */
export const getFilmmmakerDashboard = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    // Get movie statistics
    const movies = await Movie.findAll({
      where: { filmmakerId: req.userId },
      attributes: ["totalViews", "totalDownloads", "totalRevenue", "avgRating"]
    });

    // Initialize with 0 values to handle empty results
    const totalViews = movies.reduce((sum, m) => sum + (parseFloat(m.totalViews) || 0), 0);
    const totalDownloads = movies.reduce((sum, m) => sum + (parseFloat(m.totalDownloads) || 0), 0);
    const totalRevenue = movies.reduce((sum, m) => sum + (parseFloat(m.totalRevenue) || 0), 0);

    // Calculate filmmaker earnings (90% of revenue, 10% platform fee)
    const platformFeePercentage = filmmaker.filmmmakerFinancePlatformFeePercentage || 10;
    const platformFee = (totalRevenue * platformFeePercentage) / 100;
    const filmmmakerEarnings = totalRevenue - platformFee;

    // Get payment history
    const payments = await Payment.findAll({
      where: {
        userId: req.userId,
        paymentStatus: "succeeded"
      }
    });

    const totalSales = payments.length;

    // Ensure all values are numbers before using .toFixed()
    const formatCurrency = (value) => {
      const num = parseFloat(value) || 0;
      return num.toFixed(2);
    };

    res.status(200).json({
      summary: {
        totalMovies: movies.length,
        totalViews,
        totalDownloads,
        totalSales,
        totalRevenue: formatCurrency(totalRevenue),
        filmmmakerEarnings: formatCurrency(filmmmakerEarnings),
        platformFee: formatCurrency(platformFee),
      },
      finance: {
        pendingBalance: parseFloat(filmmaker.filmmmakerFinancePendingBalance) || 0,
        withdrawnBalance: parseFloat(filmmaker.filmmmakerFinanceWithdrawnBalance) || 0,
        totalEarned: parseFloat(filmmaker.filmmmakerFinanceTotalEarned) || 0,
        minimumWithdrawalAmount:
          parseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
        canWithdraw:
          (parseFloat(filmmaker.filmmmakerFinancePendingBalance) || 0) >=
          (parseFloat(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100),
      },
      approval: {
        status: filmmaker.approvalStatus,
        isVerified: filmmaker.filmmmakerIsVerified,
        bankVerified: filmmaker.filmmmakerBankDetails?.isVerified || false,
      },
      movies: movies.map((m) => ({
        id: m.id,
        title: m.title,
        views: parseFloat(m.totalViews) || 0,
        downloads: parseFloat(m.totalDownloads) || 0,
        revenue: formatCurrency(m.totalRevenue),
        rating: parseFloat(m.avgRating) || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get detailed analytics for a specific movie
 * GET /filmmaker/analytics/:movieId
 */
export const getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;

    const movie = await Movie.findByPk(movieId);

    if (!movie) {
      return res.status(404).json({ message: "Movie not found" });
    }

    // Check ownership
    if (movie.filmmakerId !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Get payment data for this movie
    const payments = await Payment.findAll({
      where: {
        movieId: movieId,
        paymentStatus: "succeeded"
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const filmmaker = await User.findByPk(req.userId);
    const platformFeePercentage = filmmaker.filmmmakerFinancePlatformFeePercentage || 10;
    const platformFee = (totalRevenue * platformFeePercentage) / 100;
    const filmmmakerShare = totalRevenue - platformFee;

    // Group payments by method
    const paymentsByMethod = {};
    payments.forEach((p) => {
      if (p.paymentMethod) {
        paymentsByMethod[p.paymentMethod] = (paymentsByMethod[p.paymentMethod] || 0) + 1;
      }
    });

    // Helper function to format currency
    const formatCurrency = (value) => {
      const num = parseFloat(value) || 0;
      return num.toFixed(2);
    };

    res.status(200).json({
      movie: {
        id: movie.id,
        title: movie.title,
        status: movie.status,
        totalViews: parseFloat(movie.totalViews) || 0,
        totalDownloads: parseFloat(movie.totalDownloads) || 0,
        avgRating: parseFloat(movie.avgRating) || 0,
        reviewCount: parseFloat(movie.reviewCount) || 0,
      },
      revenue: {
        totalRevenue: formatCurrency(totalRevenue),
        filmmmakerShare: formatCurrency(filmmmakerShare),
        platformFee: formatCurrency(platformFee),
        platformFeePercentage: platformFeePercentage,
      },
      sales: {
        totalSales: payments.length,
        byPaymentMethod: paymentsByMethod,
        averageSalePrice:
          payments.length > 0 ? formatCurrency(totalRevenue / payments.length) : "0.00",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== FILMMAKER REVENUE & WITHDRAWAL MANAGEMENT ======

/**
 * Get filmmaker financial summary
 * GET /filmmaker/finance
 */
export const getFinancialSummary = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    res.status(200).json({
      balance: {
        pendingBalance: filmmaker.filmmmakerFinancePendingBalance,
        withdrawnBalance: filmmaker.filmmmakerFinanceWithdrawnBalance,
        totalEarned: filmmaker.filmmmakerFinanceTotalEarned,
        currentBalance: filmmaker.filmmmakerFinancePendingBalance + filmmaker.filmmmakerFinanceWithdrawnBalance,
      },
      withdrawalSettings: {
        minimumAmount: filmmaker.filmmmakerFinanceMinimumWithdrawalAmount,
        payoutMethod: filmmaker.filmmmakerFinancePayoutMethod,
        lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
        canWithdraw: filmmaker.filmmmakerFinancePendingBalance >= filmmaker.filmmmakerFinanceMinimumWithdrawalAmount,
      },
      bankDetails: filmmaker.filmmmakerBankDetails || {},
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
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
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const filmmaker = await User.findByPk(req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    // Check if verified
    if (!filmmaker.filmmmakerBankDetails?.isVerified) {
      return res.status(400).json({
        message: "Bank details must be verified before withdrawal",
      });
    }

    // Check minimum balance
    if (value.amount < filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) {
      return res.status(400).json({
        message: `Minimum withdrawal amount is ${filmmaker.filmmmakerFinanceMinimumWithdrawalAmount}`,
        minimumAmount: filmmaker.filmmmakerFinanceMinimumWithdrawalAmount,
        requestedAmount: value.amount,
      });
    }

    // Check available balance
    if (value.amount > filmmaker.filmmmakerFinancePendingBalance) {
      return res.status(400).json({
        message: "Insufficient balance for withdrawal",
        availableBalance: filmmaker.filmmmakerFinancePendingBalance,
        requestedAmount: value.amount,
      });
    }

    // Create withdrawal request (in production, this would be a separate model)
    // For now, we'll update the user document
    filmmaker.filmmmakerFinancePendingBalance = filmmaker.filmmmakerFinancePendingBalance - value.amount;
    filmmaker.filmmmakerFinanceLastWithdrawalDate = new Date();
    filmmaker.filmmmakerFinancePayoutMethod = value.payoutMethod;
    await filmmaker.save();

    res.status(201).json({
      message: "Withdrawal request submitted successfully",
      withdrawal: {
        amount: value.amount,
        payoutMethod: value.payoutMethod,
        status: "pending",
        submittedAt: new Date(),
        estimatedTime: "3-5 business days",
      },
      newBalance: {
        pendingBalance: filmmaker.filmmmakerFinancePendingBalance,
        withdrawnBalance: filmmaker.filmmmakerFinanceWithdrawnBalance,
        totalEarned: filmmaker.filmmmakerFinanceTotalEarned,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get withdrawal history
 * GET /filmmaker/withdrawals
 */
export const getWithdrawalHistory = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.userId, {
      attributes: ["filmmmakerFinanceWithdrawnBalance", "filmmmakerFinanceLastWithdrawalDate", "filmmmakerFinancePayoutMethod"]
    });

    if (!filmmaker) {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    // In production, fetch from Withdrawal model
    // For now, return basic info
    res.status(200).json({
      withdrawnBalance: filmmaker.filmmmakerFinanceWithdrawnBalance,
      lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
      payoutMethod: filmmaker.filmmmakerFinancePayoutMethod,
      message: "Withdrawal details stored in user account",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== FILMMAKER MOVIE MANAGEMENT ======

/**
 * Get all movies by filmmaker
 * GET /filmmaker/movies
 */
export const getFilmmmakerMovies = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let where = { filmmakerId: req.userId };
    if (status) where.status = status;

    const movies = await Movie.findAll({
      where,
      attributes: ["title", "overview", "poster", "backdrop", "status", "totalViews","videoDuration", "totalDownloads", "totalRevenue", "avgRating", "createdAt", "viewPrice", "downloadPrice", "currency"],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum
    });

    const total = await Movie.count({ where });

    res.status(200).json({
      success: true,
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
 * Edit movie details (filmmaker only)
 * PUT /filmmaker/movies/:movieId
 */
export const editFilmmmakerMovie = async (req, res) => {
  try {
    const { movieId } = req.params;

    const movie = await Movie.findByPk(movieId);

    if (!movie) {
      return res.status(404).json({ message: "Movie not found" });
    }

    // Check ownership
    if (movie.filmmakerId !== req.userId) {
      return res.status(403).json({ message: "Not authorized to edit this movie" });
    }

    // Allow editing certain fields only
    const allowedFields = [
      "title",
      "overview",
      "categories",
      "tags",
      "price",
      "viewPrice",
      "downloadPrice",
      "currency",
      "allowDownload",
      "language",
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const updatedMovie = await movie.update(updateData);

    res.status(200).json({
      message: "Movie updated successfully",
      movie: updatedMovie,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get filmmaker statistics
 * GET /filmmaker/stats
 */
export const getFilmmmakerStats = async (req, res) => {
  try {
    const filmmaker = await User.findByPk(req.userId, {
      attributes: ["filmmmakerStatsTotalMovies", "filmmmakerStatsTotalRevenue", "filmmmakerStatsTotalViews", "filmmmakerStatsTotalDownloads", "filmmmakerStatsTotalEarnings", "filmmmakerStatsAverageRating", "filmmmakerStatsTotalReviews"]
    });

    if (!filmmaker) {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    res.status(200).json({
      totalMovies: filmmaker.filmmmakerStatsTotalMovies,
      totalRevenue: filmmaker.filmmmakerStatsTotalRevenue,
      totalViews: filmmaker.filmmmakerStatsTotalViews,
      totalDownloads: filmmaker.filmmmakerStatsTotalDownloads,
      totalEarnings: filmmaker.filmmmakerStatsTotalEarnings,
      averageRating: filmmaker.filmmmakerStatsAverageRating,
      totalReviews: filmmaker.filmmmakerStatsTotalReviews
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ====== PAYMENT METHOD MANAGEMENT ======

/**
 * Update payment method for filmmaker
 * PUT /filmmaker/payment-method
 *
 * Accepts:
 * {
 *   "payoutMethod": "momo" | "bank_transfer" | "paypal" | "stripe",
 *   "momoPhoneNumber": "+250...",
 *   "bankAccountHolder": "Name",
 *   "bankName": "Bank Name",
 *   "accountNumber": "123456789",
 *   "accountType": "checking" | "savings",
 *   "routingNumber": "...",
 *   "swiftCode": "...",
 *   "country": "...",
 *   "stripeAccountId": "..."
 * }
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

    // Validate payment method specific fields
    if (payoutMethod === "momo") {
      if (!momoPhoneNumber) {
        return res.status(400).json({
          success: false,
          message: "MoMo phone number is required for MoMo payments",
          requiredFields: ["momoPhoneNumber"],
        });
      }
    }

    if (payoutMethod === "bank_transfer") {
      if (!bankAccountHolder || !bankName || !accountNumber || !country) {
        return res.status(400).json({
          success: false,
          message: "Bank details are required for bank transfer",
          requiredFields: [
            "bankAccountHolder",
            "bankName",
            "accountNumber",
            "country",
          ],
        });
      }
    }

    if (payoutMethod === "stripe") {
      if (!stripeAccountId) {
        return res.status(400).json({
          success: false,
          message: "Stripe account ID is required for Stripe payments",
          requiredFields: ["stripeAccountId"],
        });
      }
    }

    // Update payment method
    const filmmaker = await User.findByPk(req.userId);

    if (!filmmaker) {
      return res.status(404).json({ message: "Filmmaker not found" });
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
      paymentMethod: payoutMethod,
      paymentDetails: responsePaymentDetails,
      allMethods: {
        momoPhoneNumber: filmmaker.filmmmakerMomoPhoneNumber || null,
        bankDetails: filmmaker.filmmmakerBankDetails || null,
        stripeAccountId: filmmaker.filmmmakerStripeAccountId || null,
      },
      nextStep:
        payoutMethod === "bank_transfer"
          ? "Bank details submitted for admin verification"
          : "Payment method ready to use",
    });
  } catch (error) {
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
    const filmmaker = await User.findByPk(req.userId, {
      attributes: ["role", "filmmmakerFinancePayoutMethod", "filmmmakerFinancePendingBalance", "filmmmakerFinanceTotalEarned", "filmmmakerFinanceMinimumWithdrawalAmount", "filmmmakerFinanceLastWithdrawalDate", "filmmmakerMomoPhoneNumber", "filmmmakerBankDetails", "filmmmakerStripeAccountId", "filmmmakerPaypalEmail"]
    });

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ message: "Filmmaker not found" });
    }

    // Build payment details based on current method
    const currentMethod = filmmaker.filmmmakerFinancePayoutMethod;
    let paymentDetails = {
      momoPhoneNumber: filmmaker.filmmmakerMomoPhoneNumber || null,
      bankDetails: filmmaker.filmmmakerBankDetails || null,
      stripeAccountId: filmmaker.filmmmakerStripeAccountId || null,
      paypalEmail: filmmaker.filmmmakerPaypalEmail || null,
    };

    res.status(200).json({
      success: true,
      currentMethod: currentMethod,
      paymentDetails: {
        [currentMethod]: paymentDetails[currentMethod === "momo" ? "momoPhoneNumber" : currentMethod === "stripe" ? "stripeAccountId" : currentMethod === "paypal" ? "paypalEmail" : "bankDetails"],
        allMethods: paymentDetails,
      },
      financialInfo: {
        pendingBalance: filmmaker.filmmmakerFinancePendingBalance || 0,
        totalEarned: filmmaker.filmmmakerFinanceTotalEarned || 0,
        minimumWithdrawalAmount: filmmaker.filmmmakerFinanceMinimumWithdrawalAmount || 100,
        lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate || null,
      },
      availableMethods: [
        { id: "bank_transfer", name: "Bank Transfer", description: "Direct bank deposit" },
        { id: "paypal", name: "PayPal", description: "PayPal account transfer" },
        { id: "stripe", name: "Stripe", description: "Stripe connected account" },
        { id: "momo", name: "MTN MoMo", description: "MTN Mobile Money" },
      ],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
