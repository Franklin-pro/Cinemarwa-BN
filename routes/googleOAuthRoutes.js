import express from "express";
import passport from "passport";
import {
    googleAuthSuccess,
    googleAuthFailure,
    getCurrentProfile,
    linkGoogleAccount,
    unlinkGoogleAccount,
    checkEmailAvailable
} from "../controllers/googleOAuthController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ========== GOOGLE OAUTH AUTHENTICATION ==========

/**
 * @route   GET /api/auth/google
 * @desc    Initiate Google OAuth login
 * @access  Public
 * @query   redirect_uri (optional) - where to redirect after login
 */
router.get(
    "/google",
    passport.authenticate("google", {
        scope: ["profile", "email"],
        accessType: "offline",
        prompt: "consent"
    })
);

/**
 * @route   GET /api/auth/google/callback
 * @desc    Google OAuth callback URL
 * @access  Public (handled by Passport)
 */
router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/failure", session: false }),
    googleAuthSuccess
);

/**
 * @route   GET /api/auth/failure
 * @desc    Google OAuth authentication failure
 * @access  Public
 */
router.get("/failure", googleAuthFailure);

// ========== USER PROFILE & MANAGEMENT ==========

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile (works with JWT or session)
 * @access  Private (authenticated users only)
 */
router.get("/profile", authenticateToken, getCurrentProfile);

/**
 * @route   POST /api/auth/check-email
 * @desc    Check if email is available for registration
 * @access  Public
 * @body    { email: string }
 */
router.post("/check-email", checkEmailAvailable);

// ========== ACCOUNT LINKING ==========

/**
 * @route   POST /api/auth/link-google
 * @desc    Link Google OAuth to existing local account
 * @note    Must have been authenticated with Google first (via Passport session)
 * @access  Private (authenticated users only)
 */
router.post("/link-google", authenticateToken, linkGoogleAccount);

/**
 * @route   DELETE /api/auth/link-google
 * @desc    Unlink Google OAuth from account
 * @access  Private (authenticated users only)
 */
router.delete("/link-google", authenticateToken, unlinkGoogleAccount);

export default router;
