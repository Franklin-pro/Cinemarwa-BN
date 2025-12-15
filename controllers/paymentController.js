import stripe from "../config/stripe.js";
import { requestToPay, checkPaymentStatus, sendMoneyToRecipient } from "../utils/momoHelper.js";
import Payment from "../models/Payment.model.js";
import Movie from "../models/Movie.model.js";
import User from "../models/User.modal.js";
import UserAccess from "../models/userAccess.model.js";
import jwt from "jsonwebtoken";
import Joi from "joi";
import Withdrawal from "../models/withdrawal.js";
import { calculateExpiryDate, getAccessPeriodLabel } from "../utils/dateUtils.js";

// ====== PAYMENT DISTRIBUTION CONFIGURATION ======
const FILMMAKER_SHARE = parseFloat(process.env.FILMMAKER_SHARE_PERCENTAGE) || 70;
const ADMIN_SHARE = parseFloat(process.env.ADMIN_SHARE_PERCENTAGE) || 30;
const ADMIN_MOMO_NUMBER = process.env.ADMIN_MOMO_NUMBER || "0790019543";
const MINIMUM_WITHDRAWAL = parseFloat(process.env.MINIMUM_WITHDRAWAL) || 500;

// 🔥 Subscription payment goes 100% to admin
const SUBSCRIPTION_FILMMAKER_SHARE = 0;
const SUBSCRIPTION_ADMIN_SHARE = 100;

// ====== VALIDATION SCHEMAS ======

const paymentValidationSchema = Joi.object({
  amount: Joi.number().positive().required(),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{9,15}$/),
  userId: Joi.string().required(),
  movieId: Joi.string().required(),
  email: Joi.string().email(),
  currency: Joi.string().valid("USD", "EUR", "GHS", "XOF", "RWF").default("EUR"),
  type: Joi.string().valid("watch", "download", "subscription_upgrade", "subscription_renewal", "series_access").required(),
  description: Joi.string().max(500),
  filmmakersAmount: Joi.number().positive().optional(),
  adminAmount: Joi.number().positive().optional(),
  accessPeriod: Joi.string().valid("one-time", "24h", "7d", "30d", "90d", "180d", "365d").default("one-time"),
  contentType: Joi.string().valid("movie", "series", "episode").default("movie"),
});

const subscriptionPaymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{9,15}$/),
  userId: Joi.string().required(),
  planId: Joi.string().required(),
  period: Joi.string().valid("month", "year").default("month"),
  email: Joi.string().email(),
  currency: Joi.string().valid("USD", "EUR", "GHS", "XOF", "RWF").default("EUR"),
  type: Joi.string().valid("subscription_upgrade", "subscription_renewal").required(),
  description: Joi.string().max(500),
  filmmakersAmount: Joi.number().positive().optional(),
  adminAmount: Joi.number().positive().optional(),
  metadata: Joi.object().optional(),
});

// ====== SERIES PAYMENT VALIDATION ======
const seriesPaymentValidationSchema = Joi.object({
  amount: Joi.number().positive().required(),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{9,15}$/),
  userId: Joi.string().required(),
  seriesId: Joi.string().required(),
  email: Joi.string().email(),
  currency: Joi.string().valid("USD", "EUR", "GHS", "XOF", "RWF").default("RWF"),
  accessPeriod: Joi.string().valid("24h", "7d", "30d", "90d", "180d", "365d").required(),
  description: Joi.string().max(500),
});

// ====== WITHDRAWAL VALIDATION SCHEMAS ======
const withdrawalRequestSchema = Joi.object({
  amount: Joi.number().positive().required(),
  payoutMethod: Joi.string().valid("momo", "bank_transfer", "stripe", "paypal").required(),
  notes: Joi.string().max(1000).optional(),
});

const processWithdrawalSchema = Joi.object({
  action: Joi.string().valid("approve", "reject", "complete").required(),
  reason: Joi.string().max(500).optional(),
});

// ====== CRITICAL HELPER FUNCTIONS ======

/**
 * 🔥 SAFE NUMBER PARSING - Prevents string concatenation
 */
const safeParseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  
  if (typeof value === 'number') return value;
  
  if (typeof value === 'string') {
    if (/^(\d)\1+$/.test(value)) {
      const digit = parseInt(value[0]);
      const count = value.length;
      const actualValue = digit * count;
      console.warn(`⚠️ Fixed concatenated number: "${value}" -> ${actualValue}`);
      return actualValue;
    }
    
    const cleanValue = value.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleanValue);
    return isNaN(num) ? 0 : num;
  }
  
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

/**
 * 🔥 CALCULATE PAYMENT DISTRIBUTION - FIXED VERSION
 */
const calculatePaymentDistribution = (totalAmount, paymentType = 'movie') => {
  console.log("🧮 CALCULATE DISTRIBUTION CALLED:", { totalAmount, paymentType });
  
  const amountNum = safeParseNumber(totalAmount);
  
  let filmmakerShare, adminShare;
  
  // 🔥 CRITICAL FIX: Check for 'subscription' in type string, not exact match
  if (paymentType.includes('subscription') || paymentType === 'series_access') {
    console.log("📊 Using subscription shares (0%/100%)");
    filmmakerShare = SUBSCRIPTION_FILMMAKER_SHARE;  // 0%
    adminShare = SUBSCRIPTION_ADMIN_SHARE;        // 100%
  } else {
    console.log("📊 Using movie shares (70%/30%)");
    filmmakerShare = FILMMAKER_SHARE;             // 70%
    adminShare = ADMIN_SHARE;                     // 30%
  }

  console.log("📊 Shares:", { filmmakerShare, adminShare, amountNum });
  
  const filmmakerAmount = (amountNum * filmmakerShare) / 100;
  const adminAmount = (amountNum * adminShare) / 100;

  const result = {
    totalAmount: amountNum,
    filmmakerAmount: parseFloat(filmmakerAmount.toFixed(2)),
    adminAmount: parseFloat(adminAmount.toFixed(2)),
    filmmakerPercentage: filmmakerShare,
    adminPercentage: adminShare,
    paymentType: paymentType,
  };
  
  console.log("📊 Distribution Result:", result);
  return result;
};

/**
 * 🔥 VALIDATE FILMMAKER SETUP
 */
const validateFilmmakerSetup = async (filmmakerId, paymentType = 'movie') => {
  try {
    // For subscription payments, filmmaker is not needed
    if (paymentType.includes('subscription') || paymentType === 'series_access') {
      return { isValid: true, filmmaker: null };
    }

    if (!filmmakerId) {
      return { 
        isValid: false, 
        error: 'Filmmaker ID is required for this payment type' 
      };
    }

    const filmmaker = await User.findByPk(filmmakerId);
    if (!filmmaker) {
      return { 
        isValid: false, 
        error: 'Filmmaker account not found' 
      };
    }

    return { isValid: true, filmmaker };
  } catch (error) {
    console.error('❌ Error validating filmmaker setup:', error);
    return { isValid: false, error: error.message };
  }
};


/**
 * 🔥 GET FILMMAKER INFO FROM CONTENT
 */
