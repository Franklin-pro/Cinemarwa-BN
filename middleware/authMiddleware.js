import jwt from "jsonwebtoken";
import User from "../models/User.modal.js"; // Make sure this path is correct
import crypto from "crypto";

/**
 * Generate a unique device ID based on user-agent and IP
 * @param {Request} req
 * @returns string
 */
export const generateDeviceId = (req) => {
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "";
  return crypto.createHash("md5").update(userAgent + ip).digest("hex");
};

/**
 * Authenticate JWT token and attach user info to request
 */
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if token matches any active device
    const deviceExists = user.activeDevices.some(
      (device) => device.token === token
    );
    if (!deviceExists) {
      return res
        .status(401)
        .json({ message: "Invalid or expired token for this device" });
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.deviceId = decoded.deviceId;
    req.user = user; // Attach full user object for convenience

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token expired" });
    } else if (error.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    } else {
      return res.status(500).json({ message: "Server error during authentication" });
    }
  }
};

/**
 * Middleware to allow only admin users
 */
export const requireAdmin = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

/**
 * Middleware to allow only upgraded/premium users
 */
export const requireUpgrade = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isUpgraded) {
      return res
        .status(403)
        .json({ 
          message: "Upgrade required to access this feature",
          upgradeRequired: true
        });
    }

    next();
  } catch (error) {
    console.error("Upgrade check error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Clean up expired device sessions (optional helper function)
 */
export const cleanupExpiredSessions = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    if (!user) return;

    const now = new Date();
    const expiredThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    const validDevices = user.activeDevices.filter(device => {
      return new Date(device.lastActive) > expiredThreshold;
    });

    if (validDevices.length !== user.activeDevices.length) {
      await User.findByPkAndUpdate(userId, {
        activeDevices: validDevices
      });
    }
  } catch (error) {
    console.error("Session cleanup error:", error.message);
  }
};

// ====== ROLE-BASED AUTHORIZATION MIDDLEWARE ======

/**
 * Allow only filmmaker role
 */
export const requireFilmmaker = (req, res, next) => {
  if (req.userRole !== "filmmaker") {
    return res.status(403).json({
      message: "Filmmaker access required",
      requiredRole: "filmmaker"
    });
  }
  next();
};

/**
 * Allow only viewer role
 */
export const requireViewer = (req, res, next) => {
  if (req.userRole !== "viewer") {
    return res.status(403).json({
      message: "Viewer access required",
      requiredRole: "viewer"
    });
  }
  next();
};

/**
 * Allow admin or filmmaker
 */
export const requireAdminOrFilmmaker = (req, res, next) => {
  if (req.userRole !== "admin" && req.userRole !== "filmmaker") {
    return res.status(403).json({
      message: "Admin or Filmmaker access required",
      requiredRoles: ["admin", "filmmaker"]
    });
  }
  next();
};

/**
 * Allow admin or viewer (viewer can manage their account)
 */
export const requireAdminOrSelf = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.body.userId;

    if (req.userRole === "admin") {
      return next();
    }

    if (req.userId === targetUserId) {
      return next();
    }

    return res.status(403).json({
      message: "You can only access your own data"
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Check if filmmaker account is approved
 */
export const requireFilmmakerApproved = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user || user.role !== "filmmaker") {
      return res.status(403).json({
        message: "Only approved filmmakers can perform this action"
      });
    }

    if (user.approvalStatus !== "approved") {
      return res.status(403).json({
        message: "Your filmmaker account is not approved yet",
        status: user.approvalStatus,
        rejectionReason: user.rejectionReason
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Check if filmmaker is verified (bank details, profile)
 */
export const requireFilmmakerVerified = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user || user.role !== "filmmaker") {
      return res.status(403).json({
        message: "Only verified filmmakers can perform this action"
      });
    }

    if (!user.filmmmakerMomoPhoneNumber || !user.approvalStatus === "approved") {
      console.log("Bank details verified:", user.filmmmakerMomoPhoneNumber);
      return res.status(403).json({
        message: "Your filmmaker account must be verified",
        completionRequired: {
          bankDetails: !user.filmmaker?.bankDetails?.isVerified,
          profileInfo: !user.filmmaker?.verifiedAt
        }
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Check if user is not blocked
 */
export const checkNotBlocked = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked",
        reason: user.blockedReason,
        blockedAt: user.blockedAt,
        contactSupport: "Please contact support for more information"
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Multiple role authorization (accepts array of allowed roles)
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
        requiredRoles: allowedRoles,
        userRole: req.userRole
      });
    }
    next();
  };
};

/**
 * Optional authentication: if a valid token is present, attach `req.user`.
 * If no token or token is invalid, do NOT return 401 — just continue without user.
 */
export const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    if (!user) return next();

    // Ensure token matches an active device for this user
    const deviceExists = Array.isArray(user.activeDevices) && user.activeDevices.some(
      (device) => device.token === token
    );
    if (!deviceExists) return next();

    req.userId = user.id;
    req.userRole = user.role;
    req.deviceId = decoded.deviceId;
    req.user = user;

    next();
  } catch (error) {
    console.error("Optional authentication error:", error.message);
    // Do not block the request — optional auth only
    next();
  }
};