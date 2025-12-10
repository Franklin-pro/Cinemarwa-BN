import User from "../models/User.modal.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createAndSendOTP, verifyOTP, deleteOTP } from "../utils/otpHelper.js";
// controllers/authController.js - Register function
import { getDeviceInfo } from '../utils/deviceHelper.js';


export const register = async (req, res) => {
    const { name, email, password, role, deviceFingerprint } = req.body;
    
    try {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || "viewer",
            isUpgraded: false,
            maxDevices: role === 'filmmaker' ? 2 : 1,
            activeDevices: []
        });

        // Safely get device info
        const deviceInfo = getDeviceInfo({
            ...req,
            body: { ...req.body, deviceFingerprint },
            headers: {
                ...req.headers,
                'x-device-fingerprint': deviceFingerprint || ''
            }
        });

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceInfo.deviceId
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Add device to user
        user.activeDevices = [{
            ...deviceInfo,
            token: token,
            loginAt: new Date()
        }];
        
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
                maxDevices: user.maxDevices,
                currentDevices: 1
            },
            token,
            deviceId: deviceInfo.deviceId
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            message: "Server error", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
// controllers/authController.js
export const verifyLoginOTP = async (req, res) => {
    const { email, otp, deviceFingerprint } = req.body;
    
    try {
        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        const user = await User.findOne({ where: { email } });
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

        // Safely get device info
        const deviceInfo = getDeviceInfo({
            ...req,
            body: { ...req.body, deviceFingerprint },
            headers: {
                ...req.headers,
                'x-device-fingerprint': deviceFingerprint || ''
            }
        });

        // Check device limit
        const currentDevices = Array.isArray(user.activeDevices) ? user.activeDevices : [];
        
        if (currentDevices.length >= user.maxDevices) {
            // If max devices reached, check if this is a returning device
            const isReturningDevice = currentDevices.some(
                device => device && device.deviceId === deviceInfo.deviceId
            );
            
            if (!isReturningDevice) {
                return res.status(403).json({
                    message: `Maximum ${user.maxDevices} device(s) allowed. Please logout from another device or upgrade your account.`,
                    maxDevices: user.maxDevices,
                    currentDevices: currentDevices.length,
                    code: 'DEVICE_LIMIT_REACHED'
                });
            }
        }

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
                deviceId: deviceInfo.deviceId
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Update or add device
        const deviceIndex = currentDevices.findIndex(
            d => d && d.deviceId === deviceInfo.deviceId
        );

        if (deviceIndex !== -1) {
            // Update existing device
            const updatedDevice = {
                ...currentDevices[deviceIndex],
                ...deviceInfo,
                token: token,
                loginAt: new Date()
            };
            currentDevices[deviceIndex] = updatedDevice;
        } else {
            // Add new device
            currentDevices.push({
                ...deviceInfo,
                token: token,
                loginAt: new Date()
            });
        }
        
        // Update user's active devices
        user.activeDevices = currentDevices;
        user.changed('activeDevices', true);
        await user.save();

        // Delete OTP
        await deleteOTP(email);

        res.status(200).json({
            message: "User logged in successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isUpgraded: user.isUpgraded,
                maxDevices: user.maxDevices,
                currentDevices: currentDevices.length
            },
            token,
            deviceId: deviceInfo.deviceId
        });
    } catch (error) {
        console.error('Login OTP verification error:', error);
        res.status(500).json({ 
            message: "Server error", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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


export const subscribeToNewsletter = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.isSubscribed = true;
        await user.save();

        res.status(200).json({ message: "Subscribed to newsletter successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

const generateDeviceId = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const rawId = `${userAgent}-${ipAddress}`;
    return crypto.createHash('sha256').update(rawId).digest('hex');
};