const getFilmmakerFromContent = async (contentId, contentType = 'movie') => {
  try {
    const content = await Movie.findByPk(contentId);
    if (!content) {
      return { success: false, error: 'Content not found' };
    }

    const filmmakerId = content.filmmakerId;
    if (!filmmakerId) {
      return { 
        success: false, 
        error: `This ${contentType} has no filmmaker assigned` 
      };
    }

    const filmmaker = await User.findByPk(filmmakerId);
    if (!filmmaker) {
      return { 
        success: false, 
        error: 'Filmmaker account not found' 
      };
    }

    return { 
      success: true, 
      filmmakerId, 
      filmmaker,
      contentTitle: content.title,
      contentType: content.contentType 
    };
  } catch (error) {
    console.error('❌ Error getting filmmaker from content:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 🔥 SANITIZE DESCRIPTION FOR LANARI PAY API
 */
const sanitizeDescription = (description) => {
  if (!description) return '';
  
  const sanitized = description
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return sanitized;
};

// ====== CORE PAYMENT FUNCTIONS ======

/**
 * 🔥 GRANT MOVIE ACCESS - FIXED VERSION (No string concatenation)
 */
const grantMovieAccess = async (payment) => {
  try {
    console.log("🎬 GRANTING MOVIE ACCESS FOR PAYMENT:", {
      id: payment.id,
      type: payment.type,
      userId: payment.userId,
      movieId: payment.movieId
    });
    
    const user = await User.findByPk(payment.userId);
    const movie = await Movie.findByPk(payment.movieId);

    if (!user || !movie) {
      throw new Error('User or content not found');
    }

    // Handle series access
    if (payment.type === 'series_access') {
      console.log("📺 Handling series access");
      return await grantSeriesAccess(payment, user);
    }

    // Calculate expiry date based on access period
    let expiresAt = null;
    let accessType = 'view';

    // 🔥 CRITICAL FIX: Check payment.type correctly
    if (payment.type === 'movie_watch' || payment.type === 'watch') {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);
      accessType = 'view';

      user.watchlist = user.watchlist || [];
      user.watchlist.push({
        movie: movie.id,
        grantedAt: new Date(),
        expiresAt: expiresAt,
        transactionId: payment.id,
      });
    } else if (payment.type === 'movie_download' || payment.type === 'download') {
      accessType = 'download';

      user.downloads = user.downloads || [];
      user.downloads.push({
        movie: movie.id,
        grantedAt: new Date(),
        transactionId: payment.id,
      });
    }

    await user.save();

    // 🔥 CREATE UserAccess RECORD
    await UserAccess.create({
      userId: payment.userId,
      movieId: payment.movieId,
      accessType: accessType,
      accessPeriod: payment.accessPeriod || 'one-time',
      pricePaid: safeParseNumber(payment.amount) || 0,
      currency: payment.currency || 'RWF',
      expiresAt: expiresAt,
      paymentId: payment.id,
      status: 'active'
    });

    // 🔥 CRITICAL FIX: Update movie revenue CORRECTLY (numeric addition)
    const currentRevenue = safeParseNumber(movie.totalRevenue);
    const paymentAmount = safeParseNumber(payment.amount);
    const newRevenue = currentRevenue + paymentAmount;
    
    await movie.update({ 
      totalRevenue: newRevenue,
      totalViews: (movie.totalViews || 0) + 1
    });

    console.log("✅ Movie access granted successfully");
    return { success: true };
  } catch (error) {
    console.error('❌ Error granting access:', error);
    throw error;
  }
};

/**
 * 🔥 GRANT SERIES ACCESS - FIXED VERSION
 */
const grantSeriesAccess = async (payment, user) => {
  try {
    const series = await Movie.findByPk(payment.seriesId);
    if (!series || series.contentType !== 'series') {
      throw new Error('Series not found');
    }

    const expiryDate = calculateExpiryDate(payment.accessPeriod);

    user.seriesAccess = user.seriesAccess || [];
    
    const existingAccessIndex = user.seriesAccess.findIndex(
      access => access.seriesId === series.id && access.status === 'active'
    );

    if (existingAccessIndex >= 0) {
      user.seriesAccess[existingAccessIndex] = {
        ...user.seriesAccess[existingAccessIndex],
        accessPeriod: payment.accessPeriod,
        expiresAt: expiryDate,
        lastUpdated: new Date(),
        transactionId: payment.id,
      };
    } else {
      user.seriesAccess.push({
        seriesId: series.id,
        seriesTitle: series.title,
        accessPeriod: payment.accessPeriod,
        purchasedAt: new Date(),
        expiresAt: expiryDate,
        status: 'active',
        transactionId: payment.id,
        episodesAccessed: []
      });
    }

    const episodes = await Movie.findAll({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: 'approved'
      },
      attributes: ['id']
    });

    // 🔥 CREATE UserAccess RECORD FOR SERIES
    await UserAccess.create({
      userId: payment.userId,
      seriesId: series.id,
      accessType: 'series',
      accessPeriod: payment.accessPeriod || '30d',
      pricePaid: safeParseNumber(payment.amount) || 0,
      currency: payment.currency || 'RWF',
      expiresAt: expiryDate,
      paymentId: payment.id,
      status: 'active'
    });

    // Create episode access records
    const episodeAccessPromises = episodes.map(episode => {
      return UserAccess.create({
        userId: payment.userId,
        movieId: episode.id,
        seriesId: series.id,
        accessType: 'series',
        accessPeriod: payment.accessPeriod || '30d',
        pricePaid: 0,
        currency: payment.currency || 'RWF',
        expiresAt: expiryDate,
        paymentId: payment.id,
        status: 'active'
      });
    });

    await Promise.all(episodeAccessPromises);

    // Create Payment records for tracking
    const paymentPromises = episodes.map(episode => {
      return Payment.create({
        amount: 0,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentStatus: 'succeeded',
        paymentDate: new Date(),
        userId: payment.userId,
        movieId: episode.id,
        type: 'series_episode',
        filmmakerId: series.filmmakerId,
        parentPaymentId: payment.id,
        referenceId: `${payment.referenceId}_ep_${episode.id}`,
        expiresAt: expiryDate,
        metadata: {
          seriesId: series.id,
          seriesTitle: series.title,
          accessPeriod: payment.accessPeriod
        }
      });
    });

    await Promise.all(paymentPromises);
    await user.save();

    // 🔥 CRITICAL FIX: Update series revenue CORRECTLY
    const paidAmount = safeParseNumber(payment.amount);
    const currentRevenue = safeParseNumber(series.totalRevenue);
    const newRevenue = currentRevenue + paidAmount;
    
    await series.update({
      totalRevenue: newRevenue,
      seriesRevenue: (series.seriesRevenue || 0) + paidAmount,
      totalViews: (series.totalViews || 0) + 1
    });
    
    return { 
      success: true, 
      seriesId: series.id,
      seriesTitle: series.title,
      accessPeriod: payment.accessPeriod,
      expiresAt: expiryDate,
      episodeCount: episodes.length
    };
  } catch (error) {
    console.error('❌ Error granting series access:', error);
    throw error;
  }
};

/**
 * 🔥 GRANT SUBSCRIPTION ACCESS
 */
const grantSubscriptionAccess = async (payment) => {
  try {
    const user = await User.findByPk(payment.userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    const planId = payment.planId;
    const metadata = payment.metadata || {};
    
    const planConfigs = {
      'basic': { maxDevices: 1, isUpgraded: true },
      'pro': { maxDevices: 4, isUpgraded: true },
      'enterprise': { maxDevices: 10, isUpgraded: true }
    };

    const planConfig = planConfigs[planId] || planConfigs['pro'];
    
    user.subscription = {
      planId: planId,
      planName: metadata.planName || planId,
      status: 'active',
      period: payment.subscriptionPeriod || 'month',
      startDate: payment.subscriptionStartDate || new Date(),
      endDate: payment.subscriptionEndDate,
      maxDevices: planConfig.maxDevices,
      paymentId: payment.id
    };

    user.isUpgraded = planConfig.isUpgraded;
    user.maxDevices = planConfig.maxDevices;
    
    if (user.activeDevices && user.activeDevices.length > planConfig.maxDevices) {
      user.activeDevices = user.activeDevices.slice(0, planConfig.maxDevices);
    }

    await user.save();
    
    return { 
      success: true, 
      plan: planId, 
      maxDevices: planConfig.maxDevices 
    };
  } catch (error) {
    console.error('❌ Error granting subscription:', error);
    throw error;
  }
};

/**
 * 🔥 UPDATE FILMMAKER REVENUE - FIXED VERSION
 */
const updateFilmmakerRevenue = async (payment) => {
  try {
    const filmmakerId = payment.filmmakerId;
    
    if (!filmmakerId) {
      console.error('❌ FilmmakerId not found in payment:', payment.id);
      return;
    }

    const filmmaker = await User.findByPk(filmmakerId);
    if (!filmmaker) {
      console.error('❌ Filmmaker not found:', filmmakerId);
      return;
    }

    // 🔥 Use safeParseNumber to ensure proper numeric addition
    const filmmakerAmt = safeParseNumber(payment.filmmakerAmount) || 0;
    const currentPending = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance) || 0;
    const currentTotalRevenue = safeParseNumber(filmmaker.filmmmakerStatsTotalRevenue) || 0;
    const currentTotalEarned = safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned) || 0;
    
    const newPendingBalance = currentPending + filmmakerAmt;
    const newTotalRevenue = currentTotalRevenue + filmmakerAmt;
    const newTotalEarned = currentTotalEarned + filmmakerAmt;

    await filmmaker.update({
      filmmmakerFinancePendingBalance: newPendingBalance,
      filmmmakerStatsTotalRevenue: newTotalRevenue,
      filmmmakerFinanceTotalEarned: newTotalEarned
    });

  } catch (error) {
    console.error('❌ Error updating filmmaker revenue:', error);
  }
};

/**
 * 🔥 PROCESS ADMIN PAYOUT ONLY
 */
const processAdminPayout = async (payment, movie) => {
  try {
    console.log("🏦 PROCESSING ADMIN PAYOUT FOR PAYMENT:", payment.id);

    const distribution = calculatePaymentDistribution(payment.amount, payment.type);

    if (distribution.adminAmount > 0) {
      
      const adminPayout = await sendMoneyToRecipient(
        distribution.adminAmount,
        ADMIN_MOMO_NUMBER,
        `admin_${payment.id}`,
        sanitizeDescription(`Platform Fee ${payment.type} ${movie?.title || 'Content'}`)
      );

      if (adminPayout.success) {
        
        await Withdrawal.create({
          userId: payment.userId,
          amount: distribution.adminAmount,
          currency: payment.currency || 'RWF',
          phoneNumber: ADMIN_MOMO_NUMBER,
          status: 'completed',
          type: payment.type.includes('subscription') || payment.type === 'series_access' 
            ? 'subscription_admin_fee' 
            : 'admin_fee',
          description: sanitizeDescription(`Platform Fee ${payment.type} ${movie?.title || 'Content'}`),
          referenceId: adminPayout.referenceId,
          transactionId: adminPayout.data?.transaction_id,
          completedAt: new Date(),
          metadata: {
            movieId: movie?.id,
            movieTitle: movie?.title,
            paymentType: payment.type,
            customerPaymentId: payment.id,
            filmmakerId: payment.filmmakerId,
            contentType: movie?.contentType,
            seriesId: movie?.seriesId,
          },
        });
        
        console.log("✅ Admin payout completed");
        return {
          success: true,
          admin: {
            amount: distribution.adminAmount,
            referenceId: adminPayout.referenceId,
            status: 'completed'
          }
        };
      } else {
        console.error("❌ Admin payout failed:", adminPayout.error);
        return {
          success: false,
          error: adminPayout.error
        };
      }
    } else {
      console.log("ℹ️ No admin amount to payout");
      return {
        success: true,
        message: 'No admin payout needed'
      };
    }
  } catch (error) {
    console.error('❌ Error processing admin payout:', error);
    return { success: false, error: error.message };
  }
};

// ====== WEBHOOK & STATUS FUNCTIONS ======

