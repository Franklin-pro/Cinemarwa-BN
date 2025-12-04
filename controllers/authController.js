import User from "../models/User.modal.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createAndSendOTP, verifyOTP, deleteOTP } from "../utils/otpHelper.js";

// Generate unique device ID
const generateDeviceId = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress;
    return crypto.createHash('md5').update(userAgent + ip).digest('hex');
};

// Register
export const register = async (req, res) => {
    const { name, email, password, role } = req.body; // ✅ include role
    try {
        const existingUser = await User.findOne({ 
            where: { email }
         });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || "viewer", // ✅ use role if provided
            isUpgraded: false,
            maxDevices: 1
        });

        const deviceId = generateDeviceId(req);

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceId
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        user.activeDevices = user.activeDevices || [];
        user.activeDevices.push({
            deviceId: deviceId,
            token: token,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip
        });
        // Mark the JSON field as changed for Sequelize
        user.changed('activeDevices', true);
        await user.save();

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                maxDevices: user.maxDevices
            },
            token
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Login - Step 1: Verify email and password, send OTP
export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Check if user exists
        const user = await User.findOne({ 
            where: { email }  // Make sure to use 'where' for Sequelize
        });
        
        if (!user) {
            return res.status(401).json({ 
                message: "Invalid credentials - User not found" 
            });
        }

        // Check if user has password (Google users might not have passwords)
        if (!user.password) {
            return res.status(401).json({ 
                message: "Please login with Google or reset your password" 
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Only create and send OTP if user exists and password matches
        const otpResult = await createAndSendOTP(email);

        if (!otpResult.success) {
            return res.status(500).json({
                message: "Failed to send OTP",
                error: otpResult.error
            });
        }

        res.status(200).json({
            message: "OTP sent to your email. Please verify to login.",
            email: email,
            expiresIn: otpResult.expiresIn // 10 minutes
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Login - Step 2: Verify OTP and create session
export const verifyLoginOTP = async (req, res) => {
    const { email, otp } = req.body;
    try {
        // Validate input
        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        // FIRST: Check if user exists BEFORE verifying OTP
        const user = await User.findOne({ 
            where: { email } 
        });
        
        if (!user) {
            return res.status(401).json({ 
                message: "User not found. Please register first." 
            });
        }

        // Verify OTP
        const otpVerifyResult = await verifyOTP(email, otp);

        if (!otpVerifyResult.success) {
            return res.status(401).json({
                message: otpVerifyResult.message,
                code: otpVerifyResult.code,
                remainingAttempts: otpVerifyResult.remainingAttempts
            });
        }

        // Generate device ID
        const deviceId = generateDeviceId(req);
        const existingDevice = user.activeDevices.find(device => device.deviceId === deviceId);

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceId
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
                loginAt: new Date()
            });
            user.changed('activeDevices', true);
        }
        await user.save();

        // Delete OTP after successful verification
        await deleteOTP(email);

        res.status(200).json({
            message: "User logged in successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                maxDevices: user.maxDevices
            },
            token
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
// Resend OTP
export const resendOTP = async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Check if user exists FIRST
        const user = await User.findOne({ 
            where: { email } 
        });
        if (!user) {
            return res.status(404).json({ message: "User not found. Please register first." });
        }

        // Delete old OTP and create new one
        const otpResult = await createAndSendOTP(email);

        if (!otpResult.success) {
            return res.status(500).json({
                message: "Failed to send OTP",
                error: otpResult.error
            });
        }

        res.status(200).json({
            message: "New OTP sent to your email",
            email: email,
            expiresIn: otpResult.expiresIn
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Logout from current device
export const logout = async (req, res) => {
    try {
        const deviceId = generateDeviceId(req);
        const user = await User.findByPk(req.userId);

        if (user) {
            user.activeDevices = (user.activeDevices || []).filter(d => d.deviceId !== deviceId);
            await user.save();
        }

        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Logout from all devices
export const logoutAll = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId);

        if (user) {
            user.activeDevices = [];
            await user.save();
        }

        res.status(200).json({ message: "Logged out from all devices successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Upgrade user to premium
export const upgradeUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.isUpgraded = true;
        user.maxDevices = 2;
        await user.save();

        res.status(200).json({
            message: "User upgraded successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                maxDevices: user.maxDevices
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get active devices
export const getActiveDevices = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId, {
            attributes: ['activeDevices', 'isUpgraded', 'maxDevices']
        });

        res.status(200).json({
            activeDevices: user.activeDevices,
            isUpgraded: user.isUpgraded,
            maxDevices: user.maxDevices
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Remove specific device
export const removeDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const user = await User.findByPk(req.userId);

        if (user) {
            user.activeDevices = (user.activeDevices || []).filter(d => d.deviceId !== deviceId);
            await user.save();
        }

        res.status(200).json({ message: "Device removed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const loginWithGoogle = async (req, res) => {
    try {
        const user = req.user; // Passport attaches Google user here

        if (!user) {
            return res.redirect("http://localhost:5173/auth/failed?error=no_google_user");
        }

        const deviceId = generateDeviceId(req);

        // Create JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceId
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Update or add device
        user.activeDevices = user.activeDevices || [];
        const existingDevice = user.activeDevices.find(d => d.deviceId === deviceId);

        if (existingDevice) {
            existingDevice.token = token;
            existingDevice.loginAt = new Date();
        } else {
            user.activeDevices.push({
                deviceId: deviceId,
                token: token,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip,
                loginAt: new Date()
            });
        }

        user.changed("activeDevices", true);
        console.log(user);
        await user.save();

        // Redirect back to frontend with JWT
        const redirectUrl = `http://localhost:5173?token=${token}`;
        return res.redirect(redirectUrl);

    } catch (error) {
        console.error("Google login error:", error);
        return res.redirect(
            "http://localhost:5173/auth/failed?error=google_auth_failed"
        );
    }
};
export const googleOAuthCallback = (req, res) => {
    res.send("Google OAuth callback handled by passport.");
}