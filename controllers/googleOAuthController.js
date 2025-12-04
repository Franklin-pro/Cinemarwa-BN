import jwt from "jsonwebtoken";
import User from "../models/User.modal.js";
import crypto from "crypto";

// Generate unique device ID
const generateDeviceId = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress;
    return crypto.createHash('md5').update(userAgent + ip).digest('hex');
};

// Google OAuth Success Handler
export const googleAuthSuccess = async (req, res) => {
    try {
        const user = req.user;

        if (!user) {
            return res.status(401).json({ message: "Authentication failed" });
        }

        // Generate device ID
        const deviceId = generateDeviceId(req);
        const existingDevice = user.activeDevices.find(device => device.deviceId === deviceId);

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceId,
                authProvider: user.authProvider
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Update or add device
        if (existingDevice) {
            // Update existing device token
            const deviceIndex = user.activeDevices.findIndex(d => d.deviceId === deviceId);
            if (deviceIndex !== -1) {
                user.activeDevices[deviceIndex].token = token;
                user.activeDevices[deviceIndex].loginAt = new Date();
                user.activeDevices[deviceIndex].lastActive = new Date();
                // Mark the JSON field as changed for Sequelize
                user.changed('activeDevices', true);
            }
        } else {
            // Add new device
            user.activeDevices = user.activeDevices || [];
            user.activeDevices.push({
                deviceId: deviceId,
                token: token,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip,
                loginAt: new Date(),
                lastActive: new Date()
            });
            // Mark the JSON field as changed for Sequelize
            user.changed('activeDevices', true);
        }
        await user.save();

        // Return success response with user data and token
        res.status(200).json({
            message: "Google login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                maxDevices: user.maxDevices,
                profilePicture: user.profilePicture,
                authProvider: user.authProvider
            },
            token,
            deviceId
        });
        
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Google OAuth Failure Handler
export const googleAuthFailure = (req, res) => {
    res.status(401).json({
        message: "Google authentication failed",
        error: "Could not authenticate with Google"
    });
};

// Get current user profile (for authenticated users)
export const getCurrentProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId, {
            attributes: ['name', 'email', 'role', 'isUpgraded', 'profilePicture', 'authProvider', 'googleId']
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                profilePicture: user.profilePicture,
                authProvider: user.authProvider,
                googleId: !!user.googleId
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Link Google Account to existing user
export const linkGoogleAccount = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: "User not authenticated with Google" });
        }

        const userId = req.userId; // From JWT middleware
        const googleId = req.user.id;

        // Check if Google ID is already linked to another account
        const existingGoogleUser = await User.findOne({ googleId });
        if (existingGoogleUser && existingGoogleUser.id !== userId) {
            return res.status(409).json({
                message: "This Google account is already linked to another user"
            });
        }

        // Update user with Google ID
        const user = await User.findByPk(userId);
        user.googleId = googleId;
        user.authProvider = "both";
        if (req.user.photos?.[0]?.value) {
            user.profilePicture = req.user.photos[0].value;
        }
        await user.save();

        res.status(200).json({
            message: "Google account linked successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                authProvider: user.authProvider,
                profilePicture: user.profilePicture
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Unlink Google Account
export const unlinkGoogleAccount = async (req, res) => {
    try {
        const userId = req.userId; // From JWT middleware

        // Get user
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.googleId) {
            return res.status(400).json({
                message: "Google account is not linked to this user"
            });
        }

        // Check if user has password (can't remove Google if no password)
        if (!user.password) {
            return res.status(400).json({
                message: "Cannot unlink Google account as you don't have a password set. Please set a password first."
            });
        }

        // Unlink Google account
        user.googleId = null;
        if (user.authProvider === "both") {
            user.authProvider = "local";
        } else if (user.authProvider === "google") {
            user.authProvider = "local";
        }

        await user.save();

        res.status(200).json({
            message: "Google account unlinked successfully",
            authProvider: user.authProvider
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Check if email is available for Google OAuth registration
export const checkEmailAvailable = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        res.status(200).json({
            available: !user,
            email: email.toLowerCase()
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