export const lanariPayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log("📱 Lanari Pay Webhook Received:", webhookData);

    const { 
      transaction_id, 
      status, 
      amount, 
      currency,
      customer_phone,
      reference_id,
      payment_status 
    } = webhookData;

    const payment = await Payment.findOne({ 
      where: { referenceId: transaction_id || reference_id } 
    });

    if (!payment) {
      console.warn('⚠️ Payment not found for webhook:', transaction_id);
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const newStatus = payment_status || status;

    if (newStatus === 'success' || newStatus === 'completed') {
      payment.paymentStatus = 'succeeded';
      payment.updatedAt = new Date();
      await payment.save();

      if (payment.type === 'series_access') {
        await grantMovieAccess(payment);
      } else if (payment.type === 'subscription_upgrade' || payment.type === 'subscription_renewal') {
        await grantSubscriptionAccess(payment);
      } else {
        await grantMovieAccess(payment);
      }

      if (!payment.type.includes('subscription') && payment.type !== 'series_access') {
        await updateFilmmakerRevenue(payment);
      }

      const content = await Movie.findByPk(payment.movieId || payment.seriesId);
      if (content) {
        await processAdminPayout(payment, content);
      }

    } else if (newStatus === 'failed' || newStatus === 'cancelled') {
      payment.paymentStatus = 'failed';
      payment.failureReason = webhookData.reason || 'Payment failed';
      payment.updatedAt = new Date();
      await payment.save();
    }

    res.status(200).json({ success: true, received: true });

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ====== PAYMENT METHODS ======

export const payWithMoMo = async (req, res) => {
  try {
    const { error, value } = paymentValidationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { amount, phoneNumber, userId, movieId, description, currency, type, contentType, accessPeriod } = value;

    console.log("📱 Payment Request:", { 
      amount, 
      currency, 
      phoneNumber, 
      movieId, 
      type, 
      contentType, 
      accessPeriod, 
      userId 
    });

    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    // Get filmmaker info
    const filmmakerInfo = await getFilmmakerFromContent(movieId, contentType || 'movie');
    if (!filmmakerInfo.success) {
      return res.status(400).json({
        success: false,
        message: filmmakerInfo.error
      });
    }

    const { filmmakerId, filmmaker, contentTitle } = filmmakerInfo;

    // Validate filmmaker setup
    const filmmakerValidation = await validateFilmmakerSetup(filmmakerId, type);
    if (!filmmakerValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: filmmakerValidation.error
      });
    }

    // For series access, validate it's a series
    if (type === 'series_access' && movie.contentType !== 'series') {
      return res.status(400).json({
        success: false,
        message: "Series access can only be purchased for series content"
      });
    }

    // 🔥 Ensure amount is a number
    const amountNum = safeParseNumber(amount);
    if (amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0"
      });
    }

    const distribution = calculatePaymentDistribution(amountNum, type);

    let finalAmount = amountNum;
    let finalCurrency = currency;

    if (currency !== "RWF") {
      const exchangeRates = { USD: 1200, EUR: 1300, GBP: 1500 };
      if (exchangeRates[currency]) {
        finalAmount = Math.round(amountNum * exchangeRates[currency]);
        finalCurrency = "RWF";
      }
    }

    // 🔥 CRITICAL: Ensure finalAmount is a number, not a string
    finalAmount = Number(finalAmount);
    
    let formattedPhone = phoneNumber.replace(/[+\s]/g, '');
    if (formattedPhone.startsWith("250")) {
      formattedPhone = "0" + formattedPhone.substring(3);
    } else if (!formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone;
    }

    const rawDescription = description || `${type} ${movie.title}`;
    const sanitizedDescription = sanitizeDescription(rawDescription);

    // 🔥 PREPARE PAYOUT NUMBERS FOR LANARI PAY
    // Get filmmaker's MoMo number
    const filmmakerPhone = filmmaker.filmmmakerMomoPhoneNumber;
    
    // Prepare payout array for Lanari Pay
    let payoutNumbers = null;
    
    if (filmmakerPhone && ADMIN_MOMO_NUMBER && 
        !type.includes('subscription') && type !== 'series_access') {
      
      // Format filmmaker phone
      let formattedFilmmakerPhone = filmmakerPhone.replace(/[+\s]/g, '');
      if (formattedFilmmakerPhone.startsWith("250")) {
        formattedFilmmakerPhone = "0" + formattedFilmmakerPhone.substring(3);
      } else if (!formattedFilmmakerPhone.startsWith("0")) {
        formattedFilmmakerPhone = "0" + formattedFilmmakerPhone;
      }
      
      // Format admin phone
      let formattedAdminPhone = ADMIN_MOMO_NUMBER.replace(/[+\s]/g, '');
      if (formattedAdminPhone.startsWith("250")) {
        formattedAdminPhone = "0" + formattedAdminPhone.substring(3);
      } else if (!formattedAdminPhone.startsWith("0")) {
        formattedAdminPhone = "0" + formattedAdminPhone;
      }
      
      // Create payout array (70% to filmmaker, 30% to admin)
      payoutNumbers = [
        {
          tel: formattedFilmmakerPhone,
          percentage: 70 // FILMMAKER_SHARE
        },
        {
          tel: formattedAdminPhone,
          percentage: 30 // ADMIN_SHARE
        }
      ];
      
      console.log("💰 Lanari Pay Payout Numbers:", payoutNumbers);
    }

    console.log(`💰 Sending payment amount: ${finalAmount} RWF`);
    
    // 🔥 CALL REQUESTTOPAY WITH PAYOUT NUMBERS
    const payment = await requestToPay(
      finalAmount,
      formattedPhone,
      userId,
      sanitizedDescription,
      finalCurrency,
      payoutNumbers // Pass payout numbers here
    );

    if (payment.success) {
      const gatewayStatus = payment.data?.gateway_response?.data?.status;
      const isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
      const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

      const metadata = {
        contentType: movie.contentType,
        title: movie.title,
        seriesId: movie.seriesId,
        accessPeriod: accessPeriod,
        expiresAt: accessPeriod && accessPeriod !== 'one-time' ? calculateExpiryDate(accessPeriod) : null,
        filmmakerInfo: {
          id: filmmakerId,
          name: filmmaker.name,
          paymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
          phoneNumber: filmmaker.filmmmakerMomoPhoneNumber
        },
        payoutNumbers: payoutNumbers // Store payout info in metadata
      };

      // 🔥 Create payment record
      const newPayment = await Payment.create({
        amount: finalAmount,
        originalAmount: amountNum,
        originalCurrency: currency,
        currency: finalCurrency,
        paymentMethod: "MoMo",
        paymentMethodProvider: "LanariPay",
        paymentStatus: initialStatus,
        paymentDate: new Date(),
        userId,
        movieId,
        filmmakerId: filmmakerId,
        filmmakerPaymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
        filmmakerPhoneNumber: filmmaker.filmmmakerMomoPhoneNumber,
        type: type === 'series_access' ? 'series_access' : `${contentType || 'movie'}_${type}`,
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: accessPeriod,
        expiresAt: accessPeriod && accessPeriod !== 'one-time' ? calculateExpiryDate(accessPeriod) : null,
        referenceId: payment.referenceId,
        filmmakerAmount: distribution.filmmakerAmount,
        adminAmount: distribution.adminAmount,
        exchangeRate: currency !== "RWF" ? (finalAmount / amountNum) : 1,
        financialTransactionId: payment.data?.gateway_response?.data?.transaction_id,
        phoneNumber: formattedPhone,
        metadata: metadata
      });

      console.log(`💰 Payment created with amount: ${newPayment.amount}`);

      let adminPayoutResults = null;
      let accessResults = null;

      if (isGatewaySuccessful) {
        try {
          accessResults = await grantMovieAccess(newPayment);
          
          // 🔥 If payout numbers were sent to Lanari Pay, they handle the split automatically
          // So we only need to update our database records
          if (!type.includes('subscription') && type !== 'series_access') {
            await updateFilmmakerRevenue(newPayment);
          }
          
          // If payout numbers weren't sent (or failed), do manual admin payout
          if (!payoutNumbers && distribution.adminAmount > 0) {
            adminPayoutResults = await processAdminPayout(newPayment, movie);
          }
          
        } catch (error) {
          console.error("❌ Post-payment error:", error);
        }
      }

      return res.status(200).json({
        success: true,
        message: isGatewaySuccessful ? "Payment successful! Access granted." : "Payment initiated. Please confirm.",
        transactionId: newPayment.id,
        referenceId: payment.referenceId,
        status: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
        access: accessResults,
        adminPayout: adminPayoutResults,
        distribution: {
          ...distribution,
          filmmakerId: filmmakerId,
          filmmakerName: filmmaker.name,
        },
        filmmakerInfo: {
          id: filmmakerId,
          name: filmmaker.name,
          paymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
          phoneNumber: filmmaker.filmmmakerMomoPhoneNumber
        },
        lanariPayPayout: payoutNumbers ? {
          enabled: true,
          recipients: payoutNumbers
        } : { enabled: false },
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: accessPeriod,
        expiresAt: newPayment.expiresAt,
      });

    } else {
      return res.status(400).json({
        success: false,
        message: "Payment initiation failed",
        error: payment.error,
      });
    }

  } catch (error) {
    console.error("❌ MoMo Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message,
    });
  }
};
/**
 * 🔥 PROCESS SERIES ACCESS PAYMENT - FIXED VERSION
 */
