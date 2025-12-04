import stripe from "../config/stripe.js";
import  { requestToPay,checkPaymentStatus, sendMoneyToRecipient } from "../utils/momoHelper.js";
import Payment from "../models/Payment.model.js";
import Movie from "../models/Movie.model.js";
import User from "../models/User.modal.js";
import Joi from "joi";

// ====== PAYMENT DISTRIBUTION CONFIGURATION ======

const FILMMAKER_SHARE = parseFloat(process.env.FILMMAKER_SHARE_PERCENTAGE) || 70;
const ADMIN_SHARE = parseFloat(process.env.ADMIN_SHARE_PERCENTAGE) || 30;
const ADMIN_MOMO_NUMBER = process.env.ADMIN_MOMO_NUMBER || "0790019543";



// ====== VALIDATION SCHEMAS ======

const paymentValidationSchema = Joi.object({
  amount: Joi.number().positive().required(),
  phoneNumber: Joi.string().pattern(/^\+?[0-9]{9,15}$/),
  userId: Joi.string().required(),
  movieId: Joi.string().required(),
  email: Joi.string().email(),
  currency: Joi.string().valid("USD", "EUR", "GHS", "XOF", "RWF").default("EUR"),
  type: Joi.string().valid("watch", "download").required(),
  description: Joi.string().max(500),
  filmmakersAmount: Joi.number().positive().optional(),
  adminAmount: Joi.number().positive().optional(),


  
});

// ====== HELPER FUNCTIONS ======

/**
 * Calculate payment distribution
 */
const calculatePaymentDistribution = (totalAmount) => {
  const filmmakerAmount = (totalAmount * FILMMAKER_SHARE) / 100;
  const adminAmount = (totalAmount * ADMIN_SHARE) / 100;

  return {
    totalAmount,
    filmmakerAmount: parseFloat(filmmakerAmount.toFixed(2)),
    adminAmount: parseFloat(adminAmount.toFixed(2)),
    filmmakerPercentage: FILMMAKER_SHARE,
    adminPercentage: ADMIN_SHARE,
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
      throw new Error('User or movie not found');
    }

    if (payment.type === 'watch') {
      // Grant 48-hour watch access
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
      // Grant permanent download access
      user.downloads = user.downloads || [];
      user.downloads.push({
        movie: movie.id,
        grantedAt: new Date(),
        transactionId: payment.id,
      });
    }

    await user.save();

    // Update movie statistics
    movie.totalViews = (movie.totalViews || 0) + 1;
    movie.totalRevenue = (movie.totalRevenue || 0) + payment.amount;
    await movie.save();


    return { success: true };
  } catch (error) {
    console.error('❌ Error granting movie access:', error);
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
      console.error('Movie not found');
      return;
    }

    movie.totalRevenue = (movie.totalRevenue || 0) + totalAmount;
    await movie.save();

    // Update filmmaker stats
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
 * Process payouts to filmmaker and admin
 */
const processPayouts = async (payment, movie) => {
  try {
    const filmmaker = await User.findByPk(movie.filmmakerId);
    if (!filmmaker) {
      console.error('Filmmaker not found');
      return { success: false, error: 'Filmmaker not found' };
    }

    const filmmakerMoMoNumber = filmmaker.filmmmakerMomoPhoneNumber;
    if (!filmmakerMoMoNumber) {
      console.warn('⚠️ Filmmaker has no MoMo number configured');
      return { success: false, error: 'Filmmaker MoMo number not configured' };
    }

    const distribution = calculatePaymentDistribution(payment.amount);

    const filmmakerPayout = await sendMoneyToRecipient(
      distribution.filmmakerAmount,
      filmmakerMoMoNumber,
      `filmmaker_${payment.id}`,
      `Earnings: ${payment.type} - ${movie.title}`
    );

    const adminPayout = await sendMoneyToRecipient(
      distribution.adminAmount,
      ADMIN_MOMO_NUMBER,
      `admin_${payment.id}`,
      `Platform Fee: ${payment.type} - ${movie.title}`
    );

    return {
      success: true,
      filmmaker: filmmakerPayout,
      admin: adminPayout,
    };
  } catch (error) {
    console.error('❌ Error processing payouts:', error);
    return { success: false, error: error.message };
  }
};

// ====== PAYMENT ENDPOINTS ======

/**
 * Process MoMo (Mobile Money) Payment
 * POST /api/payments/momo
 */

