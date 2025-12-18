// auth.routes.js
import express from "express";
import {
    register,
    login,
    verifyLoginOTP,
    resendOTP,
    logout,
    logoutAll,
    upgradeUser,
    getActiveDevices,
    removeDevice,
    loginWithGoogle,
    getProfileUser
} from "../controllers/authController.js";
import { authenticateToken, requireUpgrade } from "../middleware/authMiddleware.js";
import passport from "passport";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyLoginOTP);
router.post("/resend-otp", resendOTP);
router.post("/logout", authenticateToken, logout);
router.post("/logout-all", authenticateToken, logoutAll);
router.get("/devices", authenticateToken, getActiveDevices);
router.get("/me", authenticateToken, getProfileUser);
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  loginWithGoogle
);
router.delete("/devices/:deviceId", authenticateToken, removeDevice);
router.patch("/upgrade/:userId", authenticateToken, requireUpgrade, upgradeUser);

export default router;