export const paySeriesWithMoMo = async (req, res) => {
  try {
    const { error, value } = seriesPaymentValidationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { amount, phoneNumber, userId, seriesId, description, currency, accessPeriod } = value;

    console.log("🎬 Series Payment Request:", { 
      amount, 
      currency, 
      phoneNumber, 
      seriesId, 
      accessPeriod, 
      userId 
    });

    const filmmakerInfo = await getFilmmakerFromContent(seriesId, 'series');
    if (!filmmakerInfo.success) {
      return res.status(400).json({
        success: false,
        message: filmmakerInfo.error
      });
    }

    const { filmmakerId, filmmaker, contentTitle, contentType } = filmmakerInfo;

    const series = await Movie.findByPk(seriesId);
    if (!series || contentType !== 'series') {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    const filmmakerValidation = await validateFilmmakerSetup(filmmakerId, 'series_access');
    if (!filmmakerValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: filmmakerValidation.error
      });
    }

    // Get series pricing
    const pricingTiers = series.pricingTiers || {};
    const requestedPrice = safeParseNumber(amount);
    const tierPrice = pricingTiers[accessPeriod];

    // Validate price matches tier
    let finalRequestedAmount = requestedPrice;
    if (tierPrice !== undefined && Math.abs(tierPrice - requestedPrice) > 0.01) {
      console.warn(`⚠️ Price mismatch: requested ${requestedPrice}, tier price ${tierPrice}`);
      finalRequestedAmount = tierPrice;
    }

    // 🔥 CORRECTION: SERIES ACCESS PAYMENT: 70% to filmmaker, 30% to admin (NOT 0%/100%)
    // Use 'movie_watch' type to get 70/30 split, or create a new type that gets 70/30
    const distribution = calculatePaymentDistribution(finalRequestedAmount, 'movie_watch');
    console.log("💰 Series Payment Distribution (70/30 split):", distribution);

    let finalAmount = finalRequestedAmount;
    let finalCurrency = currency;

    if (currency !== "RWF") {
      const exchangeRates = { USD: 1200, EUR: 1300, GBP: 1500 };
      if (exchangeRates[currency]) {
        finalAmount = Math.round(finalRequestedAmount * exchangeRates[currency]);
        finalCurrency = "RWF";
      }
    }

    // 🔥 CRITICAL: Ensure finalAmount is a number
    finalAmount = Number(finalAmount);
    
    let formattedPhone = phoneNumber.replace(/[+\s]/g, '');
    if (formattedPhone.startsWith("250")) {
      formattedPhone = "0" + formattedPhone.substring(3);
    } else if (!formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone;
    }

    const rawDescription = description || `Series Access ${series.title} ${getAccessPeriodLabel(accessPeriod)}`;
    const sanitizedDescription = sanitizeDescription(rawDescription);

    console.log(`💰 Sending series payment amount: ${finalAmount} (Type: ${typeof finalAmount})`);

    // 🔥 PREPARE PAYOUT NUMBERS FOR SERIES ACCESS - 70/30 SPLIT
    let payoutNumbers = null;
    
    // Get filmmaker's MoMo number
    const filmmakerPhone = filmmaker.filmmmakerMomoPhoneNumber;
    
    if (filmmakerPhone && ADMIN_MOMO_NUMBER) {
      // Format filmmaker phone
      let formattedFilmmakerPhone = filmmakerPhone.replace(/[+\s]/g, '');
      if (formattedFilmmakerPhone.startsWith("250")) {
        formattedFilmmakerPhone = "0" + formattedFilmmakerPhone.substring(3);
      } else if (!formattedFilmmakerPhone.startsWith("0")) {
        formattedFilmmakerPhone = "0" + formattedFilmmakerPhone;
      }
      
      // Format admin phone
      let formattedAdminPhone = ADMIN_MOMO_NUMBER.replace(/[+\s]/g, '');
      if (formattedAdminPhone.startsWith("250")) {
        formattedAdminPhone = "0" + formattedAdminPhone.substring(3);
      } else if (!formattedAdminPhone.startsWith("0")) {
        formattedAdminPhone = "0" + formattedAdminPhone;
      }
      
      // 🔥 SERIES ACCESS: 70% filmmaker, 30% admin (SAME AS SINGLE MOVIES)
      payoutNumbers = [
        {
          tel: formattedFilmmakerPhone,
          percentage: 70 // FILMMAKER gets 70% for series access
        },
        {
          tel: formattedAdminPhone,
          percentage: 30 // ADMIN gets 30% for series access
        }
      ];
      
      console.log("💰 Series Access Payout Numbers (70/30):", payoutNumbers);
    }

    // 🔥 CALL REQUESTTOPAY WITH PAYOUT NUMBERS
    const payment = await requestToPay(
      finalAmount,
      formattedPhone,
      userId,
      sanitizedDescription,
      finalCurrency,
      payoutNumbers // Pass payout numbers here
    );

    if (payment.success) {
      const gatewayStatus = payment.data?.gateway_response?.data?.status;
      const isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
      const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

      const expiresAt = calculateExpiryDate(accessPeriod);

      const episodeCount = await Movie.count({
        where: {
          seriesId: series.id,
          contentType: 'episode',
          status: 'approved'
        }
      });

      const metadata = {
        seriesTitle: series.title,
        accessPeriod: accessPeriod,
        accessPeriodLabel: getAccessPeriodLabel(accessPeriod),
        expiresAt: expiresAt,
        seriesEpisodes: episodeCount,
        filmmakerInfo: {
          id: filmmakerId,
          name: filmmaker.name,
          paymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
          phoneNumber: filmmaker.filmmmakerMomoPhoneNumber
        },
        payoutNumbers: payoutNumbers,
        distributionType: 'series_access_70_30' // Mark as series with 70/30 split
      };

      // 🔥 Create payment with proper numeric values
      const newPayment = await Payment.create({
        amount: finalAmount,
        originalAmount: finalRequestedAmount,
        originalCurrency: currency,
        currency: finalCurrency,
        paymentMethod: "MoMo",
        paymentMethodProvider: "LanariPay",
        paymentStatus: initialStatus,
        paymentDate: new Date(),
        userId,
        seriesId: series.id,
        filmmakerId: filmmakerId,
        filmmakerPaymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
        filmmakerPhoneNumber: filmmaker.filmmmakerMomoPhoneNumber,
        type: 'series_access', // Keep as series_access type
        contentType: 'series',
        accessPeriod: accessPeriod,
        expiresAt: expiresAt,
        referenceId: payment.referenceId,
        filmmakerAmount: distribution.filmmakerAmount, // Will be 70% for series
        adminAmount: distribution.adminAmount, // Will be 30% for series
        exchangeRate: currency !== "RWF" ? (finalAmount / finalRequestedAmount) : 1,
        financialTransactionId: payment.data?.gateway_response?.data?.transaction_id,
        phoneNumber: formattedPhone,
        metadata: metadata
      });

      console.log(`💰 Series payment created:`, {
        id: newPayment.id,
        amount: newPayment.amount,
        filmmakerAmount: newPayment.filmmakerAmount, // Should be 70%
        adminAmount: newPayment.adminAmount // Should be 30%
      });

      let adminPayoutResults = null;
      let accessResults = null;

      if (isGatewaySuccessful) {
        try {
          accessResults = await grantSeriesAccess(newPayment);
          
          // 🔥 CRITICAL: Update filmmaker revenue for series payments (70%)
          // Even if Lanari Pay handles payout automatically, we need to update our records
          console.log("💰 Updating filmmaker revenue for series access...");
          await updateFilmmakerRevenue(newPayment);
          
          // If payout numbers weren't sent (or failed), do manual admin payout
          if (distribution.adminAmount > 0) {
            // Check if Lanari Pay already handled the payout
            if (!payoutNumbers) {
              adminPayoutResults = await processAdminPayout(newPayment, series);
            } else {
              console.log("✅ Lanari Pay handled automatic 30% admin payout");
              // Create a record of the automatic payout
              await Withdrawal.create({
                userId: userId,
                amount: distribution.adminAmount,
                currency: finalCurrency,
                phoneNumber: ADMIN_MOMO_NUMBER,
                status: 'completed',
                type: 'series_access_admin_fee',
                description: sanitizeDescription(`Series Access Admin Fee ${series.title} ${accessPeriod}`),
                referenceId: payment.referenceId,
                transactionId: payment.data?.gateway_response?.data?.transaction_id,
                completedAt: new Date(),
                metadata: {
                  seriesId: series.id,
                  seriesTitle: series.title,
                  paymentType: 'series_access',
                  customerPaymentId: newPayment.id,
                  filmmakerId: filmmakerId,
                  automaticPayout: true,
                  split: '70/30'
                },
              });
            }
          }
        } catch (error) {
          console.error("❌ Post-payment error:", error);
        }
      }

      const episodes = await Movie.findAll({
        where: {
          seriesId: series.id,
          contentType: 'episode',
          status: 'approved'
        },
        attributes: ['id', 'title', 'episodeTitle', 'seasonNumber', 'episodeNumber'],
        order: [
          ['seasonNumber', 'ASC'],
          ['episodeNumber', 'ASC']
        ]
      });

      return res.status(200).json({
        success: true,
        message: isGatewaySuccessful 
          ? "Series access purchased successfully!" 
          : "Payment initiated. Please confirm.",
        transactionId: newPayment.id,
        referenceId: payment.referenceId,
        status: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
        access: accessResults,
        adminPayout: adminPayoutResults,
        distribution: {
          ...distribution,
          filmmakerId: filmmakerId,
          filmmakerName: filmmaker.name,
          note: "Series access: 70% to filmmaker, 30% to admin"
        },
        filmmakerInfo: {
          id: filmmakerId,
          name: filmmaker.name,
          paymentMethod: filmmaker.filmmmakerFinancePayoutMethod,
        },
        lanariPayPayout: payoutNumbers ? {
          enabled: true,
          recipients: payoutNumbers,
          note: "Lanari Pay handles automatic 70/30 payout split"
        } : { enabled: false },
        series: {
          id: series.id,
          title: series.title,
          totalEpisodes: episodes.length,
          totalSeasons: series.totalSeasons,
        },
        accessDetails: {
          period: accessPeriod,
          periodLabel: getAccessPeriodLabel(accessPeriod),
          expiresAt: expiresAt,
          episodesCount: episodes.length,
          episodes: episodes.slice(0, 10),
        },
      });

    } else {
      return res.status(400).json({
        success: false,
        message: "Payment initiation failed",
        error: payment.error,
      });
    }

  } catch (error) {
    console.error("❌ Series MoMo Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message,
    });
  }
};

