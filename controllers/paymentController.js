import stripe from "../config/stripe.js";
import  { requestToPay,checkPaymentStatus, sendMoneyToRecipient } from "../utils/momoHelper.js";
import Payment from "../models/Payment.model.js";
import Movie from "../models/Movie.model.js";
import User from "../models/User.modal.js";
import jwt from "jsonwebtoken";
import Joi from "joi";
import Withdrawal from "../models/withdrawal.js";
import { calculateExpiryDate, getAccessPeriodLabel } from "../utils/dateUtils.js";

// ====== PAYMENT DISTRIBUTION CONFIGURATION ======
const FILMMAKER_SHARE = parseFloat(process.env.FILMMAKER_SHARE_PERCENTAGE) || 70;
const ADMIN_SHARE = parseFloat(process.env.ADMIN_SHARE_PERCENTAGE) || 30;
const ADMIN_MOMO_NUMBER = process.env.ADMIN_MOMO_NUMBER || "0790019543";

// 🔥 NEW: Subscription payment goes 100% to admin
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
  type: Joi.string().valid("watch", "download","subscription_upgrade","subscription_renewal", "series_access").required(),
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
  type: Joi.string().valid("subscription_upgrade","subscription_renewal").required(),
  description: Joi.string().max(500),
  filmmakersAmount: Joi.number().positive().optional(),
  adminAmount: Joi.number().positive().optional(),
  metadata: Joi.object().optional(),
});

// ====== NEW: SERIES PAYMENT VALIDATION ======
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

// ====== HELPER FUNCTIONS ======

/**
 * 🔥 NEW: Sanitize description for Lanari Pay API
 * Removes special characters and formats properly
 */
const sanitizeDescription = (description) => {
  if (!description) return '';
  
  // Remove special characters, keep only letters, numbers, and spaces
  const sanitized = description
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, ' ')             // Replace multiple spaces with single space
    .trim();                          // Remove leading/trailing spaces
  
  return sanitized;
};

/**
 * Calculate payment distribution based on payment type
 */
const calculatePaymentDistribution = (totalAmount, paymentType = 'movie') => {
  let filmmakerShare, adminShare;
  
  if (paymentType.includes('subscription') || paymentType === 'series_access') {
    // Subscription and series access payments go 100% to admin
    filmmakerShare = SUBSCRIPTION_FILMMAKER_SHARE;
    adminShare = SUBSCRIPTION_ADMIN_SHARE;
  } else {
    // Regular movie payments use normal shares
    filmmakerShare = FILMMAKER_SHARE;
    adminShare = ADMIN_SHARE;
  }

  const filmmakerAmount = (totalAmount * filmmakerShare) / 100;
  const adminAmount = (totalAmount * adminShare) / 100;

  return {
    totalAmount,
    filmmakerAmount: parseFloat(filmmakerAmount.toFixed(2)),
    adminAmount: parseFloat(adminAmount.toFixed(2)),
    filmmakerPercentage: filmmakerShare,
    adminPercentage: adminShare,
    paymentType: paymentType,
  };
};

/**
 * Grant movie access to user after successful payment
 */
const grantMovieAccess = async (payment) => {
  try {
    const user = await User.findByPk(payment.userId);
    const movie = await Movie.findByPk(payment.movieId);

    if (!user || !movie) {
      throw new Error('User or content not found');
    }

    // Handle series access
    if (payment.type === 'series_access') {
      return await grantSeriesAccess(payment, user);
    }

    // Handle movie/episode access
    if (payment.type === 'watch') {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      user.watchlist = user.watchlist || [];
      user.watchlist.push({
        movie: movie.id,
        grantedAt: new Date(),
        expiresAt: expiresAt,
        transactionId: payment.id,
      });
    } else if (payment.type === 'download') {
      user.downloads = user.downloads || [];
      user.downloads.push({
        movie: movie.id,
        grantedAt: new Date(),
        transactionId: payment.id,
      });
    }

    await user.save();

    movie.totalViews = (movie.totalViews || 0) + 1;
    movie.totalRevenue = (movie.totalRevenue || 0) + payment.amount;
    await movie.save();

    return { success: true };
  } catch (error) {
    console.error('❌ Error granting access:', error);
    throw error;
  }
};

/**
 * 🔥 NEW: Grant Series Access to user after successful payment
 */
