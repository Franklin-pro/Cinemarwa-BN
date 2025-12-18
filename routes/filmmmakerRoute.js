import express from "express";
import {
  getFilmmmakerProfile,
  updateFilmmmakerProfile,
  getFilmmmakerDashboard,
  getMovieAnalytics,
  getFinancialSummary,
  requestWithdrawal,
  getWithdrawalHistory,
  getFilmmmakerMovies,
  editFilmmmakerMovie,
  getFilmmmakerStats,
  updatePaymentMethod,
  getPaymentMethod,
  getSeriesEpisodes,
  getFilmmmakerNotifications,
  getFilmmakerAnalytics,
} from "../controllers/filmmmakerController.js";
import {
  authenticateToken,
  requireFilmmaker,
  requireFilmmakerApproved,
  requireFilmmakerVerified,
  checkNotBlocked,
} from "../middleware/authMiddleware.js";
import { getAllWithdrawals } from "../controllers/paymentController.js";

const router = express.Router();

// ====== PROFILE MANAGEMENT ======

// Get filmmaker profile
// GET /filmmaker/profile
router.get("/profile", authenticateToken, requireFilmmaker, getFilmmmakerProfile);

// Update filmmaker profile
// PUT /filmmaker/profile
router.put(
  "/profile",
  authenticateToken,
  requireFilmmaker,
  checkNotBlocked,
  updateFilmmmakerProfile
);

// ====== DASHBOARD & ANALYTICS ======

// Get filmmaker dashboard
// GET /filmmaker/dashboard
router.get(
  "/dashboard",
  authenticateToken,
  requireFilmmaker,
  getFilmmmakerDashboard
);

// Get movie analytics
// GET /filmmaker/analytics/:movieId
router.get(
  "/analytics/:movieId",
  authenticateToken,
  requireFilmmaker,
  getMovieAnalytics
);

// Get filmmaker statistics
// GET /filmmaker/stats
router.get("/stats", authenticateToken, requireFilmmaker, getFilmmmakerStats);

// ====== PAYMENT METHOD MANAGEMENT ======

// Get current payment method
// GET /filmmaker/payment-method
router.get(
  "/payment-method",
  authenticateToken,
  requireFilmmaker,
  getPaymentMethod
);
router.get(
  "/analytics",
  authenticateToken,
  requireFilmmaker,
  getFilmmakerAnalytics
)
router.get(
  "/notifications",
  authenticateToken,
  requireFilmmaker,
  getFilmmmakerNotifications
)

// Update payment method
// PUT /filmmaker/payment-method
router.put(
  "/payment-method",
  authenticateToken,
  requireFilmmaker,
  checkNotBlocked,
  updatePaymentMethod
);

// ====== FINANCIAL MANAGEMENT ======

// Get financial summary
// GET /filmmaker/finance
router.get(
  "/finance",
  authenticateToken,
  requireFilmmaker,
  requireFilmmakerVerified,
  getFinancialSummary
);

// Request withdrawal
// POST /filmmaker/withdraw
router.post(
  "/withdraw",
  authenticateToken,
  requireFilmmaker,
  requireFilmmakerApproved,
  requireFilmmakerVerified,
  checkNotBlocked,
  requestWithdrawal
);

// Get withdrawal history
// GET /filmmaker/withdrawals
router.get(
  "/withdrawals",
  authenticateToken,
  requireFilmmaker,
  getAllWithdrawals
);

// ====== MOVIE MANAGEMENT ======

// Get filmmaker movies
// GET /filmmaker/movies
router.get(
  "/movies",
  authenticateToken,
  requireFilmmaker,
  getFilmmmakerMovies
);
router.get(
  "/series/:seriesId/episodes",
  authenticateToken,
  requireFilmmaker,
  getSeriesEpisodes
);

// Edit filmmaker movie
// PUT /filmmaker/movies/:movieId
router.put(
  "/movies/:movieId",
  authenticateToken,
  requireFilmmaker,
  checkNotBlocked,
  editFilmmmakerMovie
);

export default router;