export const checkMoMoPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const payment = await Payment.findByPk(transactionId, {
      include: [
        { association: 'movieId', attributes: ['title'] },
        { association: 'userId', attributes: ['name', 'email'] }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    if (payment.paymentStatus === 'succeeded' || payment.paymentStatus === 'failed') {
      return res.status(200).json({
        success: true,
        status: payment.paymentStatus.toUpperCase(),
        transactionId: payment.id,
        referenceId: payment.referenceId,
        amount: payment.amount,
        currency: payment.currency,
        type: payment.type,
        filmmakerId: payment.filmmakerId,
        filmmakerAmount: payment.filmmakerAmount,
        adminAmount: payment.adminAmount,
        paidAt: payment.updatedAt,
      });
    }

    const momoStatus = await checkPaymentStatus(payment.referenceId);

    if (!momoStatus.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to check payment status',
        error: momoStatus.error,
      });
    }

    const status = momoStatus.status;

    if (status === 'SUCCESSFUL') {
      console.log("✅ Payment successful, updating records...");
      
      payment.paymentStatus = 'succeeded';
      payment.financialTransactionId = momoStatus.financialTransactionId;
      payment.updatedAt = new Date();
      await payment.save();

      await grantMovieAccess(payment);

      // 🔥 CRITICAL: Update filmmaker revenue for movie payments
      if (!payment.type.includes('subscription') && payment.type !== 'series_access') {
        console.log("💰 Updating filmmaker revenue for payment:", payment.id);
        await updateFilmmakerRevenue(payment);
      }

      const movie = await Movie.findByPk(payment.movieId);
      await processAdminPayout(payment, movie);

      return res.status(200).json({
        success: true,
        status: 'SUCCESSFUL',
        transactionId: payment.id,
        referenceId: payment.referenceId,
        amount: payment.amount,
        currency: payment.currency,
        type: payment.type,
        filmmakerId: payment.filmmakerId,
        filmmakerAmount: payment.filmmakerAmount,
        adminAmount: payment.adminAmount,
        financialTransactionId: momoStatus.financialTransactionId,
        message: 'Payment successful! Access granted.',
        paidAt: payment.updatedAt,
      });
    } else if (status === 'FAILED') {
      payment.paymentStatus = 'failed';
      payment.failureReason = momoStatus.reason 
        ? `${momoStatus.reason.code}: ${momoStatus.reason.message}` 
        : 'Payment failed';
      payment.updatedAt = new Date();
      await payment.save();

      return res.status(200).json({
        success: true,
        status: 'FAILED',
        transactionId: payment.id,
        referenceId: payment.referenceId,
        reason: payment.failureReason,
        message: 'Payment failed. Please try again.',
      });
    } else {
      return res.status(200).json({
        success: true,
        status: 'PENDING',
        transactionId: payment.id,
        referenceId: payment.referenceId,
        message: 'Payment is still being processed. Please check your phone.',
      });
    }
  } catch (error) {
    console.error('❌ Status Check Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message,
    });
  }
};

/**
 * 🔥 PAY SUBSCRIPTION WITH MOMO WITH PAYOUTS - UPDATED VERSION
 */
