import express from "express";
import {
  payWithMoMo,
  payWithStripe,
  getPaymentStatus,
  getUserPayments,
  confirmPayment,
  getMovieAnalytics,
  lanariPayWebhook,
  // getUserWithdrawals,
  getWithdrawalDetails,
  paySubscriptionWithMoMo,
  paySubscriptionWithStripe,
  getAllWithdrawals,
  requestWithdrawal,
  getWithdrawalHistory,
  getFilmmakerFinance,
  processWithdrawal,
  paySeriesWithMoMo,
  getSeriesPricing,
  checkSeriesAccess,
  checkMoMoPaymentStatus
} from "../controllers/paymentController.js";
import { authenticateToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ====== PAYMENT PROCESSING ======

// Process MoMo (Mobile Money) payment
// POST /api/payments/momo
router.post("/momo", payWithMoMo);

// Process Stripe payment
// POST /api/payments/stripe
router.post("/stripe", payWithStripe);

// Process Series payment with MoMo
// POST /api/payments/series/momo
router.post("/series/momo", paySeriesWithMoMo);

// ====== SUBSCRIPTION PAYMENT ROUTES ======
router.post('/subscription/momo', paySubscriptionWithMoMo);
router.post('/subscription/stripe', paySubscriptionWithStripe);

// ====== SERIES PRICING & ACCESS ROUTES ======
router.get('/series/:seriesId/pricing', getSeriesPricing);
router.get('/series/:seriesId/access/:userId', checkSeriesAccess);

// ====== PAYMENT QUERIES ======

// Get payment status by payment ID
// GET /api/payments/status/:paymentId
router.get("/status/:paymentId", getPaymentStatus);

// Check MoMo payment status
// GET /api/payments/momo/status/:transactionId
router.get("/momo/status/:transactionId", checkMoMoPaymentStatus);

// Get user's payment history
// GET /api/payments/user/:userId
router.get("/user/:userId", authenticateToken, getUserPayments);

// ====== PAYMENT MANAGEMENT ======

// Confirm payment (webhook or manual)
// PATCH /api/payments/:paymentId/confirm
router.patch("/:paymentId/confirm", authenticateToken, confirmPayment);

// ====== ANALYTICS ======

// Get movie sales & revenue analytics (Admin only)
// GET /api/payments/movie/:movieId/analytics
router.get("/movie/:movieId/analytics", authenticateToken, requireAdmin, getMovieAnalytics);

// ====== WITHDRAWAL ROUTES ======

// 🔥 NEW: Request withdrawal (Filmmaker only)
// POST /api/payments/withdrawals/request
router.post("/withdrawals/:filmmakerId/request", authenticateToken, requestWithdrawal);

// 🔥 NEW: Get withdrawal history for authenticated user
// GET /api/payments/withdrawals/history
router.get("/withdrawals/history", authenticateToken, getWithdrawalHistory);

// 🔥 NEW: Get filmmaker financial summary
// GET /api/payments/filmmaker/finance
router.get("/filmmaker/finance", authenticateToken, );

// 🔥 NEW: Get specific withdrawal details
// GET /api/payments/withdrawals/:withdrawalId
router.get("/withdrawals/:withdrawalId", authenticateToken, getWithdrawalDetails);

// ====== ADMIN WITHDRAWAL MANAGEMENT ROUTES ======

// 🔥 NEW: Get all withdrawals (Admin only)
// GET /api/payments/admin/withdrawals
router.get("/admin/withdrawals", authenticateToken, requireAdmin, getAllWithdrawals);

// 🔥 NEW: Process withdrawal (Admin only)
// PUT /api/payments/admin/withdrawals/:withdrawalId/process
router.put("/admin/withdrawals/:withdrawalId/process", authenticateToken, requireAdmin, processWithdrawal);

// ====== WEBHOOK ROUTES ======

// Lanari Pay webhook (no authentication needed for webhooks)
// POST /api/payments/webhook/lanari-pay
router.post("/webhook/lanari-pay", lanariPayWebhook);

// Stripe webhook (you should add this too)
// router.post("/webhook/stripe", stripeWebhook);

export default router;