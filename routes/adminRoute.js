import express from "express";
import {
  getAdminDashboard,
  getDetailedAnalytics,
  getPendingFilmmakers,
  approveFilmmaker,
  getAllFilmmakers,
  verifyFilmmmakerBank,
  getAllUsers,
  blockUser,
  unblockUser,
  deleteUser,
  getPendingMovies,
  approveMovie,
  getFlaggedContent,
  getPaymentReconciliation,
} from "../controllers/adminDashboardController.js";
import {
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ====== DASHBOARD & ANALYTICS ======

// Get admin dashboard overview
// GET /admin/dashboard
router.get("/dashboard", authenticateToken, requireAdmin, getAdminDashboard);

// Get detailed analytics
// GET /admin/analytics?period=month
router.get("/analytics", authenticateToken, requireAdmin, getDetailedAnalytics);

// ====== FILMMAKER MANAGEMENT ======

// Get all filmmakers
// GET /admin/filmmakers?status=approved&page=1
router.get(
  "/filmmakers",
  authenticateToken,
  requireAdmin,
  getAllFilmmakers
);

// Get pending filmmaker approvals
// GET /admin/filmmakers/pending
router.get(
  "/filmmakers/pending",
  authenticateToken,
  requireAdmin,
  getPendingFilmmakers
);

// Approve or reject filmmaker
// PATCH /admin/filmmakers/:filmamakerId/approve
router.patch(
  "/filmmakers/:filmamakerId/approve",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  approveFilmmaker
);

// Verify filmmaker bank details
// PATCH /admin/filmmakers/:filmamakerId/verify-bank
router.patch(
  "/filmmakers/:filmamakerId/verify-bank",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  verifyFilmmmakerBank
);

// ====== USER MANAGEMENT ======

// Get all users
// GET /admin/users?role=filmmaker&search=john
router.get("/users", authenticateToken, requireAdmin, getAllUsers);

// Block user account
// PATCH /admin/users/:userId/block
router.patch(
  "/users/:userId/block",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  blockUser
);

// Unblock user account
// PATCH /admin/users/:userId/unblock
router.patch(
  "/users/:userId/unblock",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  unblockUser
);

// Delete user account
// DELETE /admin/users/:userId
router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  deleteUser
);

// ====== CONTENT MODERATION ======

// Get pending movie approvals
// GET /admin/movies/pending
router.get(
  "/movies/pending",
  authenticateToken,
  requireAdmin,
  getPendingMovies
);

// Approve or reject movie
// PATCH /admin/movies/:movieId/approve
router.patch(
  "/movies/:movieId/approve",
  authenticateToken,
  requireAdmin,
  checkNotBlocked,
  approveMovie
);

// Get flagged content for review
// GET /admin/flagged-content?type=all
router.get(
  "/flagged-content",
  authenticateToken,
  requireAdmin,
  getFlaggedContent
);

// ====== PAYMENT RECONCILIATION ======

// Get payment reconciliation
// GET /admin/payments/reconciliation?period=month
router.get(
  "/payments/reconciliation",
  authenticateToken,
  requireAdmin,
  getPaymentReconciliation
);

export default router;