const grantSeriesAccess = async (payment, user) => {
  try {
    const series = await Movie.findByPk(payment.seriesId);
    if (!series || series.contentType !== 'series') {
      throw new Error('Series not found');
    }

    // Calculate expiry date based on access period
    const expiryDate = calculateExpiryDate(payment.accessPeriod);

    // Store series access in user
    user.seriesAccess = user.seriesAccess || [];
    
    // Check if user already has access to this series
    const existingAccessIndex = user.seriesAccess.findIndex(
      access => access.seriesId === series.id && access.status === 'active'
    );

    if (existingAccessIndex >= 0) {
      // Update existing access (extend expiry)
      user.seriesAccess[existingAccessIndex] = {
        ...user.seriesAccess[existingAccessIndex],
        accessPeriod: payment.accessPeriod,
        expiresAt: expiryDate,
        lastUpdated: new Date(),
        transactionId: payment.id,
      };
    } else {
      // Add new access
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

    // Get all episodes in the series
    const episodes = await Movie.findAll({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: 'approved'
      },
      attributes: ['id']
    });

    // Create episode access records
    const accessPromises = episodes.map(episode => {
      return Payment.create({
        amount: 0, // Episode access is free with series purchase
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentStatus: 'succeeded',
        paymentDate: new Date(),
        userId: payment.userId,
        movieId: episode.id,
        type: 'series_episode',
        seriesId: series.id,
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

    await Promise.all(accessPromises);
    await user.save();

    // Update series revenue
    series.totalRevenue = (series.totalRevenue || 0) + payment.amount;
    series.seriesRevenue = (series.seriesRevenue || 0) + payment.amount;
    series.totalViews = (series.totalViews || 0) + 1;
    await series.save();

    console.log(`✅ Series access granted: ${series.title} for user ${user.id}`);
    
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
 * Grant subscription access to user after successful payment
 */
const grantSubscriptionAccess = async (payment) => {
  try {
    const user = await User.findByPk(payment.userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get plan details from metadata
    const planId = payment.planId;
    const metadata = payment.metadata || {};
    
    // Define plan configurations
    const planConfigs = {
      'basic': { maxDevices: 1, isUpgraded: true },
      'pro': { maxDevices: 4, isUpgraded: true },
      'enterprise': { maxDevices: 10, isUpgraded: true }
    };

    const planConfig = planConfigs[planId] || planConfigs['pro'];
    
    // Update user subscription
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
    
    // Update active devices if needed
    if (user.activeDevices && user.activeDevices.length > planConfig.maxDevices) {
      user.activeDevices = user.activeDevices.slice(0, planConfig.maxDevices);
    }

    await user.save();

    console.log(`✅ Subscription granted: ${planId} for user ${user.id}`);
    
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
 * Update filmmaker revenue after successful payment
 */
const updateFilmmakerRevenue = async (movieId, filmmakerAmount, totalAmount) => {
  try {
    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      console.error('Content not found');
      return;
    }

    movie.totalRevenue = (movie.totalRevenue || 0) + totalAmount;
    await movie.save();

    const filmmaker = await User.findByPk(movie.filmmakerId);
    if (filmmaker) {
      filmmaker.filmmmakerFinancePendingBalance =
        (filmmaker.filmmmakerFinancePendingBalance || 0) + filmmakerAmount;

      filmmaker.filmmmakerStatsTotalRevenue =
        (filmmaker.filmmmakerStatsTotalRevenue || 0) + filmmakerAmount;

      await filmmaker.save();
    }
  } catch (error) {
    console.error('❌ Error updating filmmaker revenue:', error);
  }
};

/**
 * 🔥 NEW: Process automatic withdrawals to filmmaker and admin
 */
const processAutomaticWithdrawals = async (payment, movie) => {
  try {
    console.log("💸 Starting automatic withdrawals for payment:", payment.id);

    const filmmaker = await User.findByPk(movie.filmmakerId);
    if (!filmmaker) {
      console.error('❌ Filmmaker not found');
      return { success: false, error: 'Filmmaker not found' };
    }

    const filmmakerMoMoNumber = filmmaker.filmmmakerMomoPhoneNumber;
    if (!filmmakerMoMoNumber) {
      console.warn('⚠️ Filmmaker has no MoMo number configured');
      return { success: false, error: 'Filmmaker MoMo number not configured' };
    }

    const distribution = calculatePaymentDistribution(payment.amount, payment.type);

    // 🔥 CREATE WITHDRAWAL RECORDS
    const filmmakerWithdrawal = await Withdrawal.create({
      userId: filmmaker.id,
      amount: distribution.filmmakerAmount,
      currency: payment.currency || 'RWF',
      phoneNumber: filmmakerMoMoNumber,
      status: 'processing',
      paymentId: payment.id,
      type: payment.type.includes('subscription') || payment.type === 'series_access' ? 'subscription_filmmaker_earning' : 'filmmaker_earning',
      description: sanitizeDescription(`Earnings ${payment.type} ${movie.title}`),
      metadata: {
        movieId: movie.id,
        movieTitle: movie.title,
        paymentType: payment.type,
        customerPaymentId: payment.id,
        contentType: movie.contentType,
        seriesId: movie.seriesId,
      },
    });

    const adminWithdrawal = await Withdrawal.create({
      userId: payment.userId,
      amount: distribution.adminAmount,
      currency: payment.currency || 'RWF',
      phoneNumber: ADMIN_MOMO_NUMBER,
      status: 'processing',
      paymentId: payment.id,
      type: payment.type.includes('subscription') || payment.type === 'series_access' ? 'subscription_admin_fee' : 'admin_fee',
      description: sanitizeDescription(`Platform Fee ${payment.type} ${movie.title}`),
      metadata: {
        movieId: movie.id,
        movieTitle: movie.title,
        paymentType: payment.type,
        customerPaymentId: payment.id,
        contentType: movie.contentType,
        seriesId: movie.seriesId,
      },
    });

    console.log("📝 Withdrawal records created:", {
      filmmaker: filmmakerWithdrawal.id,
      admin: adminWithdrawal.id,
    });

    // 🔥 PROCESS FILMMAKER PAYOUT (only for non-subscription/non-series payments)
    if (distribution.filmmakerAmount > 0 && !payment.type.includes('subscription') && payment.type !== 'series_access') {
      console.log("💰 Processing filmmaker payout...");
      const filmmakerPayout = await sendMoneyToRecipient(
        distribution.filmmakerAmount,
        filmmakerMoMoNumber,
        `filmmaker_${payment.id}`,
        sanitizeDescription(`Earnings ${payment.type} ${movie.title}`)
      );

      if (filmmakerPayout.success) {
        filmmakerWithdrawal.status = 'completed';
        filmmakerWithdrawal.referenceId = filmmakerPayout.referenceId;
        filmmakerWithdrawal.transactionId = filmmakerPayout.data?.transaction_id;
        filmmakerWithdrawal.completedAt = new Date();
        await filmmakerWithdrawal.save();

        // Update filmmaker balance
        filmmaker.filmmmakerFinancePendingBalance =
          Math.max(0, (filmmaker.filmmmakerFinancePendingBalance || 0) - distribution.filmmakerAmount);
        filmmaker.filmmmakerFinanceAvailableBalance =
          (filmmaker.filmmmakerFinanceAvailableBalance || 0) + distribution.filmmakerAmount;
        await filmmaker.save();

        console.log("✅ Filmmaker payout successful:", filmmakerPayout.referenceId);
      } else {
        filmmakerWithdrawal.status = 'failed';
        filmmakerWithdrawal.failureReason = filmmakerPayout.error;
        await filmmakerWithdrawal.save();
        console.error("❌ Filmmaker payout failed:", filmmakerPayout.error);
      }
    } else {
      // Mark as completed if no payout needed
      filmmakerWithdrawal.status = 'completed';
      await filmmakerWithdrawal.save();
    }

    // 🔥 PROCESS ADMIN PAYOUT
    console.log("💰 Processing admin payout...");
    const adminPayout = await sendMoneyToRecipient(
      distribution.adminAmount,
      ADMIN_MOMO_NUMBER,
      `admin_${payment.id}`,
      sanitizeDescription(`Platform Fee ${payment.type} ${movie.title}`)
    );

    if (adminPayout.success) {
      adminWithdrawal.status = 'completed';
      adminWithdrawal.referenceId = adminPayout.referenceId;
      adminWithdrawal.transactionId = adminPayout.data?.transaction_id;
      adminWithdrawal.completedAt = new Date();
      await adminWithdrawal.save();
      console.log("✅ Admin payout successful:", adminPayout.referenceId);
    } else {
      adminWithdrawal.status = 'failed';
      adminWithdrawal.failureReason = adminPayout.error;
      await adminWithdrawal.save();
      console.error("❌ Admin payout failed:", adminPayout.error);
    }

    return {
      success: true,
      filmmaker: {
        withdrawalId: filmmakerWithdrawal.id,
        status: filmmakerWithdrawal.status,
        amount: distribution.filmmakerAmount,
        referenceId: filmmakerWithdrawal.referenceId,
      },
      admin: {
        withdrawalId: adminWithdrawal.id,
        status: adminWithdrawal.status,
        amount: distribution.adminAmount,
        referenceId: adminWithdrawal.referenceId,
      },
    };
  } catch (error) {
    console.error('❌ Error processing automatic withdrawals:', error);
    return { success: false, error: error.message };
  }
};

// ====== WEBHOOK & STATUS FUNCTIONS ======

/**
 * Webhook for Lanari Pay notifications
 */
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

    // Find payment by reference ID
    const payment = await Payment.findOne({ 
      where: { referenceId: transaction_id || reference_id } 
    });

    if (!payment) {
      console.warn('⚠️ Payment not found for webhook:', transaction_id);
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const newStatus = payment_status || status;

    // Update payment status
    if (newStatus === 'success' || newStatus === 'completed') {
      payment.paymentStatus = 'succeeded';
      payment.updatedAt = new Date();
      await payment.save();

      // Grant access based on payment type
      if (payment.type === 'series_access') {
        await grantMovieAccess(payment);
      } else if (payment.type === 'subscription_upgrade' || payment.type === 'subscription_renewal') {
        await grantSubscriptionAccess(payment);
      } else {
        await grantMovieAccess(payment);
      }

      // Update filmmaker revenue (if applicable)
      if (!payment.type.includes('subscription') && payment.type !== 'series_access') {
        await updateFilmmakerRevenue(
          payment.movieId || payment.seriesId,
          payment.filmmakerAmount,
          payment.amount
        );
      }

      // Process payouts
      const content = await Movie.findByPk(payment.movieId || payment.seriesId);
      if (content) {
        await processAutomaticWithdrawals(payment, content);
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

/**
 * Process MoMo Payment for Movie/Episode/Series
 */
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
      return res.status(404).json({ 
        success: false,
        message: "Content not found" 
      });
    }

    // For series access, validate it's a series
    if (type === 'series_access' && movie.contentType !== 'series') {
      return res.status(400).json({
        success: false,
        message: "Series access can only be purchased for series content"
      });
    }

    // For episode access, check if parent series exists
    if (movie.contentType === 'episode' && type === 'watch') {
      const series = await Movie.findByPk(movie.seriesId);
      if (series && series.pricingTiers) {
        console.log("ℹ️ Episode has parent series with series pricing available");
      }
    }

    const distribution = calculatePaymentDistribution(amount, type);

    let finalAmount = amount;
    let finalCurrency = currency;
    
    if (currency !== "RWF") {
      const exchangeRates = { USD: 1200, EUR: 1300, GBP: 1500 };
      if (exchangeRates[currency]) {
        finalAmount = Math.round(amount * exchangeRates[currency]);
        finalCurrency = "RWF";
      }
    }

    let formattedPhone = phoneNumber.replace(/[+\s]/g, '');
    if (formattedPhone.startsWith("250")) {
      formattedPhone = "0" + formattedPhone.substring(3);
    } else if (!formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone;
    }

    // 🔥 SANITIZE DESCRIPTION
    const rawDescription = description || `${type} ${movie.title}`;
    const sanitizedDescription = sanitizeDescription(rawDescription);

    const payment = await requestToPay(
      finalAmount,
      formattedPhone,
      userId,
      sanitizedDescription, // ✅ Clean description without special characters
      finalCurrency
    );

    if (payment.success) {
      const gatewayStatus = payment.data?.gateway_response?.data?.status;
      const isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
      const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

      // Create payment metadata
      const metadata = {
        contentType: movie.contentType,
        title: movie.title,
        seriesId: movie.seriesId,
        seriesTitle: movie.seriesTitle,
        seasonNumber: movie.seasonNumber,
        episodeNumber: movie.episodeNumber,
        accessPeriod: accessPeriod,
        expiresAt: accessPeriod && accessPeriod !== 'one-time' ? 
          calculateExpiryDate(accessPeriod) : null
      };

      // Add secure URLs for movie/episode content
      if (type === 'watch') {
        metadata.secureStreamingUrl = await generateSecureStreamingUrl({
          id: null,
          userId,
          movieId,
          type: type,
          accessPeriod: accessPeriod
        }, movie);
        
        if (movie.hlsUrl) {
          metadata.secureHlsUrl = await generateSecureHlsUrl({
            id: null,
            userId,
            movieId,
            type: type,
            accessPeriod: accessPeriod
          }, movie);
        }
      } else if (type === 'download') {
        metadata.secureDownloadUrl = await generateSecureDownloadUrl({
          id: null,
          userId,
          movieId,
          type: type,
          accessPeriod: accessPeriod
        }, movie);
      }

      const newPayment = await Payment.create({
        amount: finalAmount,
        originalAmount: amount,
        originalCurrency: currency,
        currency: finalCurrency,
        paymentMethod: "MoMo",
        paymentMethodProvider: "LanariPay",
        paymentStatus: initialStatus,
        paymentDate: new Date(),
        userId,
        movieId,
        type: type === 'series_access' ? 'series_access' : `${contentType || 'movie'}_${type}`,
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: accessPeriod,
        expiresAt: accessPeriod && accessPeriod !== 'one-time' ? 
          calculateExpiryDate(accessPeriod) : null,
        referenceId: payment.referenceId,
        filmmakerAmount: distribution.filmmakerAmount,
        adminAmount: distribution.adminAmount,
        exchangeRate: currency !== "RWF" ? (finalAmount / amount) : 1,
        financialTransactionId: payment.data?.gateway_response?.data?.transaction_id,
        phoneNumber: formattedPhone,
        metadata
      });

      // Update secure URLs with actual payment ID
      if (metadata.secureStreamingUrl) {
        newPayment.metadata.secureStreamingUrl = await generateSecureStreamingUrl(newPayment, movie);
      }
      if (metadata.secureDownloadUrl) {
        newPayment.metadata.secureDownloadUrl = await generateSecureDownloadUrl(newPayment, movie);
      }
      if (metadata.secureHlsUrl) {
        newPayment.metadata.secureHlsUrl = await generateSecureHlsUrl(newPayment, movie);
      }
      
      await newPayment.save();

      let withdrawalResults = null;
      let accessResults = null;

      if (isGatewaySuccessful) {
        try {
          accessResults = await grantMovieAccess(newPayment);
          
          if (!type.includes('subscription') && type !== 'series_access') {
            await updateFilmmakerRevenue(newPayment.movieId, newPayment.filmmakerAmount, newPayment.amount);
          }
          
          withdrawalResults = await processAutomaticWithdrawals(newPayment, movie);
        } catch (error) {
          console.error("❌ Post-payment error:", error);
        }
      }

      return res.status(200).json({
        success: true,
        message: isGatewaySuccessful 
          ? "Payment successful! Access granted." 
          : "Payment initiated. Please confirm.",
        transactionId: newPayment.id,
        referenceId: payment.referenceId,
        status: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
        access: accessResults,
        withdrawals: withdrawalResults,
        distribution,
        contentType: movie.contentType,
        seriesId: movie.seriesId,
        accessPeriod: accessPeriod,
        expiresAt: newPayment.expiresAt,
        // Return secure URLs
        secureDownloadUrl: newPayment.metadata?.secureDownloadUrl,
        secureStreamingUrl: newPayment.metadata?.secureStreamingUrl,
        secureHlsUrl: newPayment.metadata?.secureHlsUrl,
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
 * 🔥 NEW: Process Series Access Payment with MoMo
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

    // Validate series exists
    const series = await Movie.findByPk(seriesId);
    if (!series || series.contentType !== 'series') {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    // Get series pricing
    const pricingTiers = series.pricingTiers || {};
    const requestedPrice = parseFloat(amount);
    const tierPrice = pricingTiers[accessPeriod];

    // Validate price matches tier
    let finalRequestedAmount = requestedPrice;
    if (tierPrice !== undefined && Math.abs(tierPrice - requestedPrice) > 0.01) {
      console.warn(`⚠️ Price mismatch: requested ${requestedPrice}, tier price ${tierPrice}`);
      finalRequestedAmount = tierPrice;
    }

    const distribution = calculatePaymentDistribution(finalRequestedAmount, 'series_access');

    let finalAmount = finalRequestedAmount;
    let finalCurrency = currency;
    
    if (currency !== "RWF") {
      const exchangeRates = { USD: 1200, EUR: 1300, GBP: 1500 };
      if (exchangeRates[currency]) {
        finalAmount = Math.round(finalRequestedAmount * exchangeRates[currency]);
        finalCurrency = "RWF";
      }
    }

    let formattedPhone = phoneNumber.replace(/[+\s]/g, '');
    if (formattedPhone.startsWith("250")) {
      formattedPhone = "0" + formattedPhone.substring(3);
    } else if (!formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone;
    }

    // 🔥 SANITIZE DESCRIPTION
    const rawDescription = description || `Series Access ${series.title} ${getAccessPeriodLabel(accessPeriod)}`;
    const sanitizedDescription = sanitizeDescription(rawDescription);

    const payment = await requestToPay(
      finalAmount,
      formattedPhone,
      userId,
      sanitizedDescription, // ✅ Clean description
      finalCurrency
    );

    if (payment.success) {
      const gatewayStatus = payment.data?.gateway_response?.data?.status;
      const isGatewaySuccessful = gatewayStatus === "SUCCESSFUL";
      const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

      // Calculate expiry date
      const expiresAt = calculateExpiryDate(accessPeriod);

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
        type: 'series_access',
        contentType: 'series',
        accessPeriod: accessPeriod,
        expiresAt: expiresAt,
        referenceId: payment.referenceId,
        filmmakerAmount: distribution.filmmakerAmount,
        adminAmount: distribution.adminAmount,
        exchangeRate: currency !== "RWF" ? (finalAmount / finalRequestedAmount) : 1,
        financialTransactionId: payment.data?.gateway_response?.data?.transaction_id,
        phoneNumber: formattedPhone,
        metadata: {
          seriesTitle: series.title,
          accessPeriod: accessPeriod,
          accessPeriodLabel: getAccessPeriodLabel(accessPeriod),
          expiresAt: expiresAt,
          seriesEpisodes: await Movie.count({
            where: {
              seriesId: series.id,
              contentType: 'episode',
              status: 'approved'
            }
          })
        }
      });

      let withdrawalResults = null;
      let accessResults = null;

      if (isGatewaySuccessful) {
        try {
          accessResults = await grantSeriesAccess(newPayment);
          withdrawalResults = await processAutomaticWithdrawals(newPayment, series);
        } catch (error) {
          console.error("❌ Post-payment error:", error);
        }
      }

      // Get episodes for response
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
        withdrawals: withdrawalResults,
        distribution,
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
          episodes: episodes.slice(0, 10), // Return first 10 episodes
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

/**
 * 🔥 NEW: Get Series Pricing Information
 * GET /api/payments/series/:seriesId/pricing
 */
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

    // Get all episodes
    const episodes = await Movie.findAll({
      where: {
        seriesId: series.id,
        contentType: 'episode',
        status: 'approved'
      },
      attributes: ['id', 'title', 'episodeTitle', 'seasonNumber', 'episodeNumber', 'viewPrice']
    });

    // Calculate individual episode pricing
    const totalIndividualPrice = episodes.reduce((sum, ep) => sum + (ep.viewPrice || 0), 0);
    
    // Get series pricing tiers
    const pricingTiers = series.pricingTiers || {
      "24h": totalIndividualPrice * 0.2,
      "7d": totalIndividualPrice * 0.5,
      "30d": totalIndividualPrice * 1.5,
      "90d": totalIndividualPrice * 3,
      "180d": totalIndividualPrice * 5,
      "365d": totalIndividualPrice * 8
    };

    // Calculate savings
    const savings = {};
    Object.keys(pricingTiers).forEach(period => {
      savings[period] = totalIndividualPrice - pricingTiers[period];
    });

    // Find best value (most savings)
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
        individualPrice: ep.viewPrice,
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

/**
 * 🔥 NEW: Check Series Access Status
 * GET /api/payments/series/:seriesId/access/:userId
 */
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

    // Check for active series access payments
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

    // Check for subscription access
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

    // Get episodes user has access to
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

// ====== SECURE URL GENERATORS ======

/**
 * Generate secure streaming URL with token
 */
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

/**
 * Generate secure download URL with token
 */
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

/**
 * Generate secure HLS URL with token
 */
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

// ====== EXISTING FUNCTIONS (Keep as is with minor updates) ======

/**
 * Process Stripe Payment
 * POST /api/payments/stripe
 */
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

    // Verify movie exists
    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found"
      });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // amount in cents
      currency: (currency || "EUR").toLowerCase(),
      receipt_email: email,
      description: description || `${type.charAt(0).toUpperCase() + type.slice(1)} ${movie.title}`,
      metadata: {
        userId,
        movieId,
        type,
        filmamakerId: movie.filmmaker?.filmamakerId?.id || movie.filmmaker?.filmamakerId,
      },
    });

    // Calculate distribution
    const distribution = calculatePaymentDistribution(amount);

    // Save payment record
    const newPayment = new Payment({
      amount,
      currency: currency || "EUR",
      paymentMethod: "Stripe",
      paymentStatus: "pending",
      paymentDate: new Date(),
      userId,
      movieId,
      type,
      stripePaymentIntentId: paymentIntent.id,
      filmmakerAmount: distribution.filmmakerAmount,
      adminAmount: distribution.adminAmount,
    });
    await newPayment.save();

    res.status(200).json({
      success: true,
      message: "Stripe payment intent created successfully",
      clientSecret: paymentIntent.client_secret,
      transactionId: newPayment.id,
      paymentIntentId: paymentIntent.id,
      status: "pending",
      amount,
      currency: currency || "EUR",
      type,
      paymentMethod: "Stripe",
      distribution: {
        totalAmount: distribution.totalAmount,
        filmmakerAmount: distribution.filmmakerAmount,
        filmmakerPercentage: distribution.filmmakerPercentage,
        adminAmount: distribution.adminAmount,
        adminPercentage: distribution.adminPercentage,
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

    // 🔥 Calculate distribution for subscription (100% to admin)
    const distribution = calculatePaymentDistribution(amount, 'subscription');
    console.log("💰 Subscription Distribution:", distribution);

    // Validate required fields
    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: '"planId" is required',
      });
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    if (period === 'year') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    let finalAmount = amount;
    let finalCurrency = currency;
    
    // Convert to RWF for MoMo
    if (currency !== "RWF") {
      console.log(`Converting ${currency} ${amount} to RWF`);
      const exchangeRates = {
        USD: 1200,
        EUR: 1300,
        GBP: 1500,
      };
      
      if (exchangeRates[currency]) {
        finalAmount = Math.round(amount * exchangeRates[currency]);
        finalCurrency = "RWF";
        console.log(`Converted to: ${finalAmount} RWF`);
      }
    }

    // Ensure finalAmount is a whole number for MoMo
    finalAmount = parseInt(finalAmount);
    
    let formattedPhone = "";
    // Only format phone if provided (for MoMo)
    if (phoneNumber && phoneNumber.trim() !== '') {
      formattedPhone = phoneNumber.replace(/[+\s]/g, '');
      if (formattedPhone.startsWith("250")) {
        formattedPhone = "0" + formattedPhone.substring(3);
      } else if (!formattedPhone.startsWith("0")) {
        formattedPhone = "0" + formattedPhone;
      }
      
      // Validate Rwanda phone number format
      if (!/^0(78|79)\d{7}$/.test(formattedPhone)) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          error: "Invalid Rwanda phone number format. Use 078XXXXXXX or 079XXXXXXX",
        });
      }
    }

    // Only make MoMo API call if phone number is provided
    let payment;
    let isGatewaySuccessful = false;
    let referenceId = `SUBSCRIPTION_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (formattedPhone) {
      // 🔥 SANITIZE DESCRIPTION
      const rawDescription = `Subscription ${planId} ${period}`;
      const sanitizedDescription = sanitizeDescription(rawDescription);
      
      payment = await requestToPay(
        finalAmount,
        formattedPhone,
        userId,
        sanitizedDescription, // ✅ Clean description
        finalCurrency
      );

      console.log("📱 Lanari Pay Response:", payment);

      if (!payment.success) {
        // 🔥 CHECK FOR INSUFFICIENT BALANCE ERROR
        const errorMessage = payment.error || '';
        const gatewayError = payment.data?.error || '';
        const gatewayMessage = payment.data?.gateway_response?.data?.message || '';
        
        let userFriendlyMessage = "Payment initiation failed";
        
        // Check for insufficient balance error in various formats
        if (
          errorMessage.includes('Check users Balance') || 
          errorMessage.includes('users Balance') ||
          gatewayError.includes('Check users Balance') ||
          gatewayMessage.includes('Check users Balance') ||
          gatewayMessage.includes('Balance')
        ) {
          userFriendlyMessage = "Ntamafranga ufite ahagije. Ongera amafranga wishyure!";
        } else if (gatewayMessage) {
          // Try to provide more specific error message
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
      // For cases without phone (like Stripe fallback or admin created)
      isGatewaySuccessful = true; // Mark as successful for immediate processing
    }

    const initialStatus = isGatewaySuccessful ? 'succeeded' : 'pending';

    // Create payment record
    const newPayment = await Payment.create({
      amount: finalAmount,
      originalAmount: amount,
      originalCurrency: currency,
      currency: finalCurrency,
      paymentMethod: formattedPhone ? "MoMo" : "system", // Use system for no phone
      paymentMethodProvider: formattedPhone ? "LanariPay" : "internal",
      paymentStatus: initialStatus,
      paymentDate: new Date(),
      userId,
      type: type,
      planId, // This will now be saved
      subscriptionPeriod: period,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      referenceId: referenceId,
      exchangeRate: currency !== "RWF" ? (finalAmount / amount) : 1,
      financialTransactionId: payment?.data?.gateway_response?.data?.transaction_id || null,
      phoneNumber: formattedPhone || null,
      email,
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
        }
      }
    });

    // If payment successful, grant subscription access
    if (isGatewaySuccessful) {
      console.log("✅ Gateway successful - Granting subscription access");
      
      try {
        await grantSubscriptionAccess(newPayment);
        console.log("✅ Subscription access granted");
        
        // 🔥 Process admin payout only (no filmmaker payout for subscriptions)
        if (formattedPhone && distribution.adminAmount > 0) {
          const adminPayout = await sendMoneyToRecipient(
            distribution.adminAmount,
            ADMIN_MOMO_NUMBER,
            `subscription_admin_${newPayment.id}`,
            sanitizeDescription(`Subscription Fee ${planId} ${period}`)
          );
          
          if (adminPayout.success) {
            console.log("✅ Admin subscription fee sent successfully");
            
            // Create withdrawal record for admin
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
        originalAmount: amount,
        currency: finalCurrency,
        originalCurrency: currency,
        status: initialStatus,
        paymentMethod: formattedPhone ? "MoMo" : "system",
        gatewayStatus: isGatewaySuccessful ? "SUCCESSFUL" : "PENDING",
      },
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

/**
 * 🔥 NEW: Process Subscription Payment with Stripe
 * POST /api/payments/subscription/stripe
 */
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
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
      amount,
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
        amount,
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

/**
 * Get Payment Status
 * GET /api/payments/:paymentId
 */
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

    // Extract URLs from payment metadata
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
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        movie: payment.movie,
        user: payment.user,
        // 🔥 Use URLs from metadata
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

/**
 * Get User's Payment History
 * GET /api/payments/user/:userId
 */
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

/**
 * Confirm Payment (For Stripe webhook or manual confirmation)
 * PATCH /api/payments/:paymentId/confirm
 */
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

    // If succeeded, grant access and process payouts
    if (status === 'succeeded') {
      await grantMovieAccess(payment);
      await updateFilmmakerRevenue(
        payment.movieId,
        payment.filmmakerAmount,
        payment.amount
      );
      
      const movie = await Movie.findByPk(payment.movieId);
      if (movie) {
        await processAutomaticWithdrawals(payment, movie);
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

/**
 * Get Movie Sales & Revenue (Admin only)
 * GET /api/payments/movie/:movieId/analytics
 */
export const getMovieAnalytics = async (req, res) => {
  try {
    const { movieId } = req.params;

    const payments = await Payment.findAll({
      where: {
        movieId,
        paymentStatus: "succeeded",
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
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

/**
 * 🔥 NEW: Get Withdrawal History
 * GET /api/withdrawals/user/:userId
 */
export const getUserWithdrawals = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, status, type } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = { userId };
    if (status) where.status = status;
    if (type) where.type = type;

    const withdrawals = await Withdrawal.findAll({
      where,
      include: [
        {
          model: Payment,
          as: 'payment',
          attributes: ['id', 'amount', 'type', 'movieId'],
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum,
    });

    const total = await Withdrawal.count({ where });

    res.status(200).json({
      success: true,
      data: withdrawals,
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

/**
 * 🔥 NEW: Get Withdrawal Details
 * GET /api/withdrawals/:withdrawalId
 */
export const getWithdrawalDetails = async (req, res) => {
  try {
    const { withdrawalId } = req.params;

    const withdrawal = await Withdrawal.findByPk(withdrawalId, {
      include: [
        {
          model: Payment,
          as: 'payment',
          include: [
            { model: Movie, as: 'movie', attributes: ['title', 'poster'] },
          ],
        },
        {
          model: User,
          as: 'user',
          attributes: ['name', 'email'],
        },
      ],
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
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Check MoMo Payment Status
 * GET /api/payments/momo/status/:transactionId
 */
export const checkMoMoPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Find payment in database
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

    // If already processed, return cached status
    if (payment.paymentStatus === 'succeeded' || payment.paymentStatus === 'failed') {
      return res.status(200).json({
        success: true,
        status: payment.paymentStatus.toUpperCase(),
        transactionId: payment.id,
        referenceId: payment.referenceId,
        amount: payment.amount,
        currency: payment.currency,
        type: payment.type,
        paidAt: payment.updatedAt,
      });
    }

    // Check status from MTN MoMo API
    const momoStatus = await checkPaymentStatus(payment.referenceId);

    if (!momoStatus.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to check payment status',
        error: momoStatus.error,
      });
    }

    const status = momoStatus.status; // PENDING, SUCCESSFUL, FAILED

    // Update payment in database
    if (status === 'SUCCESSFUL') {
      payment.paymentStatus = 'succeeded';
      payment.financialTransactionId = momoStatus.financialTransactionId;
      payment.updatedAt = new Date();
      await payment.save();

      // Grant access to movie
      await grantMovieAccess(payment);

      // Update filmmaker revenue
      await updateFilmmakerRevenue(
        payment.movieId,
        payment.filmmakerAmount,
        payment.amount
      );

      // Process payouts to filmmaker and admin
      const movie = await Movie.findByPk(payment.movieId);
      await processAutomaticWithdrawals(payment, movie);

      return res.status(200).json({
        success: true,
        status: 'SUCCESSFUL',
        transactionId: payment.id,
        referenceId: payment.referenceId,
        amount: payment.amount,
        currency: payment.currency,
        type: payment.type,
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
      // Still PENDING
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

export const getSecureStreamUrl = async (req, res) => {
  try {
    const { movieId } = req.params;
    const { userId } = req.user;

    // Check if user has access to this movie
    const hasAccess = await checkUserAccessToMovie(userId, movieId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this movie'
      });
    }

    // Get movie details
    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    // Generate secure token
    const token = jwt.sign(
      {
        userId,
        movieId,
        type: 'stream',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
      },
      process.env.JWT_SECRET,
      { expiresIn: '48h' }
    );

    // Return secure URL
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

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is expired
    if (new Date(decoded.expiresAt) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Access token has expired'
      });
    }

    // Get payment record
    const payment = await Payment.findByPk(paymentId);
    if (!payment || payment.paymentStatus !== 'succeeded') {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired payment'
      });
    }

    // Get movie
    const movie = await Movie.findByPk(payment.movieId);
    if (!movie || !movie.videoUrl) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found or unavailable'
      });
    }

    // Stream the video
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${movie.title}.mp4"`);
    
    // You can use a streaming library or serve the file directly
    // For example, if using S3 or similar:
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