// In payWithMoMo function, update the payment initiation:
// In your payWithMoMo function, add this debug logging and validation:
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

    const { amount, phoneNumber, userId, movieId, description, currency, type } = value;

    console.log("📱 Payment Request Received:", {
      amount,
      currency,
      phoneNumber,
      movieId,
      type,
      userId
    });

    // Verify movie exists
    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({ 
        success: false,
        message: "Movie not found" 
      });
    }

    // Calculate distribution
    const distribution = calculatePaymentDistribution(amount);

    // Convert amount to RWF if not already
    let finalAmount = amount;
    let finalCurrency = currency;
    
    if (currency !== "RWF") {
      console.log(`Converting ${currency} ${amount} to RWF`);
      // Use actual exchange rate API or fixed rates
      const exchangeRates = {
        USD: 1200, // 1 USD = 1200 RWF
        EUR: 1300, // 1 EUR = 1300 RWF
        GBP: 1500, // 1 GBP = 1500 RWF
      };
      
      if (exchangeRates[currency]) {
        finalAmount = Math.round(amount * exchangeRates[currency]);
        finalCurrency = "RWF";
        console.log(`Converted to: ${finalAmount} RWF`);
      } else {
        console.warn(`No exchange rate for ${currency}, using amount as-is`);
      }
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/[+\s]/g, '');
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith("0")) {
      formattedPhone = "0" + formattedPhone;
    }

    // Request payment from customer
    const payment = await requestToPay(
      finalAmount,
      formattedPhone,
      userId,
      description || `${type.charAt(0).toUpperCase() + type.slice(1)} ${movie.title}`,
      finalCurrency
    );

    console.log("📱 Lanari Pay Response:", payment);

    if (payment.success) {
      // Save payment record
      const newPayment = new Payment({
        amount: finalAmount,
        originalAmount: amount,
        originalCurrency: currency,
        currency: finalCurrency,
        paymentMethod: "MoMo",
        paymentMethodProvider: "LanariPay",
        paymentStatus: "pending",
        paymentDate: new Date(),
        userId,
        movieId,
        type,
        referenceId: payment.referenceId,
        filmmakerAmount: distribution.filmmakerAmount,
        adminAmount: distribution.adminAmount,
        exchangeRate: currency !== "RWF" ? (finalAmount / amount) : 1,
      });
      await newPayment.save();

      return res.status(200).json({
        success: true,
        message: "Payment initiated successfully",
        transactionId: newPayment.id,
        referenceId: payment.referenceId,
        status: "PENDING",
        customerTransaction: {
          transactionId: newPayment.id,
          referenceId: payment.referenceId,
          amount: finalAmount,
          originalAmount: amount,
          currency: finalCurrency,
          originalCurrency: currency,
          status: "pending",
        },
        distribution: {
          totalAmount: distribution.totalAmount,
          filmmakerAmount: distribution.filmmakerAmount,
          filmmakerPercentage: distribution.filmmakerPercentage,
          adminAmount: distribution.adminAmount,
          adminPercentage: distribution.adminPercentage,
        },
        debug: {
          amountSent: finalAmount,
          currencySent: finalCurrency,
          phoneSent: formattedPhone,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Payment initiation failed",
        error: payment.error,
        data: payment.data,
        debug: {
          amount: finalAmount,
          currency: finalCurrency,
          phone: formattedPhone,
        },
      });
    }
  } catch (error) {
    console.error("❌ MoMo Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Payment processing error",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * Webhook for Lanari Pay notifications
 * POST /api/payments/webhook/lanari-pay
 */
export const lanariPayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log("📱 Lanari Pay Webhook Received:", webhookData);

    // Verify the webhook signature if provided
    const signature = req.headers['x-lanari-signature'];
    // Add signature verification logic here if available

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
      await processPayouts(payment, movie);

    } else if (newStatus === 'failed' || newStatus === 'cancelled') {
      payment.paymentStatus = 'failed';
      payment.failureReason = webhookData.reason || 'Payment failed';
      payment.updatedAt = new Date();
      await payment.save();
    }

    // Always respond with success to acknowledge receipt
    res.status(200).json({ success: true, received: true });

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    res.status(500).json({ success: false, error: error.message });
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
      await processPayouts(payment, movie);

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
      description: description || `${type.charAt(0).toUpperCase() + type.slice(1)}: ${movie.title}`,
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

/**
 * Get Payment Status
 * GET /api/payments/:paymentId
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findByPk(paymentId, {
      include: [
        { association: 'movieId', attributes: ['title', 'price'] },
        { association: 'userId', attributes: ['name', 'email'] }
      ]
    });

    if (!payment) {
      return res.status(404).json({ 
        success: false,
        message: "Payment not found" 
      });
    }

    res.status(200).json({
      success: true,
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
          association: "movie", // <-- FIXED ALIAS
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
      await processPayouts(payment, payment.movieId);
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
