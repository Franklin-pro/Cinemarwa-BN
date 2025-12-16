import User from "../models/User.modal.js";
import Movie from "../models/Movie.model.js";
import Payment from "../models/Payment.model.js";
import Review from "../models/Review.model.js";
import Joi from "joi";
import { Op } from "sequelize";

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

// ====== HELPER FUNCTION ======
const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
};

// ====== ADMIN DASHBOARD & ANALYTICS ======

// Replace your getAdminDashboard function with this FIXED version:
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


    // Get payment statistics - FIXED HERE
    const payments = await Payment.findAll({ 
      where: { paymentStatus: "succeeded" } 
    });

    payments.forEach((p, i) => {

    });
    
    // FIXED CALCULATION: Force convert EVERY amount to number
    let totalRevenue = 0;
    
    payments.forEach(payment => {
      let amountValue = payment.amount;
      
      // Force conversion to number
      if (amountValue === null || amountValue === undefined) {
        amountValue = 0;
      } else if (typeof amountValue === 'string') {
        // Remove any non-numeric characters except decimal point
        const cleaned = amountValue.replace(/[^0-9.]/g, '');
        amountValue = parseFloat(cleaned) || 0;
      } else if (typeof amountValue === 'number') {
        // Already a number, keep it
      } else {
        // For any other type (object, boolean, etc.), try to convert
        amountValue = Number(amountValue) || 0;
      }
      totalRevenue += amountValue;
    });

    
    const totalTransactions = payments.length;
    const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const platformEarnings = totalRevenue * 0.3;

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
        averageTransaction: avgTransaction.toFixed(2),
        platformEarnings: platformEarnings.toFixed(2), // 30% platform fee
        // Add debug info to response
        _debug: {
          expected: "4 payments of 5 each = 20",
          actual: totalRevenue,
          paymentCount: payments.length
        }
      },
      alerts: {
        pendingFilmmakers,
        pendingMovies,
        blockedUsers,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add this function after getDetailedAnalytics function

/**
 * Get filmmaker performance analytics
 * GET /admin/filmmakers/performance
 */

// Helper function to generate timeline data
function generateTimelineData(filmmakerId, payments, movies, period) {
  const timeline = [];
  const now = new Date();
  let intervals;
  
  switch(period) {
    case 'day':
      intervals = 24; // hours
      break;
    case 'week':
      intervals = 7; // days
      break;
    case 'month':
      intervals = 30; // days
      break;
    case 'quarter':
      intervals = 12; // weeks
      break;
    case 'year':
      intervals = 12; // months
      break;
    default:
      intervals = 30; // days
  }
  
  for (let i = intervals - 1; i >= 0; i--) {
    let startTime, endTime, label;
    
    switch(period) {
      case 'day':
        startTime = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
        endTime = new Date(now.getTime() - i * 60 * 60 * 1000);
        label = `${startTime.getHours()}:00`;
        break;
      case 'week':
        startTime = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
        endTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        label = startTime.toLocaleDateString('en-US', { weekday: 'short' });
        break;
      case 'month':
        startTime = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
        endTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        label = startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      case 'quarter':
        startTime = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        endTime = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        label = `Week ${Math.floor(i / 7) + 1}`;
        break;
      case 'year':
        startTime = new Date(now.getFullYear(), i, 1);
        endTime = new Date(now.getFullYear(), i + 1, 0);
        label = startTime.toLocaleDateString('en-US', { month: 'short' });
        break;
    }
    
    // Filter payments and movies for this interval
    const intervalPayments = payments.filter(p => 
      p.filmmakerId === filmmakerId && 
      new Date(p.createdAt) >= startTime && 
      new Date(p.createdAt) < endTime
    );
    
    const intervalMovies = movies.filter(m => 
      m.filmmakerId === filmmakerId && 
      new Date(m.createdAt) >= startTime && 
      new Date(m.createdAt) < endTime
    );
    
    // Calculate metrics for this interval
    const revenue = intervalPayments.reduce((sum, p) => sum + parseNumber(p.amount), 0);
    const views = intervalMovies.reduce((sum, m) => sum + parseNumber(m.totalViews), 0);
    
    timeline.push({
      period: label,
      revenue: revenue.toFixed(2),
      views: views,
      movies: intervalMovies.length,
      earnings: (revenue * 0.7 * 0.94).toFixed(2), // 70% after 6% gateway fee
    });
  }
  
  return timeline;
}

// Helper function to get performance distribution
function getPerformanceDistribution(performanceData) {
  const distribution = {
    excellent: 0, // 80-100
    good: 0,      // 60-79
    average: 0,   // 40-59
    poor: 0,      // 20-39
    veryPoor: 0,  // 0-19
  };
  
  performanceData.forEach(filmmaker => {
    const score = parseNumber(filmmaker.overall.performanceScore);
    
    if (score >= 80) distribution.excellent++;
    else if (score >= 60) distribution.good++;
    else if (score >= 40) distribution.average++;
    else if (score >= 20) distribution.poor++;
    else distribution.veryPoor++;
  });
  
  return distribution;
}

// Helper function to get revenue breakdown
function getRevenueBreakdown(performanceData) {
  const breakdown = {
    top10: 0,
    middle30: 0,
    bottom60: 0,
  };
  
  if (performanceData.length === 0) return breakdown;
  
  // Sort by revenue
  const sortedByRevenue = [...performanceData].sort((a, b) => 
    parseNumber(b.period.revenue) - parseNumber(a.period.revenue)
  );
  
  const top10Count = Math.ceil(sortedByRevenue.length * 0.1);
  const middle30Count = Math.ceil(sortedByRevenue.length * 0.3);
  
  for (let i = 0; i < sortedByRevenue.length; i++) {
    const revenue = parseNumber(sortedByRevenue[i].period.revenue);
    
    if (i < top10Count) {
      breakdown.top10 += revenue;
    } else if (i < top10Count + middle30Count) {
      breakdown.middle30 += revenue;
    } else {
      breakdown.bottom60 += revenue;
    }
  }
  
  return breakdown;
}

// Helper function to get growth trend
function getGrowthTrend(performanceData, period) {
  const trend = [];
  const periods = period === 'year' ? 12 : 6;
  
  for (let i = 0; i < periods; i++) {
    // Simulate growth data - in real app, you'd calculate actual growth
    const baseGrowth = 100;
    const randomGrowth = Math.random() * 50;
    const totalGrowth = baseGrowth + randomGrowth;
    
    trend.push({
      period: i + 1,
      growth: totalGrowth.toFixed(1),
      revenue: (baseGrowth * (1 + i * 0.2)).toFixed(2),
      filmmakers: Math.floor(performanceData.length * (0.8 + Math.random() * 0.4)),
    });
  }
  
  return trend;
}

export const getFilmmakersPerformance = async (req, res) => {
  try {
    const { 
      period = "month", 
      sortBy = "revenue", 
      limit = 10,
      status 
    } = req.query;

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
      case "quarter":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build where clause
    let where = { role: "filmmaker" };
    if (status) where.approvalStatus = status;

    // Get all filmmakers
    const filmmakers = await User.findAll({
      where,
      attributes: [
        'id', 'name', 'email', 'filmmmakerIsVerified', 'approvalStatus', 
        'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue', 
        'filmmmakerStatsTotalViews', 'filmmmakerStatsTotalDownloads',
        'filmmmakerStatsAverageRating', 'filmmmakerStatsTotalReviews',
        'filmmmakerFinancePendingBalance', 'filmmmakerFinanceWithdrawnBalance',
        'filmmmakerFinanceTotalEarned', 'createdAt'
      ]
    });

    // Get payments for the period
    const periodPayments = await Payment.findAll({
      where: {
        paymentDate: { [Op.gte]: startDate },
        paymentStatus: "succeeded",
      },
      attributes: ['id', 'amount', 'movieId', 'filmmakerId', 'createdAt'],
      include: [
        {
          model: Movie,
          as: 'movie',
          attributes: ['title', 'filmmakerId']
        }
      ]
    });

    // Get movies for the period
    const periodMovies = await Movie.findAll({
      where: {
        createdAt: { [Op.gte]: startDate },
        status: "approved"
      },
      attributes: ['id', 'title', 'filmmakerId', 'totalViews', 'totalRevenue', 'avgRating']
    });

    // Process performance data for each filmmaker
    const performanceData = filmmakers.map(filmmaker => {
      const filmmakerId = filmmaker.id;
      
      // Filter payments for this filmmaker
      const filmmakerPayments = periodPayments.filter(p => 
        p.filmmakerId === filmmakerId || p.movie?.filmmakerId === filmmakerId
      );
      
      // Filter movies for this filmmaker
      const filmmakerMovies = periodMovies.filter(m => 
        m.filmmakerId === filmmakerId
      );
      
      // Calculate period metrics
      let periodRevenue = 0;
      let periodViews = 0;
      let periodEarnings = 0;
      
      filmmakerPayments.forEach(payment => {
        periodRevenue += parseNumber(payment.amount);
      });
      
      filmmakerMovies.forEach(movie => {
        periodViews += parseNumber(movie.totalViews);
      });
      
      // Calculate earnings (70% of revenue after 6% gateway fee)
      const gatewayFee = periodRevenue * 0.06;
      const revenueAfterGateway = periodRevenue - gatewayFee;
      periodEarnings = revenueAfterGateway * 0.7;
      
      // Calculate overall metrics from filmmaker stats
      const totalMovies = parseNumber(filmmaker.filmmmakerStatsTotalMovies) || 0;
      const totalViews = parseNumber(filmmaker.filmmmakerStatsTotalViews) || 0;
      const totalRevenue = parseNumber(filmmaker.filmmmakerStatsTotalRevenue) || 0;
      const totalEarned = parseNumber(filmmaker.filmmmakerFinanceTotalEarned) || 0;
      const avgRating = parseNumber(filmmaker.filmmmakerStatsAverageRating) || 0;
      const pendingBalance = parseNumber(filmmaker.filmmmakerFinancePendingBalance) || 0;
      const withdrawnBalance = parseNumber(filmmaker.filmmmakerFinanceWithdrawnBalance) || 0;
      
      // Calculate growth metrics
      const daysSinceJoined = Math.floor((now - new Date(filmmaker.createdAt)) / (1000 * 60 * 60 * 24));
      const avgDailyViews = daysSinceJoined > 0 ? totalViews / daysSinceJoined : 0;
      const avgDailyRevenue = daysSinceJoined > 0 ? totalRevenue / daysSinceJoined : 0;
      const avgDailyEarnings = daysSinceJoined > 0 ? totalEarned / daysSinceJoined : 0;
      
      // Calculate performance score (0-100)
      let performanceScore = 0;
      
      // Revenue weight: 40%
      const revenueScore = Math.min((totalRevenue / 10000) * 100, 40);
      
      // Views weight: 30%
      const viewsScore = Math.min((totalViews / 100000) * 100, 30);
      
      // Rating weight: 20%
      const ratingScore = avgRating * 4; // Convert 5-star to 20 points
      
      // Consistency weight: 10% (based on number of movies)
      const consistencyScore = Math.min((totalMovies / 10) * 100, 10);
      
      performanceScore = revenueScore + viewsScore + ratingScore + consistencyScore;
      
      return {
        id: filmmaker.id,
        name: filmmaker.name,
        email: filmmaker.email,
        status: filmmaker.approvalStatus,
        isVerified: filmmaker.filmmmakerIsVerified || false,
        
        // Overall metrics
        overall: {
          totalMovies,
          totalViews,
          totalRevenue: totalRevenue.toFixed(2),
          totalEarned: totalEarned.toFixed(2),
          avgRating: avgRating.toFixed(1),
          pendingBalance: pendingBalance.toFixed(2),
          withdrawnBalance: withdrawnBalance.toFixed(2),
          totalBalance: (pendingBalance + withdrawnBalance).toFixed(2),
          performanceScore: Math.min(performanceScore, 100).toFixed(1),
        },
        
        // Period metrics
        period: {
          revenue: periodRevenue.toFixed(2),
          views: periodViews,
          earnings: periodEarnings.toFixed(2),
          moviesAdded: filmmakerMovies.length,
          avgMovieRating: filmmakerMovies.length > 0 
            ? (filmmakerMovies.reduce((sum, m) => sum + parseNumber(m.avgRating), 0) / filmmakerMovies.length).toFixed(1)
            : "0.0",
          growthRate: totalRevenue > 0 
            ? ((periodRevenue / totalRevenue) * 100).toFixed(1)
            : "0.0",
        },
        
        // Efficiency metrics
        efficiency: {
          avgDailyViews: avgDailyViews.toFixed(1),
          avgDailyRevenue: avgDailyRevenue.toFixed(2),
          avgDailyEarnings: avgDailyEarnings.toFixed(2),
          revenuePerView: totalViews > 0 ? (totalRevenue / totalViews).toFixed(4) : "0.0000",
          earningsPerMovie: totalMovies > 0 ? (totalEarned / totalMovies).toFixed(2) : "0.00",
          viewsPerMovie: totalMovies > 0 ? (totalViews / totalMovies).toFixed(1) : "0.0",
        },
        
        // Recent movies
        recentMovies: filmmakerMovies.slice(0, 5).map(movie => ({
          id: movie.id,
          title: movie.title,
          views: parseNumber(movie.totalViews),
          revenue: parseNumber(movie.totalRevenue),
          rating: parseNumber(movie.avgRating),
        })),
        
        // Timeline data (last 6 periods for charts)
        timeline: generateTimelineData(filmmakerId, periodPayments, periodMovies, period),
        
        // Status indicators
        indicators: {
          hasLowRating: avgRating < 3,
          hasHighRevenue: periodRevenue > 1000,
          hasManyViews: periodViews > 10000,
          needsAttention: filmmaker.approvalStatus === "pending" || avgRating < 2,
          isTopPerformer: performanceScore > 70,
        }
      };
    });

    // Sort by selected metric
    const sortedData = performanceData.sort((a, b) => {
      switch(sortBy) {
        case 'revenue':
          return parseNumber(b.period.revenue) - parseNumber(a.period.revenue);
        case 'views':
          return b.period.views - a.period.views;
        case 'earnings':
          return parseNumber(b.period.earnings) - parseNumber(a.period.earnings);
        case 'performance':
          return parseNumber(b.overall.performanceScore) - parseNumber(a.overall.performanceScore);
        case 'rating':
          return parseNumber(b.overall.avgRating) - parseNumber(a.overall.avgRating);
        default:
          return parseNumber(b.period.revenue) - parseNumber(a.period.revenue);
      }
    });

    // Apply limit
    const limitedData = sortedData.slice(0, parseInt(limit) || 10);

    // Calculate summary statistics
    const summary = {
      totalFilmmakers: performanceData.length,
      activeFilmmakers: performanceData.filter(f => f.status === "approved").length,
      totalPeriodRevenue: performanceData.reduce((sum, f) => sum + parseNumber(f.period.revenue), 0).toFixed(2),
      totalPeriodEarnings: performanceData.reduce((sum, f) => sum + parseNumber(f.period.earnings), 0).toFixed(2),
      averagePerformanceScore: (performanceData.reduce((sum, f) => sum + parseNumber(f.overall.performanceScore), 0) / performanceData.length).toFixed(1),
      topPerformer: sortedData.length > 0 ? {
        name: sortedData[0].name,
        performanceScore: sortedData[0].overall.performanceScore,
        periodRevenue: sortedData[0].period.revenue,
      } : null,
      needsAttention: performanceData.filter(f => f.indicators.needsAttention).length,
    };

    res.status(200).json({
      success: true,
      period,
      dateRange: { start: startDate, end: now },
      summary,
      performanceData: limitedData,
      pagination: {
        total: performanceData.length,
        limit: parseInt(limit) || 10,
        showing: limitedData.length,
        sortBy,
      },
      // For charts
      chartData: {
        performanceDistribution: getPerformanceDistribution(performanceData),
        revenueBreakdown: getRevenueBreakdown(limitedData),
        growthTrend: getGrowthTrend(performanceData, period),
      }
    });
  } catch (error) {
    console.error("Error in getFilmmakersPerformance:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
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
    
    // CORRECT CALCULATION: Parse each amount to number
    let periodRevenue = 0;
    periodPayments.forEach(payment => {
      periodRevenue += parseNumber(payment.amount);
    });

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
        platformEarnings: (periodRevenue * 0.3).toFixed(2),
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
      attributes: ['id','name', 'email', 'filmmmakerIsVerified', 'approvalStatus', 'filmmmakerStatsTotalMovies', 'filmmmakerStatsTotalRevenue', 'createdAt', 'rejectionReason']
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
      include: [
        {
          association: 'filmmaker',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
      attributes: [
        'id',
        'title',
        'description',
        'avgRating',
        'totalReviews',
        'status',
        'uploadedAt',
        'release_date',
        'videoDuration'
      ]
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

    // Low-rated movies
    const flaggedMovies =
      type === "all" || type === "movies"
        ? await Movie.findAll({
            where: { avgRating: { [Op.lt]: 3 } },
            attributes: ["title", "avgRating", "totalReviews", "status"],
            order: [["avgRating", "ASC"]],
            offset: skip,
            limit: limitNum,
          })
        : [];

    // Negative reviews
    const flaggedReviews =
      type === "all" || type === "reviews"
        ? await Review.findAll({
            where: { rating: { [Op.lt]: 2 } },
            attributes: ["comment", "rating"],
            include: [
              {
                association: "movie",
                attributes: ["title"],
              },
            ],
            order: [["rating", "ASC"]],
            offset: skip,
            limit: limitNum,
          })
        : [];

    res.status(200).json({
      flaggedMovies,
      flaggedReviews,
      totalFlagged:
        (flaggedMovies?.length || 0) + (flaggedReviews?.length || 0),
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

    const now = new Date();
    let startDate;

    switch (period) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const payments = await Payment.findAll({
      where: {
        paymentDate: { [Op.gte]: startDate },
        paymentStatus: "succeeded",
      },
      include: [
        {
          model: Movie,
          as: "movie",
          attributes: ["id", "title", "filmmakerId"],
          include: [
            {
              model: User,
              as: "filmmaker",
              attributes: ["id", "name", "email"],
            },
          ],
        },
      ],
    });

    let grossRevenue = 0;
    let totalMtnFees = 0;
    let netRevenue = 0;
    let totalPlatformEarnings = 0;
    const filmmakerPayouts = {};

    payments.forEach((payment) => {
      const grossAmount = parseNumber(payment.amount);

      const mtnFee = grossAmount * 0.06;
      const netAmount = grossAmount - mtnFee;

      const platformShare = netAmount * 0.3;
      const filmmakerShare = netAmount * 0.7;

      grossRevenue += grossAmount;
      totalMtnFees += mtnFee;
      netRevenue += netAmount;
      totalPlatformEarnings += platformShare;

      const filmmakerId = payment.movie?.filmmakerId;
      if (filmmakerId) {
        filmmakerPayouts[filmmakerId] =
          (filmmakerPayouts[filmmakerId] || 0) + filmmakerShare;
      }
    });

    res.status(200).json({
      period,
      dateRange: { start: startDate, end: now },

      grossRevenue: grossRevenue.toFixed(2),
      mtnGatewayFees: totalMtnFees.toFixed(2),
      netRevenue: netRevenue.toFixed(2), // ✅ real amount after 6%

      platformEarnings: totalPlatformEarnings.toFixed(2),

      filmmakerPayouts: Object.entries(filmmakerPayouts).map(
        ([filmmakerId, amount]) => ({
          filmmakerId,
          payoutAmount: amount.toFixed(2),
        })
      ),

      transactionCount: payments.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


/**
 * Get recent activities across the platform - FIXED VERSION
 * GET /admin/recent-activities
 */
export const recentAdminActivities = async (req, res) => {
  try {
    const { period = "week", limit = 50, type = "all" } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case "today":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get limit
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    // Collect activities from different sources
    const activities = [];

    // 1. User Activities (Signups, logins, etc.)
    if (type === "all" || type === "user") {
      const recentUsers = await User.findAll({
        where: {
          createdAt: { [Op.gte]: startDate }
        },
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'name', 'email', 'role', 'createdAt']
      });

      recentUsers.forEach(user => {
        activities.push({
          id: `user_${user.id}`,
          type: 'signup',
          description: `${user.name} (${user.email}) signed up as ${user.role}`,
          user: user.name,
          userEmail: user.email,
          userId: user.id,
          timestamp: user.createdAt,
          metadata: {
            role: user.role,
            source: 'user_registration'
          }
        });
      });
    }

    // 2. Movie Activities (Uploads, approvals, etc.)
    if (type === "all" || type === "movie") {
      const recentMovies = await Movie.findAll({
        where: {
          createdAt: { [Op.gte]: startDate }
        },
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'title', 'status', 'createdAt', 'filmmakerId']
      });

      // Get filmmaker info for these movies
      const filmmakerIds = [...new Set(recentMovies.map(movie => movie.filmmakerId).filter(Boolean))];
      let filmmakers = [];
      
      if (filmmakerIds.length > 0) {
        filmmakers = await User.findAll({
          where: {
            id: filmmakerIds
          },
          attributes: ['id', 'name', 'email']
        });
      }

      const filmmakerMap = filmmakers.reduce((map, filmmaker) => {
        map[filmmaker.id] = filmmaker;
        return map;
      }, {});

      recentMovies.forEach(movie => {
        const filmmaker = filmmakerMap[movie.filmmakerId];
        
        // Movie upload activity
        activities.push({
          id: `movie_upload_${movie.id}`,
          type: 'movie_upload',
          description: `Movie "${movie.title}" uploaded by ${filmmaker?.name || 'Unknown'}`,
          user: filmmaker?.name,
          userEmail: filmmaker?.email,
          userId: filmmaker?.id,
          timestamp: movie.createdAt,
          metadata: {
            movieId: movie.id,
            movieTitle: movie.title,
            status: movie.status
          }
        });

        // Movie approval activity (if approved)
        if (movie.status === 'approved' && movie.approvedAt) {
          activities.push({
            id: `movie_approval_${movie.id}`,
            type: 'approval',
            description: `Movie "${movie.title}" approved`,
            user: 'Admin',
            timestamp: movie.approvedAt,
            metadata: {
              movieId: movie.id,
              movieTitle: movie.title
            }
          });
        }
      });
    }

    // 3. Payment Activities - FIXED VERSION
    if (type === "all" || type === "payment") {
      const recentPayments = await Payment.findAll({
        where: {
          paymentDate: { [Op.gte]: startDate },
          paymentStatus: "succeeded"
        },
        order: [['paymentDate', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'amount', 'paymentMethod', 'paymentDate', 'paymentStatus', 'userId', 'movieId']
      });

      // Get user info for payments
      const userIds = [...new Set(recentPayments.map(payment => payment.userId).filter(Boolean))];
      let users = [];
      
      if (userIds.length > 0) {
        users = await User.findAll({
          where: {
            id: userIds
          },
          attributes: ['id', 'name', 'email']
        });
      }

      // Get movie info for payments
      const movieIds = [...new Set(recentPayments.map(payment => payment.movieId).filter(Boolean))];
      let movies = [];
      
      if (movieIds.length > 0) {
        movies = await Movie.findAll({
          where: {
            id: movieIds
          },
          attributes: ['id', 'title', 'filmmakerId']
        });
      }

      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      const movieMap = movies.reduce((map, movie) => {
        map[movie.id] = movie;
        return map;
      }, {});

      // Get filmmaker info for movies
      const filmmakerIds = [...new Set(movies.map(movie => movie.filmmakerId).filter(Boolean))];
      let filmmakers = [];
      
      if (filmmakerIds.length > 0) {
        filmmakers = await User.findAll({
          where: {
            id: filmmakerIds
          },
          attributes: ['id', 'name', 'email']
        });
      }

      const filmmakerMap = filmmakers.reduce((map, filmmaker) => {
        map[filmmaker.id] = filmmaker;
        return map;
      }, {});

      recentPayments.forEach(payment => {
        const user = userMap[payment.userId];
        const movie = movieMap[payment.movieId];
        const filmmaker = movie ? filmmakerMap[movie.filmmakerId] : null;
        
        activities.push({
          id: `payment_${payment.id}`,
          type: 'payment',
          description: `Payment of RWF ${parseNumber(payment.amount).toFixed(2)} for "${movie?.title || 'Unknown Movie'}"`,
          user: user?.name,
          userEmail: user?.email,
          userId: user?.id,
          timestamp: payment.paymentDate,
          metadata: {
            paymentId: payment.id,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            movieId: payment.movieId,
            filmmakerId: movie?.filmmakerId
          }
        });
      });
    }

    // 4. Review Activities - FIXED VERSION
    if (type === "all" || type === "review") {
      const recentReviews = await Review.findAll({
        where: {
          createdAt: { [Op.gte]: startDate }
        },
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'rating', 'comment', 'createdAt', 'userId', 'movieId']
      });

      // Get user info for reviews
      const userIds = [...new Set(recentReviews.map(review => review.userId).filter(Boolean))];
      let users = [];
      
      if (userIds.length > 0) {
        users = await User.findAll({
          where: {
            id: userIds
          },
          attributes: ['id', 'name', 'email']
        });
      }

      // Get movie info for reviews
      const movieIds = [...new Set(recentReviews.map(review => review.movieId).filter(Boolean))];
      let movies = [];
      
      if (movieIds.length > 0) {
        movies = await Movie.findAll({
          where: {
            id: movieIds
          },
          attributes: ['id', 'title']
        });
      }

      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});

      const movieMap = movies.reduce((map, movie) => {
        map[movie.id] = movie;
        return map;
      }, {});

      recentReviews.forEach(review => {
        const user = userMap[review.userId];
        const movie = movieMap[review.movieId];
        
        activities.push({
          id: `review_${review.id}`,
          type: 'review',
          description: `${user?.name || 'Anonymous'} rated "${movie?.title || 'Unknown Movie'}" ${review.rating} stars`,
          user: user?.name,
          userEmail: user?.email,
          userId: user?.id,
          timestamp: review.createdAt,
          metadata: {
            reviewId: review.id,
            rating: review.rating,
            movieId: review.movieId
          }
        });
      });
    }

    // 5. Admin Activities (User blocks, filmmaker approvals, etc.)
    if (type === "all" || type === "admin") {
      // Blocked/Unblocked users
      const blockedUsers = await User.findAll({
        where: {
          isBlocked: true,
          blockedAt: { [Op.gte]: startDate }
        },
        order: [['blockedAt', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'name', 'email', 'role', 'blockedAt', 'blockedReason']
      });

      blockedUsers.forEach(user => {
        activities.push({
          id: `block_${user.id}`,
          type: 'block',
          description: `User ${user.name} (${user.role}) was blocked`,
          user: 'Admin',
          timestamp: user.blockedAt,
          metadata: {
            userId: user.id,
            reason: user.blockedReason,
            role: user.role
          }
        });
      });

      // Filmmaker approvals
      const approvedFilmmakers = await User.findAll({
        where: {
          role: 'filmmaker',
          approvalStatus: 'approved',
          updatedAt: { [Op.gte]: startDate }
        },
        order: [['updatedAt', 'DESC']],
        limit: limitNum,
        attributes: ['id', 'name', 'email', 'approvalStatus', 'updatedAt']
      });

      approvedFilmmakers.forEach(filmmaker => {
        activities.push({
          id: `filmmaker_approval_${filmmaker.id}`,
          type: 'approval',
          description: `Filmmaker ${filmmaker.name} was approved`,
          user: 'Admin',
          timestamp: filmmaker.updatedAt,
          metadata: {
            filmmakerId: filmmaker.id,
            email: filmmaker.email
          }
        });
      });
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply final limit
    const finalActivities = activities.slice(0, limitNum);

    // Calculate summary statistics
    const summary = {
      totalActivities: finalActivities.length,
      byType: {
        signup: finalActivities.filter(a => a.type === 'signup').length,
        movie_upload: finalActivities.filter(a => a.type === 'movie_upload').length,
        payment: finalActivities.filter(a => a.type === 'payment').length,
        review: finalActivities.filter(a => a.type === 'review').length,
        approval: finalActivities.filter(a => a.type === 'approval').length,
        block: finalActivities.filter(a => a.type === 'block').length
      },
      activeUsers: new Set(finalActivities.map(a => a.userId).filter(Boolean)).size,
      movieViews: 0, // You might want to calculate this separately
      newUploads: finalActivities.filter(a => a.type === 'movie_upload').length
    };

    res.status(200).json({
      success: true,
      period,
      limit: limitNum,
      summary,
      data: finalActivities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};