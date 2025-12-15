import {
  getWelcomeEmailTemplate,
} from '../templates/WelcomeEmailTemplate.js';
import {
  getNotificationEmailTemplate,
} from '../templates/notificationsEmailTemplate.js';
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
    console.error(error);
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
    console.error(error);
    return false;
  }
};
