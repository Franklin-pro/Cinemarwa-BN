import OTP from "../models/OTP.modal.js";
import { sendOTPEmail } from "./emailService.js";

const OTP_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes
const OTP_LENGTH = 6;

export const generateOTP = () => {
    return Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(OTP_LENGTH, "0");
};

export const createAndSendOTP = async (email) => {
    try {
        // Delete existing OTPs
        await OTP.destroy({ where: { email } });

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_TIME);

        const otpRecord = await OTP.create({
            email,
            otp,
            expiresAt,
            attempts: 0,
            maxAttempts: 3
        });

        const emailResult = await sendOTPEmail(email, otp);

        if (!emailResult.success) {
            await OTP.destroy({ where: { id: otpRecord.id } });

            return {
                success: false,
                message: "Failed to send OTP email",
                error: emailResult.error
            };
        }

        return {
            success: true,
            message: "OTP sent successfully",
            expiresIn: 10
        };
    } catch (error) {
        console.error("Error creating OTP:", error);
        return {
            success: false,
            message: "Failed to create OTP",
            error: error.message
        };
    }
};

// Verify OTP
export const verifyOTP = async (email, otp) => {
    try {
        const otpRecord = await OTP.findOne({ where: { email } });

        if (!otpRecord) {
            return {
                success: false,
                message: "OTP not found. Request a new one.",
                code: "OTP_NOT_FOUND"
            };
        }

        if (new Date() > otpRecord.expiresAt) {
            await OTP.destroy({ where: { id: otpRecord.id } });
            return {
                success: false,
                message: "OTP expired. Request a new one.",
                code: "OTP_EXPIRED"
            };
        }

        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            await OTP.destroy({ where: { id: otpRecord.id } });
            return {
                success: false,
                message: "Max attempts exceeded.",
                code: "MAX_ATTEMPTS_EXCEEDED"
            };
        }

        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();

            const remainingAttempts = otpRecord.maxAttempts - otpRecord.attempts;

            return {
                success: false,
                message: `Invalid OTP. ${remainingAttempts} attempt(s) left.`,
                code: "INVALID_OTP",
                remainingAttempts
            };
        }

        otpRecord.isVerified = true;
        await otpRecord.save();

        return {
            success: true,
            message: "OTP verified successfully"
        };
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return {
            success: false,
            message: "Failed to verify OTP",
            error: error.message
        };
    }
};

export const deleteOTP = async (email) => {
    try {
        await OTP.destroy({ where: { email } });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};
