import { subscribeEmail, notificationSubscribers } from "../utils/subscribeEmail.js";
import Subscribe from "../models/subscribes.js"; // Make sure this path is correct

// Subscribe controller
export const subscribeCinemaRwa = async (req, res) => {
    const { email } = req.body;
    
    try {
        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({ message: 'Valid email is required' });
        }

        // Check for existing subscriber using Sequelize
        const existingSubscriber = await Subscribe.findOne({ where: { email } });
        if (existingSubscriber) {
            return res.status(400).json({ message: 'Email already subscribed' });
        }

        // Create new subscriber
        const newSubscriber = await Subscribe.create({ email });
        
        // Send welcome email
        await subscribeEmail(email);
        
        res.status(201).json({ 
            message: 'Subscription successful',
            data: newSubscriber
        });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Notify all active subscribers
// Notify all active subscribers
// Accepts: multipart/form-data with fields `subject`, `message` and optional file field `image`.
// The `image` will be attached inline to the email and displayed inside the message
export const notifySubscribers = async (req, res) => {
    const { subject, message } = req.body;
    const file = req.file; // optional single file upload
    
    // Validate input
    if (!subject || !message) {
        return res.status(400).json({ message: 'Subject and message are required' });
    }

    try {
        // Get only active subscribers
        const subscribers = await Subscribe.findAll({
            where: { status: 'active' },
            attributes: ['email']
        });

        if (subscribers.length === 0) {
            return res.status(404).json({ message: 'No active subscribers found' });
        }

        // Send emails to all active subscribers. If a file is included, attach it.
        const emailPromises = subscribers.map(subscriber => 
            notificationSubscribers(subscriber.email, subject, message, file)
        );

        const results = await Promise.allSettled(emailPromises);
        
        // Count successful/failed emails
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        res.status(200).json({ 
            message: 'Notifications sent',
            data: {
                total: subscribers.length,
                successful,
                failed
            }
        });
    } catch (error) {
        console.error('Notification error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const changeSubscribeStatus = async (req, res) => {
    const { email, status } = req.body;
    
    // Validate input
    if (!email || !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ 
            message: 'Valid email and status (active/inactive) are required' 
        });
    }

    try {
        const subscriber = await Subscribe.findOne({ where: { email } });
        if (!subscriber) {
            return res.status(404).json({ message: 'Subscriber not found' });
        }
        
        subscriber.status = status;
        await subscriber.save();
        
        res.status(200).json({ 
            message: 'Subscription status updated successfully',
            data: subscriber
        });
    } catch (error) {
        console.error('Status change error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getSubscribers = async (req, res) => {
    try {
        // Optional: Add pagination
        const { status } = req.query;
        const whereClause = status ? { status } : {};
        
        const subscribers = await Subscribe.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });
        
        res.status(200).json({
            count: subscribers.length,
            data: subscribers
        });
    } catch (error) {
        console.error('Get subscribers error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};