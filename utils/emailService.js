import nodemailer from "nodemailer";

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Send OTP email
export const sendOTPEmail = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Cine-Verse Login OTP Verification",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center;">
                        <h1 style="color: #333; margin: 0;">Cine-Verse</h1>
                    </div>
                    <div style="padding: 20px; background-color: #fff; border: 1px solid #ddd;">
                        <h2 style="color: #333; margin-top: 0;">OTP Verification</h2>
                        <p style="color: #666; font-size: 16px;">Hi ${email.split("@")[0]},</p>
                        <p style="color: #666; font-size: 16px;">Your One-Time Password (OTP) for Cine-Verse login is:</p>

                        <div style="background-color: #007bff; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
                            <h1 style="color: #fff; margin: 0; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
                        </div>

                        <p style="color: #666; font-size: 14px;">
                            <strong>This OTP is valid for 10 minutes.</strong>
                        </p>
                        <p style="color: #666; font-size: 14px;">
                            If you didn't request this OTP, please ignore this email.
                        </p>

                        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px;">
                            Do not share your OTP with anyone. Cine-Verse support will never ask for your OTP.
                        </p>
                    </div>
                    <div style="padding: 10px; background-color: #f5f5f5; text-align: center; color: #999; font-size: 12px;">
                        <p>&copy; ${new Date().getFullYear()} Cine-Verse. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        return { success: true, message: "OTP sent successfully", messageId: info.messageId };
    } catch (error) {
        console.error("Error sending email:", error);
        return { success: false, message: "Failed to send OTP email", error: error.message };
    }
};

// Verify transporter connection
export const verifyEmailConnection = async () => {
    try {
        await transporter.verify();
        console.log("Email service is ready to send emails");
        return true;
    } catch (error) {
        console.error("Email service error:", error);
        return false;
    }
};

export default transporter;
