import express from "express";
import {
  payWithMoMo,
  payWithStripe,
  getPaymentStatus,
  getUserPayments,
  confirmPayment,
  getMovieAnalytics,
  lanariPayWebhook,
  getUserWithdrawals,
  getWithdrawalDetails,
} from "../controllers/paymentController.js";
import { authenticateToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ====== PAYMENT PROCESSING ======

// Process MoMo (Mobile Money) payment
// POST /payments/momo
router.post("/momo", payWithMoMo);
router.post("/webhook/lanari-pay", lanariPayWebhook);

// Process Stripe payment
// POST /payments/stripe
router.post("/stripe", payWithStripe);

// ====== PAYMENT QUERIES ======

// Get payment status by payment ID
// GET /payments/status/:paymentId
router.get("/status/:paymentId", getPaymentStatus);

// Get user's payment history
// GET /payments/user/:userId
router.get("/user/:userId", authenticateToken, getUserPayments);

// ====== PAYMENT MANAGEMENT ======

// Confirm payment (webhook or manual)
// PATCH /payments/:paymentId/confirm
router.patch("/:paymentId/confirm", authenticateToken, confirmPayment);

// ====== ANALYTICS ======

// Get movie sales & revenue analytics (Admin only)
// GET /payments/movie/:movieId/analytics
router.get("/movie/:movieId/analytics", authenticateToken, requireAdmin, getMovieAnalytics);

// ====== WITHDRAWAL ROUTES ======

/**
 * @route   GET /api/withdrawals/user/:userId
 * @desc    Get user's withdrawal history
 * @access  Protected (Own withdrawals or Admin)
 */
router.get('/withdrawals/user/:userId', authenticateToken, getUserWithdrawals);

/**
 * @route   GET /api/withdrawals/:withdrawalId
 * @desc    Get withdrawal details
 * @access  Protected (Own withdrawal or Admin)
 */
router.get('/withdrawals/:withdrawalId', authenticateToken, getWithdrawalDetails);

export default router;
