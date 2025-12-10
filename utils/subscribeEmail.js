import nodemailer from 'nodemailer';

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587, 
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Subscribe email function
export const subscribeEmail = async (email) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Subscription Confirmation',
            text: 'Thank you for subscribing to our newsletter!'
        };

        await transporter.sendMail(mailOptions);
        console.log(`Subscription email sent to ${email}`);
        return true;
    } catch (error) {
        console.error(`Error sending subscription email to ${email}:`, error);
        return false;
    }
};

// Notification function
export const notificationSubscribers = async (email, subject, message) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: subject,
            text: message
        };
        await transporter.sendMail(mailOptions);
        console.log(`Notification email sent to ${email}`);
        return true;
    } catch (error) {
        console.error(`Error sending notification email to ${email}:`, error);
        return false;
    }
};

// Export both functions
export default {
    subscribeEmail,
    notificationSubscribers
};