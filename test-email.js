import { verifyEmailConnection } from './utils/emailService.js';

console.log('Testing email configuration...');
const isConnected = await verifyEmailConnection();
if (isConnected) {
  console.log('✅ Email configuration is working!');
} else {
  console.log('❌ Email configuration failed. Check your credentials.');
}
