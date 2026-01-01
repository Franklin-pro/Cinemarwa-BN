// services/emailService.js
import { getWelcomeEmailTemplate } from '../templates/WelcomeEmailTemplate.js';
import { getNotificationEmailTemplate } from '../templates/notificationsEmailTemplate.js';
import { 
  getPaymentSuccessfulEmailTemplate, 
  getPaymentSuccessfulEmailPlainText
} from '../templates/paymentSuccessful.js';
import transporter from './mailer.js';

export const subscribeEmail = async (email) => {
  try {
    await transporter.sendMail({
      from: `"CinemaRwa" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Our Newsletter 🎉',
      html: getWelcomeEmailTemplate(email)
    });
    return true;
  } catch (error) {
    console.error('Subscribe email error:', error);
    throw error;
  }
};

export const notificationSubscribers = async (email, subject, message, file) => {
  try {
    await transporter.sendMail({
      from: `"CinemaRwa" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html: getNotificationEmailTemplate(subject, message, file ? 'screenshot@cinemarwa' : undefined),
      attachments: file
        ? [{ filename: file.originalname, content: file.buffer, cid: 'screenshot@cinemarwa' }]
        : undefined
    });
    return true;
  } catch (error) {
    console.error('Notification email error:', error);
    return false;
  }
};

export const sendPaymentConfirmation = async ({
  to,
  userName,
  movieTitle,
  amount,
  transactionId,
  paymentMethod,
  moviePosterUrl,
  downloadLink,
  watchLink
}) => {
  try {
    const paymentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const htmlContent = getPaymentSuccessfulEmailTemplate({
      userName,
      movieTitle,
      amount,
      paymentDate,
      transactionId,
      paymentMethod,
      moviePosterUrl,
      downloadLink,
      watchLink
    });

    const textContent = getPaymentSuccessfulEmailPlainText({
      userName,
      movieTitle,
      amount,
      paymentDate,
      transactionId,
      paymentMethod,
      downloadLink,
      watchLink
    });

    await transporter.sendMail({
      from: `"CinemaRwa Payments" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Payment Confirmation - ${movieTitle}`,
      html: htmlContent,
      text: textContent,
      replyTo: 'support@cinemarwa.com'
    });

    console.log(`Payment confirmation email sent to ${to} for transaction ${transactionId}`);
    return true;
  } catch (error) {
    console.error('Payment confirmation email error:', error);
    return false;
  }
};

// Optional: Send payment receipt to admin
export const sendPaymentReceiptToAdmin = async ({
  userName,
  userEmail,
  movieTitle,
  amount,
  transactionId,
  paymentMethod
}) => {
  try {
    await transporter.sendMail({
      from: `"CinemaRwa Payments" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || 'admin@cinemarwa.com',
      subject: `New Payment - ${transactionId}`,
      html: `
        <h2>New Payment Received</h2>
        <p><strong>Customer:</strong> ${userName} (${userEmail})</p>
        <p><strong>Movie:</strong> ${movieTitle}</p>
        <p><strong>Amount:</strong> $${amount}</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
      `,
      text: `
        New Payment Received
        Customer: ${userName} (${userEmail})
        Movie: ${movieTitle}
        Amount: $${amount}
        Transaction ID: ${transactionId}
        Payment Method: ${paymentMethod}
        Date: ${new Date().toLocaleString()}
      `
    });
    return true;
  } catch (error) {
    console.error('Admin receipt email error:', error);
    return false;
  }
};