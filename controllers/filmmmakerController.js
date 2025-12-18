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

// FIXED: Enhanced helper function to safely parse numeric values
const safeParseNumber = (value) => {
  const num = Number(value);
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

// ====== FILMMAKER ANALYTICS DASHBOARD ======

/**
 * Get filmmaker dashboard summary - WITH 6% GATEWAY FEE DEDUCTION
 * GET /filmmaker/dashboard
 */
export const getFilmmmakerDashboard = async (req, res) => {
  try {
    const GATEWAY_FEE_PERCENT = 6; // 6% MTN gateway fee
    
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
      attributes: [
        "id", "title", "totalViews", "totalRevenue", 
        "avgRating", "totalReviews", "viewPrice", "status", 
        "createdAt", "royaltyPercentage"
      ]
    });

    // Calculate totals using safeParseNumber
    const totalViews = movies.reduce((sum, movie) => {
      return sum + safeParseNumber(movie.totalViews);
    }, 0);

    let totalRevenue = movies.reduce((sum, movie) => {
      return sum + safeParseNumber(movie.totalRevenue);
    }, 0);

    const totalMovies = movies.length;

    // Calculate average rating properly
    const totalRatingSum = movies.reduce((sum, movie) => {
      return sum + safeParseNumber(movie.avgRating);
    }, 0);
    const avgRating = totalMovies > 0 ? totalRatingSum / totalMovies : 0;

    // APPLY 6% GATEWAY FEE DEDUCTION TO TOTAL REVENUE
    const gatewayFee = (totalRevenue * GATEWAY_FEE_PERCENT) / 100;
    const revenueAfterGatewayFee = totalRevenue - gatewayFee;

    // Calculate filmmaker earnings from revenue after gateway fee
    let filmmmakerEarnings = 0;
    let totalRoyaltyPercentage = 0;
    
    if (totalMovies > 0) {
      // Calculate total royalty percentage
      totalRoyaltyPercentage = movies.reduce((sum, movie) => {
        const royalty = safeParseNumber(movie.royaltyPercentage);
        return sum + (royalty > 0 ? royalty : 70); // Default 70%
      }, 0);
      
      const avgRoyaltyPercentage = totalRoyaltyPercentage / totalMovies;
      const platformFeePercentage = 100 - avgRoyaltyPercentage;
      const platformFee = (revenueAfterGatewayFee * platformFeePercentage) / 100;
      filmmmakerEarnings = revenueAfterGatewayFee - platformFee;
    }

    // Get payment history
    const payments = await Payment.findAll({
      where: {
        filmmakerId: req.user.id || req.userId,
        paymentStatus: "succeeded"
      },
      attributes: ["id", "amount", "paymentMethod", "createdAt"]
    });

    const totalSales = payments.length;

    // Get recent movies with proper numeric values
    const recentMovies = movies.slice(0, 5).map(movie => {
      const movieRevenue = safeParseNumber(movie.totalRevenue);
      const movieGatewayFee = (movieRevenue * GATEWAY_FEE_PERCENT) / 100;
      const movieRevenueAfterFee = movieRevenue - movieGatewayFee;
      
      return {
        id: movie.id,
        title: movie.title,
        views: safeParseNumber(movie.totalViews),
        revenue: parseFloat(movieRevenueAfterFee.toFixed(2)), // Revenue after 6% deduction
        grossRevenue: parseFloat(movieRevenue.toFixed(2)), // Original revenue
        rating: safeParseNumber(movie.avgRating),
        status: movie.status,
        createdAt: movie.createdAt
      };
    });

    // Calculate performance metrics with 6% deduction
    let bestPerforming = null;
    let recentlyAdded = null;
    
    if (totalMovies > 0) {
      // Find best performing by revenue (after gateway fee)
      bestPerforming = movies.reduce((best, current) => {
        const currentRevenue = safeParseNumber(current.totalRevenue);
        const bestRevenue = best ? safeParseNumber(best.totalRevenue) : 0;
        return currentRevenue > bestRevenue ? current : best;
      }, null);
      
      // Find most recently added
      const sortedByDate = [...movies].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      recentlyAdded = sortedByDate[0];
    }

    // Calculate best performing revenue after gateway fee
    let bestPerformingData = null;
    if (bestPerforming) {
      const bestRevenue = safeParseNumber(bestPerforming.totalRevenue);
      const bestGatewayFee = (bestRevenue * GATEWAY_FEE_PERCENT) / 100;
      const bestRevenueAfterFee = bestRevenue - bestGatewayFee;
      
      bestPerformingData = {
        id: bestPerforming.id,
        title: bestPerforming.title,
        revenue: parseFloat(bestRevenueAfterFee.toFixed(2)),
        views: safeParseNumber(bestPerforming.totalViews)
      };
    }

    // Calculate royalty percentage for response
    const avgRoyaltyPercentage = totalMovies > 0 
      ? totalRoyaltyPercentage / totalMovies 
      : 70;
    const platformFee = revenueAfterGatewayFee - filmmmakerEarnings;

    // APPLY 6% TO FILMMAKER BALANCE FIELDS
    const pendingBalance = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
    const pendingBalanceAfterFee = pendingBalance - (pendingBalance * GATEWAY_FEE_PERCENT / 100);
    
    const withdrawnBalance = safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance);
    const withdrawnBalanceAfterFee = withdrawnBalance - (withdrawnBalance * GATEWAY_FEE_PERCENT / 100);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: filmmaker.id,
          name: filmmaker.name,
          email: filmmaker.email
        },
        summary: {
          totalMovies,
          totalViews,
          totalSales,
          grossRevenue: parseFloat(totalRevenue.toFixed(2)), // Before gateway fee
          gatewayFee: parseFloat(gatewayFee.toFixed(2)),
          totalRevenue: parseFloat(revenueAfterGatewayFee.toFixed(2)), // After 6% deduction
          filmmmakerEarnings: parseFloat(filmmmakerEarnings.toFixed(2)),
          platformFee: parseFloat(platformFee.toFixed(2)),
          royaltyPercentage: parseFloat(avgRoyaltyPercentage.toFixed(1)),
          avgRating: parseFloat(avgRating.toFixed(1)),
        },
        finance: {
          grossPendingBalance: parseFloat(pendingBalance.toFixed(2)),
          availableBalance: parseFloat(pendingBalanceAfterFee.toFixed(2)), // After 6% deduction
          pendingBalance: parseFloat(pendingBalanceAfterFee.toFixed(2)), // After 6% deduction
          grossWithdrawnBalance: parseFloat(withdrawnBalance.toFixed(2)),
          withdrawnBalance: parseFloat(withdrawnBalanceAfterFee.toFixed(2)), // After 6% deduction
          totalEarned: parseFloat(filmmmakerEarnings.toFixed(2)),
          minimumWithdrawalAmount: safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
          canWithdraw: pendingBalanceAfterFee >= 
                       (safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100),
          payoutMethod: filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
          gatewayFeePercent: GATEWAY_FEE_PERCENT,
        },
        approval: {
          status: filmmaker.approvalStatus || "pending",
          isVerified: filmmaker.filmmmakerIsVerified || false,
          bankVerified: filmmaker.filmmmakerBankDetails?.isVerified || false,
        },
        recentMovies,
        performance: {
          bestPerforming: bestPerformingData,
          recentlyAdded: recentlyAdded ? {
            id: recentlyAdded.id,
            title: recentlyAdded.title,
            createdAt: recentlyAdded.createdAt
          } : null
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

// ====== FILMMAKER REVENUE & WITHDRAWAL MANAGEMENT ======

/**
 * Get filmmaker financial summary with 6% gateway fee deduction
 * GET /filmmaker/finance
 */
export const getFinancialSummary = async (req, res) => {
  try {
    const GATEWAY_FEE_PERCENT = 6; // 6% MTN gateway fee
    
    const filmmaker = await User.findByPk(req.user.id || req.userId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    const filmmakerId = req.user.id || req.userId;

    // Get payments with proper numeric calculations
    const payments = await Payment.findAll({
      where: { 
        filmmakerId, 
        paymentStatus: 'succeeded' 
      },
      attributes: [
        'amount',
        'paymentMethod',
      ]
    });

    // Calculate sums with 6% gateway fee deduction
    let paymentsGrossTotal = 0;
    let paymentsNetTotal = 0; // After 6% gateway fee
    let totalGatewayFees = 0;
    let paymentsFilmmakerTotal = 0;
    
    payments.forEach(payment => {
      const amount = safeParseNumber(payment.amount);
      paymentsGrossTotal += amount;
      
      // Deduct 6% gateway fee from each payment
      const gatewayFee = (amount * GATEWAY_FEE_PERCENT) / 100;
      const amountAfterGatewayFee = amount - gatewayFee;
      paymentsNetTotal += amountAfterGatewayFee;
      totalGatewayFees += gatewayFee;
      
      // Use filmmaker amount if available, otherwise use amount after gateway fee
      const filmmakerAmount = safeParseNumber(payment.filmmakerAmount);
      if (filmmakerAmount > 0) {
        const filmmakerGatewayFee = (filmmakerAmount * GATEWAY_FEE_PERCENT) / 100;
        paymentsFilmmakerTotal += (filmmakerAmount - filmmakerGatewayFee);
      } else {
        paymentsFilmmakerTotal += amountAfterGatewayFee;
      }
    });

    // Calculate average royalty from payments
    let royaltySum = 0;
    let validRoyaltyCount = 0;
    
    payments.forEach(p => {
      const royalty = safeParseNumber(p.royaltyPercentage);
      if (royalty > 0) {
        royaltySum += royalty;
        validRoyaltyCount++;
      }
    });
    
    const avgRoyaltyFromPayments = validRoyaltyCount > 0 ? royaltySum / validRoyaltyCount : 0;

    // Fallback to movie totals if payments are not available
    const movies = await Movie.findAll({
      where: { filmmakerId },
      attributes: ["totalRevenue", "royaltyPercentage"]
    });

    let moviesGrossRevenue = 0;
    let moviesRoyaltySum = 0;
    let validMovieRoyaltyCount = 0;
    
    movies.forEach(m => {
      moviesGrossRevenue += safeParseNumber(m.totalRevenue);
      const royalty = safeParseNumber(m.royaltyPercentage);
      if (royalty > 0) {
        moviesRoyaltySum += royalty;
        validMovieRoyaltyCount++;
      }
    });

    // Apply 6% gateway fee to movie revenue
    const moviesGatewayFee = (moviesGrossRevenue * GATEWAY_FEE_PERCENT) / 100;
    const moviesNetRevenue = moviesGrossRevenue - moviesGatewayFee;

    // Use payment total if available (already has gateway fee deducted), otherwise use movie total
    const grossRevenue = paymentsGrossTotal > 0 ? paymentsGrossTotal : moviesGrossRevenue;
    const totalRevenue = paymentsNetTotal > 0 ? paymentsNetTotal : moviesNetRevenue;
    const calculatedGatewayFees = paymentsGrossTotal > 0 ? totalGatewayFees : moviesGatewayFee;

    // Calculate average royalty - prefer from payments, fallback to movies
    let avgRoyalty = avgRoyaltyFromPayments;
    if (avgRoyalty === 0 && validMovieRoyaltyCount > 0) {
      avgRoyalty = moviesRoyaltySum / validMovieRoyaltyCount;
    } else if (avgRoyalty === 0) {
      avgRoyalty = 70; // Default
    }

    // Filmmaker earnings calculation (already includes gateway fee deduction)
    let filmmmakerEarnings = 0;
    if (paymentsFilmmakerTotal > 0) {
      filmmmakerEarnings = paymentsFilmmakerTotal;
    } else if (totalRevenue > 0 && avgRoyalty > 0) {
      // Calculate from royalty percentage on revenue after gateway fee
      filmmmakerEarnings = (totalRevenue * avgRoyalty) / 100;
    }

    // APPLY 6% DEDUCTION TO FILMMAKER BALANCE FIELDS
    const grossPendingBalance = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
    const pendingBalance = grossPendingBalance - (grossPendingBalance * GATEWAY_FEE_PERCENT / 100);
    
    const grossWithdrawnBalance = safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance);
    const withdrawnBalance = grossWithdrawnBalance - (grossWithdrawnBalance * GATEWAY_FEE_PERCENT / 100);
    
    const grossTotalEarned = safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned);
    const totalEarned = grossTotalEarned > 0 
      ? grossTotalEarned - (grossTotalEarned * GATEWAY_FEE_PERCENT / 100)
      : filmmmakerEarnings;
    
    const minimumWithdrawalAmount = safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100;

    // Calculate current balance after fee
    const currentBalance = pendingBalance + withdrawnBalance;

    // Calculate platform fee (on revenue after gateway fee)
    const platformFee = totalRevenue > 0 ? totalRevenue - filmmmakerEarnings : 0;

    // Format with fixed decimals
    const formatNumber = (num) => parseFloat(safeParseNumber(num).toFixed(2));
    const formatPercent = (num) => parseFloat(safeParseNumber(num).toFixed(1));

    res.status(200).json({
      success: true,
      data: {
        balance: {
          grossPendingBalance: formatNumber(grossPendingBalance),
          pendingBalance: formatNumber(pendingBalance), // After 6% deduction
          grossWithdrawnBalance: formatNumber(grossWithdrawnBalance),
          withdrawnBalance: formatNumber(withdrawnBalance), // After 6% deduction
          grossTotalEarned: formatNumber(grossTotalEarned),
          totalEarned: formatNumber(totalEarned), // After 6% deduction
          calculatedEarnings: formatNumber(filmmmakerEarnings),
          currentBalance: formatNumber(currentBalance), // After 6% deduction
          availableBalance: formatNumber(pendingBalance), // After 6% deduction
          gatewayFeePercent: GATEWAY_FEE_PERCENT,
        },
        withdrawalSettings: {
          minimumAmount: formatNumber(minimumWithdrawalAmount),
          payoutMethod: filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
          lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
          canWithdraw: pendingBalance >= minimumWithdrawalAmount,
          nextPayoutDate: filmmaker.filmmmakerFinanceNextPayoutDate,
        },
        bankDetails: filmmaker.filmmmakerBankDetails || {},
        revenueSummary: {
          grossRevenue: formatNumber(grossRevenue),
          totalMovieRevenue: formatNumber(totalRevenue), // After 6% deduction
          averageRoyalty: `${formatPercent(avgRoyalty)}%`,
          platformFee: `${formatPercent(100 - avgRoyalty)}%`,
          platformFeeAmount: formatNumber(platformFee),
          gatewayFee: `${GATEWAY_FEE_PERCENT}%`,
          totalGatewayFees: formatNumber(calculatedGatewayFees),
          estimatedMonthly: formatNumber(totalEarned / 30),
        },
        feeBreakdown: {
          grossRevenue: formatNumber(grossRevenue),
          gatewayFees: formatNumber(calculatedGatewayFees),
          revenueAfterGatewayFee: formatNumber(totalRevenue),
          platformFee: formatNumber(platformFee),
          filmmakerEarnings: formatNumber(filmmmakerEarnings),
        },
        // Debug info to verify calculations
        _debug: {
          paymentsCount: payments.length,
          paymentsGrossTotal: formatNumber(paymentsGrossTotal),
          paymentsNetTotal: formatNumber(paymentsNetTotal),
          gatewayFeePercent: GATEWAY_FEE_PERCENT,
          totalGatewayFees: formatNumber(calculatedGatewayFees),
          expectedCalculation: `Example: 4 payments of 5 each = 20 gross, ${GATEWAY_FEE_PERCENT}% fee = ${formatNumber(20 * GATEWAY_FEE_PERCENT / 100)}, net = ${formatNumber(20 - (20 * GATEWAY_FEE_PERCENT / 100))}`
        }
      }
    });
  } catch (error) {
    console.error("Error in getFinancialSummary:", error);
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
      attributes: ["id", "title", "description", "status", "totalViews", "totalRevenue", "avgRating", "totalReviews", "createdAt", "viewPrice", "downloadPrice", "currency", "filmmakerId"]
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

    // Get payment data for this movie - FIXED CALCULATION
    const payments = await Payment.findAll({
      where: {
        movieId: movieId,
        paymentStatus: "succeeded"
      },
      attributes: ["id", "amount", "paymentMethod", "userId", "createdAt"]
    });

    // FIXED: Convert each amount to number before summing
    let totalRevenue = 0;
    payments.forEach(payment => {
      totalRevenue += safeParseNumber(payment.amount);
    });
    
    const royaltyPercentage = safeParseNumber(movie.royaltyPercentage) || 70;
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

    // Calculate recent revenue properly
    let recentRevenue = 0;
    recentPayments.forEach(payment => {
      recentRevenue += safeParseNumber(payment.amount);
    });

    res.status(200).json({
      success: true,
      data: {
        movie: {
          id: movie.id,
          title: movie.title,
          description: movie.description,
          status: movie.status,
          totalViews: safeParseNumber(movie.totalViews),
          totalRevenue: safeParseNumber(movie.totalRevenue),
          avgRating: safeParseNumber(movie.avgRating),
          reviewCount: safeParseNumber(movie.totalReviews),
          createdAt: movie.createdAt,
          price: {
            viewPrice: safeParseNumber(movie.viewPrice),
            downloadPrice: safeParseNumber(movie.downloadPrice),
            currency: movie.currency
          }
        },
        revenue: {
          totalRevenue: safeParseNumber(totalRevenue).toFixed(2),
          filmmmakerShare: safeParseNumber(filmmmakerShare).toFixed(2),
          platformFee: safeParseNumber(platformFee).toFixed(2),
          royaltyPercentage,
          platformFeePercentage,
        },
        sales: {
          totalSales: payments.length,
          byPaymentMethod: paymentsByMethod,
          averageSalePrice: payments.length > 0 ? (safeParseNumber(totalRevenue) / payments.length).toFixed(2) : "0.00",
          recentSales: recentPayments.length,
          revenueTrend: recentPayments.length > 0 ? 
            (safeParseNumber(recentRevenue) / 30).toFixed(2) : "0.00"
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
/**
 * Get comprehensive filmmaker analytics
 * GET /filmmaker/analytics
 */
export const getFilmmakerAnalytics = async (req, res) => {
  try {
    const GATEWAY_FEE_PERCENT = 6; // 6% MTN gateway fee
    const filmmakerId = req.user.id || req.userId;
    const { period = '30' } = req.query; // days: 7, 30, 90, 365, or 'all'

    const filmmaker = await User.findByPk(filmmakerId);

    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({ 
        success: false,
        message: "Filmmaker not found" 
      });
    }

    // Calculate date range
    const now = new Date();
    const startDate = period === 'all' 
      ? new Date(0) // Beginning of time
      : new Date(now.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));

    // ====== GET ALL MOVIES ======
    const movies = await Movie.findAll({
      where: { filmmakerId },
      attributes: [
        "id", "title", "contentType", "status", "totalViews", 
        "totalRevenue", "avgRating", "totalReviews", "viewPrice", 
        "downloadPrice", "createdAt", "updatedAt"
      ]
    });

    // ====== GET PAYMENTS IN PERIOD ======
    const payments = await Payment.findAll({
      where: {
        filmmakerId,
        paymentStatus: "succeeded",
        createdAt: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        "id", "amount", "paymentMethod", "movieId", 
        "userId", "createdAt", "filmmakerAmount"
      ],
      order: [["createdAt", "DESC"]]
    });

    // ====== REVENUE ANALYTICS ======
    let grossRevenue = 0;
    let netRevenue = 0; // After gateway fee
    let totalGatewayFees = 0;
    let filmmakerEarnings = 0;

    payments.forEach(payment => {
      const amount = safeParseNumber(payment.amount);
      grossRevenue += amount;
      
      const gatewayFee = (amount * GATEWAY_FEE_PERCENT) / 100;
      const amountAfterFee = amount - gatewayFee;
      netRevenue += amountAfterFee;
      totalGatewayFees += gatewayFee;

      // Calculate filmmaker share
      const filmmakerAmount = safeParseNumber(payment.filmmakerAmount);
      if (filmmakerAmount > 0) {
        const fmGatewayFee = (filmmakerAmount * GATEWAY_FEE_PERCENT) / 100;
        filmmakerEarnings += (filmmakerAmount - fmGatewayFee);
      } else {
        const royalty = safeParseNumber(payment.royaltyPercentage) || 70;
        filmmakerEarnings += (amountAfterFee * royalty) / 100;
      }
    });

    // ====== VIEWS ANALYTICS ======
    const totalViews = movies.reduce((sum, movie) => 
      sum + safeParseNumber(movie.totalViews), 0
    );

    // ====== CONTENT ANALYTICS ======
    const contentByType = movies.reduce((acc, movie) => {
      const type = movie.contentType || "movie";
      if (!acc[type]) {
        acc[type] = { count: 0, views: 0, revenue: 0 };
      }
      acc[type].count++;
      acc[type].views += safeParseNumber(movie.totalViews);
      acc[type].revenue += safeParseNumber(movie.totalRevenue);
      return acc;
    }, {});

    const contentByStatus = movies.reduce((acc, movie) => {
      const status = movie.status || "unknown";
      if (!acc[status]) acc[status] = 0;
      acc[status]++;
      return acc;
    }, {});

    // ====== PAYMENT METHOD ANALYTICS ======
    const paymentsByMethod = payments.reduce((acc, payment) => {
      const method = payment.paymentMethod || "unknown";
      if (!acc[method]) {
        acc[method] = { count: 0, amount: 0 };
      }
      acc[method].count++;
      acc[method].amount += safeParseNumber(payment.amount);
      return acc;
    }, {});

    // ====== TOP PERFORMING CONTENT ======
    const topByRevenue = [...movies]
      .sort((a, b) => safeParseNumber(b.totalRevenue) - safeParseNumber(a.totalRevenue))
      .slice(0, 5)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        contentType: movie.contentType,
        revenue: safeParseNumber(movie.totalRevenue),
        views: safeParseNumber(movie.totalViews),
        rating: safeParseNumber(movie.avgRating)
      }));

    const topByViews = [...movies]
      .sort((a, b) => safeParseNumber(b.totalViews) - safeParseNumber(a.totalViews))
      .slice(0, 5)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        contentType: movie.contentType,
        views: safeParseNumber(movie.totalViews),
        revenue: safeParseNumber(movie.totalRevenue),
        rating: safeParseNumber(movie.avgRating)
      }));

    // ====== TIMELINE DATA (Daily breakdown) ======
    const timeline = {};
    payments.forEach(payment => {
      const date = new Date(payment.createdAt).toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = { sales: 0, revenue: 0, views: 0 };
      }
      timeline[date].sales++;
      timeline[date].revenue += safeParseNumber(payment.amount);
    });

    const timelineArray = Object.entries(timeline)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // ====== GROWTH METRICS ======
    const previousPeriodStart = new Date(startDate.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));
    
    const previousPayments = await Payment.findAll({
      where: {
        filmmakerId,
        paymentStatus: "succeeded",
        createdAt: {
          [Op.gte]: previousPeriodStart,
          [Op.lt]: startDate
        }
      },
      attributes: ["amount"]
    });

    let previousRevenue = 0;
    previousPayments.forEach(p => {
      previousRevenue += safeParseNumber(p.amount);
    });

    const revenueGrowth = previousRevenue > 0 
      ? ((grossRevenue - previousRevenue) / previousRevenue) * 100 
      : grossRevenue > 0 ? 100 : 0;

    const salesGrowth = previousPayments.length > 0
      ? ((payments.length - previousPayments.length) / previousPayments.length) * 100
      : payments.length > 0 ? 100 : 0;

    // ====== AVERAGE METRICS ======
    const avgRating = movies.length > 0
      ? movies.reduce((sum, m) => sum + safeParseNumber(m.avgRating), 0) / movies.length
      : 0;

    const avgRevenuePerSale = payments.length > 0
      ? grossRevenue / payments.length
      : 0;

    const avgViewsPerContent = movies.length > 0
      ? totalViews / movies.length
      : 0;

    // ====== CONVERSION METRICS ======
    const uniqueViewers = new Set(payments.map(p => p.userId)).size;
    const conversionRate = totalViews > 0 
      ? (payments.length / totalViews) * 100 
      : 0;

    // ====== RESPONSE ======
    res.status(200).json({
      success: true,
      data: {
        period: {
          days: period === 'all' ? 'all' : parseInt(period),
          startDate,
          endDate: now,
          label: period === '7' ? 'Last 7 days' :
                 period === '30' ? 'Last 30 days' :
                 period === '90' ? 'Last 90 days' :
                 period === '365' ? 'Last year' : 'All time'
        },
        summary: {
          totalContent: movies.length,
          totalViews,
          totalSales: payments.length,
          grossRevenue: parseFloat(grossRevenue.toFixed(2)),
          gatewayFees: parseFloat(totalGatewayFees.toFixed(2)),
          netRevenue: parseFloat(netRevenue.toFixed(2)),
          filmmakerEarnings: parseFloat(filmmakerEarnings.toFixed(2)),
          platformFee: parseFloat((netRevenue - filmmakerEarnings).toFixed(2)),
          avgRating: parseFloat(avgRating.toFixed(1)),
          uniqueViewers,
          conversionRate: parseFloat(conversionRate.toFixed(2))
        },
        growth: {
          revenueGrowth: parseFloat(revenueGrowth.toFixed(1)),
          salesGrowth: parseFloat(salesGrowth.toFixed(1)),
          previousPeriodRevenue: parseFloat(previousRevenue.toFixed(2)),
          previousPeriodSales: previousPayments.length
        },
        averages: {
          revenuePerSale: parseFloat(avgRevenuePerSale.toFixed(2)),
          viewsPerContent: parseFloat(avgViewsPerContent.toFixed(0)),
          salesPerDay: parseFloat((payments.length / parseInt(period || 30)).toFixed(2)),
          revenuePerDay: parseFloat((grossRevenue / parseInt(period || 30)).toFixed(2))
        },
        contentBreakdown: {
          byType: contentByType,
          byStatus: contentByStatus
        },
        paymentMethods: Object.entries(paymentsByMethod).map(([method, data]) => ({
          method,
          count: data.count,
          amount: parseFloat(data.amount.toFixed(2)),
          percentage: parseFloat((data.count / payments.length * 100).toFixed(1))
        })),
        topPerforming: {
          byRevenue: topByRevenue,
          byViews: topByViews
        },
        timeline: timelineArray,
        financialSummary: {
          grossPendingBalance: parseFloat(safeParseNumber(filmmaker.filmmmakerFinancePendingBalance).toFixed(2)),
          availableBalance: parseFloat((safeParseNumber(filmmaker.filmmmakerFinancePendingBalance) * (1 - GATEWAY_FEE_PERCENT / 100)).toFixed(2)),
          withdrawnBalance: parseFloat(safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance).toFixed(2)),
          totalEarned: parseFloat(safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned || filmmakerEarnings).toFixed(2)),
          gatewayFeePercent: GATEWAY_FEE_PERCENT
        }
      }
    });
  } catch (error) {
    console.error("Error in getFilmmakerAnalytics:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== FILMMAKER REVENUE & WITHDRAWAL MANAGEMENT ======


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
    const minimumAmount = safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100;
    if (value.amount < minimumAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ${minimumAmount}`,
        minimumAmount,
        requestedAmount: value.amount,
      });
    }

    // Check available balance
    const pendingBalance = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
    if (value.amount > pendingBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance for withdrawal",
        availableBalance: pendingBalance,
        requestedAmount: value.amount,
        difference: pendingBalance - value.amount
      });
    }

    // Create withdrawal request
    const withdrawalRequest = {
      id: `WDR-${Date.now()}`,
      amount: safeParseNumber(value.amount),
      payoutMethod: value.payoutMethod || filmmaker.filmmmakerFinancePayoutMethod,
      status: "pending",
      submittedAt: new Date(),
      estimatedTime: "3-5 business days",
      notes: value.notes
    };

    // Update the user document
    filmmaker.filmmmakerFinancePendingBalance = pendingBalance - safeParseNumber(value.amount);
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
          pendingBalance: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance),
          withdrawnBalance: safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance) + safeParseNumber(value.amount),
          totalEarned: safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned) || 0,
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

    // Get withdrawal history from user document
    const withdrawalHistory = filmmaker.filmmmakerFinanceWithdrawalHistory || [];
    
    console.log("Raw withdrawal history:", JSON.stringify(withdrawalHistory, null, 2)); // Debug log
    
    // Calculate totals
    let totalWithdrawn = 0;
    let pendingWithdrawals = 0;
    let completedWithdrawals = 0;
    let failedWithdrawals = 0;
    
    // Process each withdrawal to calculate totals
    withdrawalHistory.forEach(w => {
      const amount = safeParseNumber(w.amount);
      
      if (w.status === "completed") {
        totalWithdrawn += amount;
        completedWithdrawals++;
      } else if (w.status === "pending") {
        pendingWithdrawals++;
      } else if (w.status === "failed" || w.status === "rejected") {
        failedWithdrawals++;
      }
    });

    // Sort withdrawals by date (most recent first)
    const sortedHistory = withdrawalHistory.sort((a, b) => {
      const dateA = new Date(a.submittedAt || a.createdAt || a.date || 0);
      const dateB = new Date(b.submittedAt || b.createdAt || b.date || 0);
      return dateB - dateA;
    });

    // Format the withdrawal history for response
    const formattedHistory = sortedHistory.map((withdrawal, index) => ({
      id: withdrawal.id || `WDR-${index + 1}`,
      transactionId: withdrawal.transactionId || withdrawal.id || `WDR-${Date.now()}-${index}`,
      amount: safeParseNumber(withdrawal.amount),
      status: withdrawal.status || "pending",
      payoutMethod: withdrawal.payoutMethod || filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
      submittedAt: withdrawal.submittedAt || withdrawal.createdAt || withdrawal.date,
      estimatedTime: withdrawal.estimatedTime || "3-5 business days",
      completedAt: withdrawal.completedAt,
      notes: withdrawal.notes,
      adminNotes: withdrawal.adminNotes,
      referenceNumber: withdrawal.referenceNumber,
      // Add method-specific details
      methodDetails: withdrawal.payoutMethod === "momo" 
        ? { phoneNumber: withdrawal.phoneNumber }
        : withdrawal.payoutMethod === "bank_transfer"
        ? { 
            bankName: withdrawal.bankName,
            accountNumber: withdrawal.accountNumber ? `••••${withdrawal.accountNumber.slice(-4)}` : null
          }
        : null
    }));

    // Get recent withdrawals (last 10)
    const recentWithdrawals = formattedHistory.slice(0, 10);

    // Calculate withdrawal stats
    const totalWithdrawalsCount = withdrawalHistory.length;
    const successRate = totalWithdrawalsCount > 0 
      ? (completedWithdrawals / totalWithdrawalsCount) * 100 
      : 0;

    // Calculate average withdrawal amount
    const completedWithdrawalsList = withdrawalHistory.filter(w => w.status === "completed");
    const avgWithdrawalAmount = completedWithdrawalsList.length > 0
      ? completedWithdrawalsList.reduce((sum, w) => sum + safeParseNumber(w.amount), 0) / completedWithdrawalsList.length
      : 0;

    // Get last withdrawal
    const lastWithdrawal = withdrawalHistory.length > 0
      ? formattedHistory[0]
      : null;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalWithdrawn: safeParseNumber(totalWithdrawn).toFixed(2),
          totalWithdrawals: totalWithdrawalsCount,
          pendingWithdrawals,
          completedWithdrawals,
          failedWithdrawals,
          successRate: safeParseNumber(successRate).toFixed(1),
          averageWithdrawal: safeParseNumber(avgWithdrawalAmount).toFixed(2),
          lastWithdrawal: lastWithdrawal ? {
            amount: lastWithdrawal.amount,
            status: lastWithdrawal.status,
            date: lastWithdrawal.submittedAt
          } : null
        },
        currentBalance: {
          pendingBalance: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance),
          withdrawnBalance: safeParseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance),
          totalEarned: safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned || 0),
          availableBalance: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance), // Available for withdrawal
          minimumWithdrawalAmount: safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
          canWithdraw: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance) >= 
                      (safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100)
        },
        withdrawalSettings: {
          payoutMethod: filmmaker.filmmmakerFinancePayoutMethod || "bank_transfer",
          lastWithdrawalDate: filmmaker.filmmmakerFinanceLastWithdrawalDate,
          nextPayoutDate: filmmaker.filmmmakerFinanceNextPayoutDate,
          autoWithdrawalEnabled: filmmaker.filmmmakerFinanceAutoWithdrawal || false,
          withdrawalThreshold: filmmaker.filmmmakerFinanceWithdrawalThreshold || 100
        },
        withdrawalHistory: formattedHistory,
        recentWithdrawals,
        // If you want to support pagination in the future
        pagination: {
          total: formattedHistory.length,
          page: 1,
          limit: 50,
          pages: 1
        }
      }
    });
  } catch (error) {
    console.error("Error in getWithdrawalHistory:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ====== FILMMAKER MOVIE MANAGEMENT ======

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
        totalViews: safeParseNumber(item.totalViews),
        videoDuration: safeParseNumber(item.videoDuration),
        totalRevenue: safeParseNumber(item.totalRevenue),
        avgRating: safeParseNumber(item.avgRating),
        totalReviews: safeParseNumber(item.totalReviews),
        createdAt: item.createdAt,
        viewPrice: safeParseNumber(item.viewPrice),
        downloadPrice: safeParseNumber(item.downloadPrice),
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
      updateData.price = safeParseNumber(req.body.viewPrice);
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

    // Calculate totals - FIXED
    const totalMovies = movies.reduce((sum, m) => sum + safeParseNumber(m.dataValues.count), 0);
    
    let totalViews = 0;
    let totalRevenue = 0;
    let totalRating = 0;
    let validRatingsCount = 0;
    
    movies.forEach(m => {
      totalViews += safeParseNumber(m.dataValues.totalViews);
      totalRevenue += safeParseNumber(m.dataValues.totalRevenue);
      
      const rating = safeParseNumber(m.dataValues.avgRating);
      if (!isNaN(rating)) {
        totalRating += rating;
        validRatingsCount++;
      }
    });
    
    const avgRating = validRatingsCount > 0 ? totalRating / validRatingsCount : 0;

    // Get payment statistics - FIXED
    const payments = await Payment.findAll({
      where: {
        filmmakerId: req.user.id || req.userId,
        paymentStatus: "succeeded"
      }
    });

    let totalAmount = 0;
    payments.forEach(payment => {
      totalAmount += safeParseNumber(payment.amount);
    });

    const totalSales = payments.length;

    res.status(200).json({
      success: true,
      data: {
        totalMovies,
        totalViews,
        totalRevenue: safeParseNumber(totalRevenue).toFixed(2),
        totalSales,
        filmmmakerEarnings: safeParseNumber(totalAmount).toFixed(2),
        averageRating: safeParseNumber(avgRating).toFixed(1),
        byContentType: movies.reduce((acc, m) => {
          const type = m.contentType || "movie";
          if (!acc[type]) acc[type] = 0;
          acc[type] += safeParseNumber(m.dataValues.count);
          return acc;
        }, {}),
        byStatus: movies.reduce((acc, m) => {
          const status = m.status || "unknown";
          if (!acc[status]) acc[status] = 0;
          acc[status] += safeParseNumber(m.dataValues.count);
          return acc;
        }, {}),
        // Debug info
        _debug: {
          paymentsCount: payments.length,
          expectedCalculation: "4 payments of '5' each should equal 20"
        }
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
          pendingBalance: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance),
          totalEarned: safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned) || 0,
          minimumWithdrawalAmount: safeParseNumber(filmmaker.filmmmakerFinanceMinimumWithdrawalAmount) || 100,
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
}


/**
 * Get all filmmaker notifications (activity feed)
 * GET /filmmaker/notifications
 */
export const getFilmmmakerNotifications = async (req, res) => {
  try {
    const filmmakerId = req.user.id || req.userId;

    const filmmaker = await User.findByPk(filmmakerId);
    if (!filmmaker || filmmaker.role !== "filmmaker") {
      return res.status(404).json({
        success: false,
        message: "Filmmaker not found",
      });
    }

    const notifications = [];

    /* =========================
       MOVIE & SERIES ACTIVITIES
    ========================== */
    const movies = await Movie.findAll({
      where: { filmmakerId },
      attributes: [
        "id",
        "title",
        "status",
        "contentType",
        "createdAt",
        "updatedAt",
        "totalRevenue",
        "totalViews",
      ],
      order: [["updatedAt", "DESC"]],
    });

    movies.forEach((movie) => {
      // Upload / creation
      notifications.push({
        type: "content",
        action: "created",
        title: movie.title,
        message: `${movie.contentType === "series" ? "Series" : "Movie"} "${movie.title}" was created`,
        date: movie.createdAt,
        referenceId: movie.id,
      });

      // Approval status changes
      if (movie.status === "approved") {
        notifications.push({
          type: "content",
          action: "approved",
          title: movie.title,
          message: `"${movie.title}" has been approved and is now live`,
          date: movie.updatedAt,
          referenceId: movie.id,
        });
      }

      if (movie.status === "rejected") {
        notifications.push({
          type: "content",
          action: "rejected",
          title: movie.title,
          message: `"${movie.title}" was rejected. Please review and resubmit`,
          date: movie.updatedAt,
          referenceId: movie.id,
        });
      }
    });

    /* =========================
       PAYMENT / SALES ACTIVITIES
    ========================== */
    const payments = await Payment.findAll({
      where: {
        filmmakerId,
        paymentStatus: "succeeded",
      },
      attributes: [
        "id",
        "amount",
        "movieId",
        "paymentMethod",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    payments.forEach((payment) => {
      notifications.push({
        type: "payment",
        action: "sale",
        title: "New Sale",
        message: `You earned ${safeParseNumber(payment.amount).toFixed(2)} from a movie purchase`,
        date: payment.createdAt,
        referenceId: payment.id,
        meta: {
          paymentMethod: payment.paymentMethod,
          movieId: payment.movieId,
        },
      });
    });

    /* =========================
       WITHDRAWAL ACTIVITIES
    ========================== */
    const withdrawals = filmmaker.filmmmakerFinanceWithdrawalHistory || [];

    withdrawals.forEach((w) => {
      notifications.push({
        type: "withdrawal",
        action: w.status,
        title: "Withdrawal Update",
        message:
          w.status === "pending"
            ? `Withdrawal request of ${safeParseNumber(w.amount).toFixed(2)} is pending`
            : w.status === "completed"
            ? `Withdrawal of ${safeParseNumber(w.amount).toFixed(2)} completed successfully`
            : `Withdrawal of ${safeParseNumber(w.amount).toFixed(2)} was rejected`,
        date: w.submittedAt || w.updatedAt || new Date(),
        referenceId: w.id,
      });
    });

    /* =========================
       VERIFICATION & APPROVAL
    ========================== */
    if (filmmaker.filmmmakerIsVerified) {
      notifications.push({
        type: "verification",
        action: "verified",
        title: "Account Verified",
        message: "Your filmmaker account has been verified",
        date: filmmaker.updatedAt,
      });
    }

    if (filmmaker.filmmmakerBankDetails?.isVerified) {
      notifications.push({
        type: "verification",
        action: "bank_verified",
        title: "Bank Details Verified",
        message: "Your bank details have been verified and approved",
        date: filmmaker.filmmmakerBankDetails.verifiedAt || filmmaker.updatedAt,
      });
    }

    if (filmmaker.approvalStatus === "approved") {
      notifications.push({
        type: "approval",
        action: "approved",
        title: "Account Approved",
        message: "Your filmmaker account has been approved by admin",
        date: filmmaker.updatedAt,
      });
    }

    /* =========================
       SORT & PAGINATE
    ========================== */
    notifications.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.status(200).json({
      success: true,
      data: {
        total: notifications.length,
        notifications,
      },
    });
  } catch (error) {
    console.error("Error in getFilmmmakerNotificationsAllActivities:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