export const paySubscriptionWithMoMo = async (req, res) => {
  try {
    console.log("📱 Subscription Payment Request Body:", req.body);
    
    const { error, value } = subscriptionPaymentSchema.validate(req.body);
    if (error) {
      console.error("❌ Validation Error:", error.details);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { 
      amount, 
      phoneNumber, 
      userId, 
      email, 
      currency, 
      planId, 
      period = 'month', 
      metadata,
      type = 'subscription_upgrade' 
    } = value;

    console.log("📱 Parsed Subscription Request:", {
      amount,
      currency,
      phoneNumber,
      planId,
      period,
      type,
      userId
    });

    // 🔥 Calculate distribution for subscription
    const distribution = calculatePaymentDistribution(amount, 'subscription');
    console.log("💰 Subscription Distribution:", distribution);

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: '"planId" is required',
      });
    }

    const startDate = new Date();
    const endDate = new Date();
    if (period === 'year') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // 🔥 Ensure amount is a number
    const amountNum = safeParseNumber(amount);
    let finalAmount = amountNum;
    let finalCurrency = currency;
    
    if (currency !== "RWF") {
      console.log(`Converting ${currency} ${amountNum} to RWF`);
      const exchangeRates = {
        USD: 1200,
        EUR: 1300,
        GBP: 1500,
      };
      
      if (exchangeRates[currency]) {
        finalAmount = Math.round(amountNum * exchangeRates[currency]);
        finalCurrency = "RWF";
        console.log(`Converted to: ${finalAmount} RWF`);
      }
    }

    // 🔥 Ensure finalAmount is a number
    finalAmount = parseInt(finalAmount);
    
    let formattedPhone = "";
    if (phoneNumber && phoneNumber.trim() !== '') {
      formattedPhone = phoneNumber.replace(/[+\s]/g, '');
      if (formattedPhone.startsWith("250")) {
        formattedPhone = "0" + formattedPhone.substring(3);
      } else if (!formattedPhone.startsWith("0")) {
        formattedPhone = "0" + formattedPhone;
      }
      
      if (!/^0(78|79)\d{7}$/.test(formattedPhone)) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          error: "Invalid Rwanda phone number format. Use 078XXXXXXX or 079XXXXXXX",
        });
      }
    }

    // 🔥 SUBSCRIPTION PAYOUTS: 100% to admin (0% to filmmaker)
    let payoutNumbers = null;
    
    if (ADMIN_MOMO_NUMBER) {
      // Format admin phone
      let formattedAdminPhone = ADMIN_MOMO_NUMBER.replace(/[+\s]/g, '');
      if (formattedAdminPhone.startsWith("250")) {
        formattedAdminPhone = "0" + formattedAdminPhone.substring(3);
      } else if (!formattedAdminPhone.startsWith("0")) {
        formattedAdminPhone = "0" + formattedAdminPhone;
      }
      
      // 🔥 SUBSCRIPTION: 100% to admin, 0% to filmmaker
      payoutNumbers = [
        {
          tel: formattedAdminPhone,
          percentage: 100 // ADMIN gets 100% for subscription
        }
      ];
      
      console.log("💰 Subscription Payout Numbers (0/100):", payoutNumbers);
    }

    let payment;
    let isGatewaySuccessful = false;
    let referenceId = `SUBSCRIPTION_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (formattedPhone) {
      const rawDescription = `Subscription ${planId} ${period}`;
      const sanitizedDescription = sanitizeDescription(rawDescription);
      
      console.log(`💰 Sending subscription payment: ${finalAmount} (Type: ${typeof finalAmount})`);
      
      // 🔥 CALL REQUESTTOPAY WITH PAYOUT NUMBERS
      payment = await requestToPay(
        finalAmount,
        formattedPhone,
        userId,
        sanitizedDescription,
        finalCurrency,
        payoutNumbers // Pass payout numbers here
      );

      console.log("📱 Lanari Pay Response:", payment);

      if (!payment.success) {
        const errorMessage = payment.error || '';
        const gatewayError = payment.data?.error || '';
        const gatewayMessage = payment.data?.gateway_response?.data?.message || '';
        
        let userFriendlyMessage = "Payment initiation failed";
        
        if (
          errorMessage.includes('Check users Balance') || 
          errorMessage.includes('users Balance') ||
          gatewayError.includes('Check users Balance') ||
          gatewayMessage.includes('Check users Balance') ||
          gatewayMessage.includes('Balance')
        ) {
          userFriendlyMessage = "Ntamafranga ufite ahagije. Ongera amafranga wishyure!";
        } else if (gatewayMessage) {
          userFriendlyMessage = gatewayMessage;
        }
        
        return res.status(400).json({
          success: false,
          message: userFriendlyMessage,
          error: payment.error,
          details: {
            amount: finalAmount,
            currency: finalCurrency,
            userMessage: userFriendlyMessage,
            technicalError: payment.error
          }
        });
      }

      referenceId = payment.referenceId;
      const gatewayStatus = payment.data?.gateway_response?.data?.status;
      isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
      console.log("🔍 Gateway Status:", gatewayStatus);
    } else {
      isGatewaySuccessful = true;
    }

    const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

    // 🔥 Create payment with proper numeric values
    const newPayment = await Payment.create({
      amount: finalAmount, // Store as number
      originalAmount: amountNum,
      originalCurrency: currency,
      currency: finalCurrency,
      paymentMethod: formattedPhone ? "MoMo" : "system",
      paymentMethodProvider: formattedPhone ? "LanariPay" : "internal",
      paymentStatus: initialStatus,
      paymentDate: new Date(),
      userId,
      type: type,
      planId,
      subscriptionPeriod: period,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      referenceId: referenceId,
      exchangeRate: currency !== "RWF" ? (finalAmount / amountNum) : 1,
      financialTransactionId: payment?.data?.gateway_response?.data?.transaction_id || null,
      phoneNumber: formattedPhone || null,
      email,
      filmmakerId: null,
      filmmakerAmount: distribution.filmmakerAmount, // Will be 0 for subscription
      adminAmount: distribution.adminAmount, // Will be 100% for subscription
      metadata: {
        ...metadata,
        planId,
        period,
        paymentType: 'subscription',
        planName: metadata?.planName || planId,
        maxDevices: metadata?.maxDevices || 4,
        distribution: {
          filmmakerPercentage: distribution.filmmakerPercentage,
          adminPercentage: distribution.adminPercentage,
        },
        payoutNumbers: payoutNumbers, // Store payout info in metadata
      }
    });

    console.log(`💰 Subscription payment created with amount: ${newPayment.amount}`);

    if (isGatewaySuccessful) {
      console.log("✅ Gateway successful - Granting subscription access");
      
      try {
        await grantSubscriptionAccess(newPayment);
        console.log("✅ Subscription access granted");
        
        // If payout numbers were sent to Lanari Pay, they handle the 100% admin payout automatically
        // So we only need to update our database records
        if (distribution.adminAmount > 0) {
          // Check if Lanari Pay already handled the payout
          if (!payoutNumbers) {
            // Manual admin payout if Lanari Pay didn't handle it
            const adminPayout = await sendMoneyToRecipient(
              distribution.adminAmount,
              ADMIN_MOMO_NUMBER,
              `subscription_admin_${newPayment.id}`,
              sanitizeDescription(`Subscription Fee ${planId} ${period}`)
            );
            
            if (adminPayout.success) {
              console.log("✅ Admin subscription fee sent manually");
              
              await Withdrawal.create({
                userId: userId,
                amount: distribution.adminAmount,
                currency: finalCurrency,
                phoneNumber: ADMIN_MOMO_NUMBER,
                status: 'completed',
                paymentId: newPayment.id,
                type: 'subscription_admin_fee',
                description: sanitizeDescription(`Subscription Fee ${planId} ${period}`),
                referenceId: adminPayout.referenceId,
                transactionId: adminPayout.data?.transaction_id,
                completedAt: new Date(),
                metadata: {
                  planId,
                  period,
                  paymentType: 'subscription',
                  customerPaymentId: newPayment.id,
                },
              });
            }
          } else {
            console.log("✅ Lanari Pay handled automatic 100% admin payout for subscription");
            // Create a record of the automatic payout
            await Withdrawal.create({
              userId: userId,
              amount: distribution.adminAmount,
              currency: finalCurrency,
              phoneNumber: ADMIN_MOMO_NUMBER,
              status: 'completed',
              paymentId: newPayment.id,
              type: 'subscription_admin_fee',
              description: sanitizeDescription(`Subscription Fee ${planId} ${period}`),
              referenceId: referenceId,
              transactionId: payment?.data?.gateway_response?.data?.transaction_id,
              completedAt: new Date(),
              metadata: {
                planId,
                period,
                paymentType: 'subscription',
                customerPaymentId: newPayment.id,
                automaticPayout: true,
                split: '0/100',
                payoutViaLanari: true,
              },
            });
          }
        }
      } catch (accessError) {
        console.error("❌ Error granting subscription:", accessError);
      }
    }

    return res.status(200).json({
      success: true,
      message: isGatewaySuccessful 
        ? "Payment successful! Subscription activated." 
        : formattedPhone 
          ? "Payment initiated. Please confirm on your phone."
          : "Subscription created successfully.",
      transactionId: newPayment.id,
      referenceId: referenceId,
      status: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
      distribution: {
        totalAmount: distribution.totalAmount,
        filmmakerAmount: distribution.filmmakerAmount,
        filmmakerPercentage: distribution.filmmakerPercentage,
        adminAmount: distribution.adminAmount,
        adminPercentage: distribution.adminPercentage,
        note: "Subscription: 0% to filmmaker, 100% to admin"
      },
      subscription: {
        planId,
        period,
        startDate,
        endDate,
        amount: finalAmount,
        currency: finalCurrency,
        planName: metadata?.planName || planId,
      },
      payment: {
        transactionId: newPayment.id,
        referenceId: referenceId,
        amount: finalAmount,
        originalAmount: amountNum,
        currency: finalCurrency,
        originalCurrency: currency,
        status: initialStatus,
        paymentMethod: formattedPhone ? "MoMo" : "system",
        gatewayStatus: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
      },
      lanariPayPayout: payoutNumbers ? {
        enabled: true,
        recipients: payoutNumbers,
        note: "Lanari Pay handles automatic 100% admin payout for subscriptions"
      } : { enabled: false },
    });
  } catch (error) {
    console.error("❌ Subscription MoMo Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message,
    });
  }
};

// ====== EXISTING FUNCTIONS (Keep as is, but ensure they use safeParseNumber) ======

export const payWithStripe = async (req, res) => {
  try {
    const { error, value } = paymentValidationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { amount, email, userId, movieId, currency, description, type } = value;

    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found"
      });
    }

    const filmmakerInfo = await getFilmmakerFromContent(movieId, 'movie');
    if (!filmmakerInfo.success) {
      return res.status(400).json({
        success: false,
        message: filmmakerInfo.error
      });
    }

    const { filmmakerId } = filmmakerInfo;

    const filmmakerValidation = await validateFilmmakerSetup(filmmakerId, type);
    if (!filmmakerValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: filmmakerValidation.error
      });
    }

    // 🔥 Ensure amount is a number for Stripe
    const amountNum = safeParseNumber(amount);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountNum * 100), // Stripe expects cents
      currency: (currency || "EUR").toLowerCase(),
      receipt_email: email,
      description: description || `${type.charAt(0).toUpperCase() + type.slice(1)} ${movie.title}`,
      metadata: {
        userId,
        movieId,
        type,
        filmmakerId: filmmakerId,
      },
    });

    const distribution = calculatePaymentDistribution(amountNum);

    const newPayment = await Payment.create({
      amount: amountNum, // Store as number
      currency: currency || "EUR",
      paymentMethod: "Stripe",
      paymentStatus: "pending",
      paymentDate: new Date(),
      userId,
      movieId,
      filmmakerId: filmmakerId,
      type,
      stripePaymentIntentId: paymentIntent.id,
      filmmakerAmount: distribution.filmmakerAmount,
      adminAmount: distribution.adminAmount,
      metadata: {
        filmmakerId: filmmakerId,
        contentTitle: movie.title,
      }
    });

    res.status(200).json({
      success: true,
      message: "Stripe payment intent created successfully",
      clientSecret: paymentIntent.client_secret,
      transactionId: newPayment.id,
      paymentIntentId: paymentIntent.id,
      status: "pending",
      amount: amountNum,
      currency: currency || "EUR",
      type,
      paymentMethod: "Stripe",
      distribution: {
        totalAmount: distribution.totalAmount,
        filmmakerAmount: distribution.filmmakerAmount,
        filmmakerPercentage: distribution.filmmakerPercentage,
        adminAmount: distribution.adminAmount,
        adminPercentage: distribution.adminPercentage,
        filmmakerId: filmmakerId,
      },
      nextStep: "Complete payment on frontend with clientSecret",
    });
  } catch (error) {
    console.error("❌ Stripe Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Stripe Payment Error",
      error: error.message,
    });
  }
};

export const paySubscriptionWithStripe = async (req, res) => {
  try {
    const { error, value } = subscriptionPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { amount, email, userId, currency, planId, period, metadata, phoneNumber } = value;

    const startDate = new Date();
    const endDate = new Date();
    if (period === 'year') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // 🔥 Ensure amount is a number
    const amountNum = safeParseNumber(amount);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountNum * 100),
      currency: (currency || "USD").toLowerCase(),
      receipt_email: email,
      description: `Subscription: ${planId} - ${period}`,
      metadata: {
        userId,
        planId,
        period,
        type: 'subscription_upgrade',
      },
    });

    const newPayment = await Payment.create({
      amount: amountNum, // Store as number
      currency: currency || "USD",
      paymentMethod: "Stripe",
      paymentStatus: "pending",
      paymentDate: new Date(),
      userId,
      type: 'subscription_upgrade',
      planId,
      subscriptionPeriod: period,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      stripePaymentIntentId: paymentIntent.id,
      filmmakerId: null,
      phoneNumber,
      email,
      metadata: {
        ...metadata,
        planId,
        period,
        paymentType: 'subscription'
      }
    });

    res.status(200).json({
      success: true,
      message: "Stripe payment intent created",
      clientSecret: paymentIntent.client_secret,
      transactionId: newPayment.id,
      paymentIntentId: paymentIntent.id,
      subscription: {
        planId,
        period,
        startDate,
        endDate,
        amount: amountNum,
        currency: currency || "USD",
      },
    });
  } catch (error) {
    console.error("❌ Subscription Stripe Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message,
    });
  }
};

// ====== SECURE URL GENERATORS ======

const generateSecureStreamingUrl = async (payment, movie) => {
  try {
    const token = jwt.sign(
      {
        paymentId: payment.id,
        userId: payment.userId,
        movieId: movie.id,
        type: 'stream',
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: payment.accessPeriod,
        expiresAt: payment.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '48h' }
    );

    return `${process.env.API_URL || 'http://localhost:5000'}/api/movies/stream/${payment.id}?token=${token}`;
  } catch (error) {
    console.error('❌ Error generating streaming URL:', error);
    return null;
  }
};

const generateSecureDownloadUrl = async (payment, movie) => {
  try {
    const token = jwt.sign(
      {
        paymentId: payment.id,
        userId: payment.userId,
        movieId: movie.id,
        type: 'download',
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    return `${process.env.API_URL || 'http://localhost:5000'}/api/movies/download/${payment.id}?token=${token}`;
  } catch (error) {
    console.error('❌ Error generating download URL:', error);
    return null;
  }
};

const generateSecureHlsUrl = async (payment, movie) => {
  try {
    const token = jwt.sign(
      {
        paymentId: payment.id,
        userId: payment.userId,
        movieId: movie.id,
        type: 'hls-stream',
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: payment.accessPeriod,
        expiresAt: payment.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '48h' }
    );

    if (movie.hlsUrl) {
      return `${process.env.API_URL || 'http://localhost:5000'}/api/movies/hls/${payment.id}/master.m3u8?token=${token}`;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error generating HLS URL:', error);
    return null;
  }
};

// ====== OTHER EXISTING FUNCTIONS (Keep as is) ======

export const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findByPk(paymentId, {
      include: [
        { 
          association: 'movie', 
          attributes: ['id', 'title', 'price', 'poster'] 
        },
        { 
          association: 'user', 
          attributes: ['id', 'name', 'email'] 
        }
      ]
    });

    if (!payment) {
      return res.status(404).json({ 
        success: false,
        message: "Payment not found" 
      });
    }

    const metadata = payment.metadata || {};
    
    res.status(200).json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentStatus: payment.paymentStatus,
        paymentDate: payment.paymentDate,
        type: payment.type,
        userId: payment.userId,
        movieId: payment.movieId,
        filmmakerId: payment.filmmakerId,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        movie: payment.movie,
        user: payment.user,
        secureDownloadUrl: metadata.secureDownloadUrl || null,
        secureStreamingUrl: metadata.secureStreamingUrl || null,
        secureHlsUrl: metadata.secureHlsUrl || null,
      },
    });
  } catch (error) {
    console.error("❌ Error in getPaymentStatus:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getUserPayments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const payments = await Payment.findAll({
      where: { userId },
      include: [
        {
          association: "movie",
          attributes: ["title", "price", "poster"]
        }
      ],
      order: [["paymentDate", "DESC"]],
      offset: skip,
      limit: limitNum
    });

    const total = await Payment.count({ where: { userId } });

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status } = req.body;

    if (!["succeeded", "failed", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    const payment = await Payment.findByPk(paymentId, {
      include: [{ association: 'movieId' }]
    });

    if (!payment) {
      return res.status(404).json({ 
        success: false,
        message: "Payment not found" 
      });
    }

    payment.paymentStatus = status;
    payment.updatedAt = new Date();
    await payment.save();

    if (status === 'succeeded') {
      await grantMovieAccess(payment);
      
      // 🔥 CRITICAL: Update filmmaker revenue for movie payments
      if (!payment.type.includes('subscription') && payment.type !== 'series_access') {
        await updateFilmmakerRevenue(payment);
      }
      
      const movie = await Movie.findByPk(payment.movieId);
      if (movie) {
        await processAdminPayout(payment, movie);
      }
    }

    res.status(200).json({
      success: true,
      message: `Payment ${status} successfully`,
      payment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;

    const payments = await Payment.findAll({
      where: {
        movieId,
        paymentStatus: "succeeded",
      }
    });

    // 🔥 Use safeParseNumber for calculations
    let totalRevenue = 0;
    payments.forEach(p => {
      totalRevenue += safeParseNumber(p.amount);
    });
    
    const totalSales = payments.length;
    const averageSalePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

    const paymentMethods = {};
    payments.forEach((p) => {
      paymentMethods[p.paymentMethod] = (paymentMethods[p.paymentMethod] || 0) + 1;
    });

    const movie = await Movie.findByPk(movieId);

    res.status(200).json({
      success: true,
      movieId,
      title: movie?.title,
      totalRevenue,
      totalSales,
      averageSalePrice,
      paymentMethods,
      filmmakerShare: totalRevenue * (FILMMAKER_SHARE / 100),
      platformShare: totalRevenue * (ADMIN_SHARE / 100),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// ====== WITHDRAWAL MANAGEMENT FUNCTIONS ======

export const requestWithdrawal = async (req, res) => {
  try {
    const { filmmakerId } = req.params;
    const { error, value } = withdrawalRequestSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { amount, payoutMethod, notes } = value;

    console.log('🔍 Processing withdrawal for filmmaker:', filmmakerId);
    console.log('🔍 Withdrawal data:', { amount, payoutMethod, notes });

    const filmmaker = await User.findByPk(filmmakerId);
    if (!filmmaker) {
      return res.status(404).json({
        success: false,
        message: "Filmmaker not found"
      });
    }

    if (payoutMethod === 'momo' && !filmmaker.filmmmakerMomoPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "MoMo number not configured. Please update your payment method in settings."
      });
    }

    const availableBalance = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
    console.log('💰 Available balance:', availableBalance);

    if (amount < MINIMUM_WITHDRAWAL) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is RWF ${MINIMUM_WITHDRAWAL}`
      });
    }

    if (amount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: RWF ${availableBalance}`
      });
    }

    const withdrawal = await Withdrawal.create({
      userId: filmmakerId,
      amount,
      currency: 'RWF',
      status: 'pending',
      type: 'manual_withdrawal',
      payoutMethod,
      phoneNumber: payoutMethod === 'momo' ? filmmaker.filmmmakerMomoPhoneNumber : null,
      notes,
      metadata: {
        filmmakerName: filmmaker.name,
        filmmakerEmail: filmmaker.email,
        availableBalanceBefore: availableBalance,
        paymentMethodDetails: {
          method: filmmaker.filmmmakerFinancePayoutMethod,
          momoNumber: filmmaker.filmmmakerMomoPhoneNumber,
          payoutMethod: payoutMethod
        }
      }
    });

    // 🔥 Use safeParseNumber for balance updates
    filmmaker.filmmmakerFinancePendingBalance = availableBalance - amount;
    filmmaker.filmmmakerFinanceProcessingBalance = 
      safeParseNumber(filmmaker.filmmmakerFinanceProcessingBalance) + amount;
    await filmmaker.save();

    console.log(`✅ Withdrawal request submitted: ${withdrawal.id} for filmmaker ${filmmakerId}`);

    res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      withdrawal: {
        id: withdrawal.id,
        amount,
        status: withdrawal.status,
        submittedAt: withdrawal.createdAt,
        estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      },
      balance: {
        pending: filmmaker.filmmmakerFinancePendingBalance,
        processing: filmmaker.filmmmakerFinanceProcessingBalance,
        totalEarned: filmmaker.filmmmakerFinanceTotalEarned
      }
    });

  } catch (error) {
    console.error('❌ Error requesting withdrawal:', error);
    res.status(500).json({
      success: false,
      message: "Failed to process withdrawal request",
      error: error.message
    });
  }
};

export const getWithdrawalHistory = async (req, res) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 20, status } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = { userId };
    if (status) where.status = status;

    const withdrawals = await Withdrawal.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
    });

    const total = await Withdrawal.count({ where });

    // 🔥 Use safeParseNumber for sums
    let totalWithdrawn = 0;
    let pendingWithdrawals = 0;
    let processingWithdrawals = 0;
    
    withdrawals.forEach(w => {
      if (w.status === 'completed') {
        totalWithdrawn += safeParseNumber(w.amount);
      } else if (w.status === 'pending') {
        pendingWithdrawals += safeParseNumber(w.amount);
      } else if (w.status === 'processing') {
        processingWithdrawals += safeParseNumber(w.amount);
      }
    });

    res.status(200).json({
      success: true,
      data: {
        withdrawals,
        stats: {
          totalWithdrawn,
          pendingWithdrawals,
          processingWithdrawals,
          totalCount: total
        }
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching withdrawal history:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawal history",
      error: error.message
    });
  }
};

export const getFilmmakerFinance = async (req, res) => {
  try {
    const { userId } = req.user; // This comes from auth middleware
    
    console.log("💰 Getting filmmaker finance for user:", userId);

    // First, get the filmmaker with ALL balance fields
    const filmmaker = await User.findByPk(userId, {
      attributes: [
        'id',
        'name',
        'email',
        'filmmmakerFinancePendingBalance',
        'filmmmakerFinanceAvailableBalance',
        'filmmmakerFinanceProcessingBalance',
        'filmmmakerFinanceTotalEarned',
        'filmmmakerMomoPhoneNumber',
        'filmmmakerFinancePayoutMethod'
      ]
    });

    if (!filmmaker) {
      console.error('❌ Filmmaker not found:', userId);
      return res.status(404).json({
        success: false,
        message: "Filmmaker not found"
      });
    }

    console.log("📊 Filmmaker raw data:", {
      id: filmmaker.id,
      pendingBalance: filmmaker.filmmmakerFinancePendingBalance,
      totalEarned: filmmaker.filmmmakerFinanceTotalEarned,
      availableBalance: filmmaker.filmmmakerFinanceAvailableBalance
    });

    // Calculate ACTUAL earnings from payments table
    const payments = await Payment.findAll({
      where: { 
        filmmakerId: userId, 
        paymentStatus: 'succeeded',
        type: 'movie_watch' // Only count movie payments
      },
      attributes: ['id', 'amount', 'filmmakerAmount', 'adminAmount', 'createdAt']
    });

    let calculatedTotalEarned = 0;
    let calculatedPending = 0;
    
    payments.forEach(p => {
      const filmmakerAmt = safeParseNumber(p.filmmakerAmount);
      calculatedTotalEarned += filmmakerAmt;
      calculatedPending += filmmakerAmt; // All earnings are pending until withdrawn
    });

    console.log("📊 Calculated from payments:", {
      paymentCount: payments.length,
      calculatedTotalEarned,
      calculatedPending
    });

    // If database balances are 0 but we have payments, update the user
    const dbPending = safeParseNumber(filmmaker.filmmmakerFinancePendingBalance);
    const dbTotalEarned = safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned);
    
    if (calculatedTotalEarned > 0 && (dbPending === 0 || dbTotalEarned === 0)) {
      console.log("⚠️ Database balances are 0 but payments exist. Auto-fixing...");
      
      await filmmaker.update({
        filmmmakerFinancePendingBalance: calculatedPending,
        filmmmakerFinanceTotalEarned: calculatedTotalEarned,
        filmmmakerStatsTotalRevenue: calculatedTotalEarned
      });
      
      // Reload the filmmaker
      await filmmaker.reload();
    }

    // Get recent transactions for display
    const recentPayments = await Payment.findAll({
      where: { 
        filmmakerId: userId, 
        paymentStatus: 'succeeded' 
      },
      order: [['paymentDate', 'DESC']],
      limit: 10,
      attributes: ['id', 'amount', 'type', 'paymentDate', 'movieId', 'filmmakerAmount', 'adminAmount'],
      include: [{
        model: Movie,
        as: 'movie',
        attributes: ['title']
      }]
    });

    const recentWithdrawals = await Withdrawal.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'amount', 'status', 'createdAt', 'payoutMethod']
    });

    // Calculate withdrawal stats
    const completedWithdrawals = await Withdrawal.findAll({
      where: { 
        userId, 
        status: 'completed' 
      }
    });

    let totalWithdrawn = 0;
    completedWithdrawals.forEach(w => {
      totalWithdrawn += safeParseNumber(w.amount);
    });

    // Calculate net earnings (total earned minus withdrawn)
    const netEarnings = calculatedTotalEarned - totalWithdrawn;

    res.status(200).json({
      success: true,
      data: {
        balance: {
          pending: safeParseNumber(filmmaker.filmmmakerFinancePendingBalance),
          available: safeParseNumber(filmmaker.filmmmakerFinanceAvailableBalance),
          processing: safeParseNumber(filmmaker.filmmmakerFinanceProcessingBalance),
          totalEarned: safeParseNumber(filmmaker.filmmmakerFinanceTotalEarned),
          netEarnings: Math.max(0, netEarnings), // Can't be negative
          totalWithdrawn: totalWithdrawn
        },
        paymentMethod: {
          currentMethod: filmmaker.filmmmakerFinancePayoutMethod,
          details: {
            momo: filmmaker.filmmmakerMomoPhoneNumber
          }
        },
        recentTransactions: {
          payments: recentPayments,
          withdrawals: recentWithdrawals
        },
        // Debug info
        _debug: {
          paymentCount: payments.length,
          calculatedFromPayments: {
            totalEarned: calculatedTotalEarned,
            pending: calculatedPending
          },
          databaseBalances: {
            pending: dbPending,
            totalEarned: dbTotalEarned
          }
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching filmmaker finance:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch financial information",
      error: error.message
    });
  }
};

export const getAllWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const withdrawals = await Withdrawal.findAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
    });

    const total = await Withdrawal.count({ where });

    const stats = {
      total: await Withdrawal.count(),
      pending: await Withdrawal.count({ where: { status: 'pending' } }),
      processing: await Withdrawal.count({ where: { status: 'processing' } }),
      completed: await Withdrawal.count({ where: { status: 'completed' } }),
      rejected: await Withdrawal.count({ where: { status: 'rejected' } }),
      totalAmount: await Withdrawal.sum('amount', { where: { status: 'completed' } }) || 0,
    };

    res.status(200).json({
      success: true,
      data: {
        withdrawals,
        stats
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching all withdrawals:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawals",
      error: error.message
    });
  }
};

export const processWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { error, value } = processWithdrawalSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.details.map((d) => d.message).join(", "),
      });
    }

    const { action, reason } = value;

    const withdrawal = await Withdrawal.findByPk(withdrawalId, {
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found"
      });
    }

    const filmmaker = withdrawal.user;
    if (!filmmaker) {
      return res.status(404).json({
        success: false,
        message: "Filmmaker not found"
      });
    }

    switch (action) {
      case 'approve':
        if (withdrawal.status !== 'pending') {
          return res.status(400).json({
            success: false,
            message: "Withdrawal is not in pending status"
          });
        }

        const result = await sendMoneyToRecipient(
          withdrawal.amount,
          withdrawal.phoneNumber || filmmaker.filmmmakerMomoPhoneNumber,
          `withdrawal_${withdrawalId}`,
          sanitizeDescription(`Withdrawal for ${filmmaker.name}`)
        );

        if (result.success) {
          withdrawal.status = 'processing';
          withdrawal.referenceId = result.referenceId;
          withdrawal.transactionId = result.data?.transaction_id;
          withdrawal.processedAt = new Date();
          await withdrawal.save();

          filmmaker.filmmmakerFinanceProcessingBalance = 
            Math.max(0, safeParseNumber(filmmaker.filmmmakerFinanceProcessingBalance) - withdrawal.amount);
          filmmaker.filmmmakerFinanceAvailableBalance = 
            safeParseNumber(filmmaker.filmmmakerFinanceAvailableBalance) + withdrawal.amount;
          await filmmaker.save();

          res.json({
            success: true,
            message: "Withdrawal approved and processing",
            withdrawal
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Failed to send payment",
            error: result.error
          });
        }
        break;

      case 'complete':
        if (withdrawal.status !== 'processing') {
          return res.status(400).json({
            success: false,
            message: "Withdrawal is not in processing status"
          });
        }

        withdrawal.status = 'completed';
        withdrawal.completedAt = new Date();
        await withdrawal.save();

        res.json({
          success: true,
          message: "Withdrawal marked as completed",
          withdrawal
        });
        break;

      case 'reject':
        if (withdrawal.status !== 'pending') {
          return res.status(400).json({
            success: false,
            message: "Withdrawal is not in pending status"
          });
        }

        if (!reason) {
          return res.status(400).json({
            success: false,
            message: "Reason is required for rejection"
          });
        }

        withdrawal.status = 'rejected';
        withdrawal.failureReason = reason;
        withdrawal.rejectedAt = new Date();
        
        filmmaker.filmmmakerFinancePendingBalance = 
          safeParseNumber(filmmaker.filmmmakerFinancePendingBalance) + withdrawal.amount;
        filmmaker.filmmmakerFinanceProcessingBalance = 
          Math.max(0, safeParseNumber(filmmaker.filmmmakerFinanceProcessingBalance) - withdrawal.amount);
        
        await Promise.all([withdrawal.save(), filmmaker.save()]);

        res.json({
          success: true,
          message: "Withdrawal rejected",
          withdrawal
        });
        break;

      default:
        res.status(400).json({
          success: false,
          message: "Invalid action"
        });
    }
  } catch (error) {
    console.error('❌ Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: "Failed to process withdrawal",
      error: error.message
    });
  }
};

export const getWithdrawalDetails = async (req, res) => {
  try {
    const { withdrawalId } = req.params;

    const withdrawal = await Withdrawal.findByPk(withdrawalId, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'filmmmakerMomoPhoneNumber']
      }]
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found",
      });
    }

    res.status(200).json({
      success: true,
      data: withdrawal,
    });
  } catch (error) {
    console.error('❌ Error fetching withdrawal details:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const getSeriesPricing = async (req, res) => {
  try {
    const { seriesId } = req.params;

    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== 'series') {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    const episodes = await Movie.findAll({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: 'approved'
      },
      attributes: ['id', 'title', 'episodeTitle', 'seasonNumber', 'episodeNumber', 'viewPrice']
    });

    const totalIndividualPrice = episodes.reduce((sum, ep) => sum + safeParseNumber(ep.viewPrice), 0);
    
    const pricingTiers = series.pricingTiers || {
      "24h": totalIndividualPrice * 0.2,
      "7d": totalIndividualPrice * 0.5,
      "30d": totalIndividualPrice * 1.5,
      "90d": totalIndividualPrice * 3,
      "180d": totalIndividualPrice * 5,
      "365d": totalIndividualPrice * 8
    };

    const savings = {};
    Object.keys(pricingTiers).forEach(period => {
      savings[period] = totalIndividualPrice - pricingTiers[period];
    });

    let bestValue = null;
    if (Object.keys(savings).length > 0) {
      bestValue = Object.keys(savings).reduce((a, b) => 
        savings[a] > savings[b] ? a : b
      );
    }

    res.status(200).json({
      success: true,
      series: {
        id: series.id,
        title: series.title,
        overview: series.overview,
        poster: series.poster,
        backdrop: series.backdrop,
        totalEpisodes: episodes.length,
        totalSeasons: series.totalSeasons,
      },
      episodes: episodes.map(ep => ({
        id: ep.id,
        title: ep.title,
        episodeTitle: ep.episodeTitle,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        individualPrice: safeParseNumber(ep.viewPrice),
        currency: series.currency || 'RWF',
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
    });
  } catch (error) {
    console.error("❌ Error fetching series pricing:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
      error: error.message,
    });
  }
};

export const checkSeriesAccess = async (req, res) => {
  try {
    const { seriesId, userId } = req.params;

    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== 'series') {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    const seriesAccess = await Payment.findOne({
      where: {
        userId,
        seriesId,
        type: 'series_access',
        paymentStatus: 'succeeded',
        expiresAt: { $gt: new Date() }
      },
      order: [['expiresAt', 'DESC']]
    });

    const user = await User.findByPk(userId);
    const hasSubscriptionAccess = user?.subscription?.status === 'active' && 
                                 new Date(user.subscription.endDate) > new Date();

    const hasAccess = !!(seriesAccess || hasSubscriptionAccess);

    let accessDetails = null;
    if (seriesAccess) {
      const now = new Date();
      const expiry = new Date(seriesAccess.expiresAt);
      const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      
      accessDetails = {
        type: 'series_purchase',
        accessPeriod: seriesAccess.accessPeriod,
        expiresAt: seriesAccess.expiresAt,
        daysRemaining: Math.max(0, daysRemaining),
        purchaseDate: seriesAccess.paymentDate,
        transactionId: seriesAccess.id,
      };
    } else if (hasSubscriptionAccess) {
      accessDetails = {
        type: 'subscription',
        plan: user.subscription.planName,
        expiresAt: user.subscription.endDate,
        daysRemaining: Math.ceil((new Date(user.subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)),
      };
    }

    let accessibleEpisodes = [];
    if (hasAccess) {
      accessibleEpisodes = await Movie.findAll({
        where: {
          seriesId: series.id,
          contentType: 'episode',
          status: 'approved'
        },
        attributes: ['id', 'title', 'episodeTitle', 'seasonNumber', 'episodeNumber'],
        order: [
          ['seasonNumber', 'ASC'],
          ['episodeNumber', 'ASC']
        ]
      });
    }

    res.status(200).json({
      success: true,
      hasAccess,
      accessDetails,
      series: {
        id: series.id,
        title: series.title,
        totalEpisodes: accessibleEpisodes.length,
      },
      accessibleEpisodes: hasAccess ? accessibleEpisodes : [],
    });
  } catch (error) {
    console.error("❌ Error checking series access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check access",
      error: error.message,
    });
  }
};

// ====== STREAMING FUNCTIONS ======

export const getSecureStreamUrl = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { userId } = req.user;

    const hasAccess = await checkUserAccessToMovie(userId, movieId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this movie'
      });
    }

    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    const token = jwt.sign(
      {
        userId,
        movieId,
        type: 'stream',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
      },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    const secureUrl = `${process.env.API_URL}/api/movies/stream/${movieId}?token=${token}`;
    
    res.json({
      success: true,
      url: secureUrl,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

  } catch (error) {
    console.error('Error generating secure URL:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

export const streamMovie = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { token } = req.query;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (new Date(decoded.expiresAt) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Access token has expired'
      });
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment || payment.paymentStatus !== 'succeeded') {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired payment'
      });
    }

    const movie = await Movie.findByPk(payment.movieId);
    if (!movie || !movie.videoUrl) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found or unavailable'
      });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${movie.title}.mp4"`);
    
    const videoStream = await getVideoStreamFromStorage(movie.videoUrl);
    videoStream.pipe(res);

  } catch (error) {
    console.error('Error streaming movie:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error streaming movie'
    });
  }
};

// ====== HELPER FUNCTIONS FOR URL GENERATION ======

const checkUserAccessToMovie = async (userId, movieId) => {
  try {
    const userAccess = await UserAccess.findOne({
      where: {
        userId,
        movieId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      }
    });

    return !!userAccess;
  } catch (error) {
    console.error('Error checking user access:', error);
    return false;
  }
};

const getVideoStreamFromStorage = async (videoUrl) => {
  return require('fs').createReadStream(videoUrl);
};

export default {
  payWithMoMo,
  paySeriesWithMoMo,
  payWithStripe,
  paySubscriptionWithMoMo,
  paySubscriptionWithStripe,
  getPaymentStatus,
  getUserPayments,
  confirmPayment,
  getMovieAnalytics,
  checkMoMoPaymentStatus,
  lanariPayWebhook,
  requestWithdrawal,
  getWithdrawalHistory,
  getFilmmakerFinance,
  getAllWithdrawals,
  processWithdrawal,
  getWithdrawalDetails,
  getSeriesPricing,
  checkSeriesAccess,
  getSecureStreamUrl,
  streamMovie
};