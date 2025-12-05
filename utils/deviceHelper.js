// utils/deviceHelper.js (Backend)
import crypto from 'crypto';

export const getDeviceInfo = (req) => {
    // Safely extract IP address with multiple fallbacks
    const getClientIp = (request) => {
        // Check headers first (when behind proxy)
        const headers = request.headers || {};
        return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               headers['x-real-ip'] ||
               request.ip ||
               request.connection?.remoteAddress ||
               request.socket?.remoteAddress ||
               request.connection?.socket?.remoteAddress ||
               '0.0.0.0';
    };

    const userAgent = req.headers['user-agent'] || '';
    const ip = getClientIp(req);
    
    // Get device fingerprint from headers or request body
    const deviceFingerprint = req.headers['x-device-fingerprint'] || 
                             req.body?.deviceFingerprint || 
                             '';

    // Generate device ID using fingerprint if available
    const deviceId = deviceFingerprint 
        ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex')
        : crypto.createHash('md5').update(userAgent + ip).digest('hex');

    return {
        deviceId: deviceId,
        userAgent: userAgent,
        ipAddress: ip,
        deviceFingerprint: deviceFingerprint,
        lastActive: new Date(),
        deviceName: extractDeviceName(userAgent),
        loginAt: new Date()
    };
};

const extractDeviceName = (userAgent) => {
    if (!userAgent) return 'Unknown Device';
    
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('android')) return 'Android Device';
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('windows')) return 'Windows PC';
    if (ua.includes('mac os')) return 'Mac';
    if (ua.includes('linux')) return 'Linux PC';
    if (ua.includes('chrome')) return 'Chrome Browser';
    if (ua.includes('firefox')) return 'Firefox Browser';
    if (ua.includes('safari')) return 'Safari Browser';
    
    return 'Unknown Device';
};