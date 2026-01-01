import sequelize from '../config/database.js';
import User from './User.modal.js';
import Movie from './Movie.model.js';
import Review from './Review.model.js';
import Payment from './Payment.model.js';
import Withdrawal from './withdrawal.js';
import OTP from './OTP.modal.js';

// ===== DEFINE RELATIONSHIPS =====

// 1. USER -> MOVIE (One-to-Many)
// A user (filmmaker) can create many movies
User.hasMany(Movie, {
    foreignKey: 'filmmakerId',
    as: 'createdMovies',
    onDelete: 'CASCADE'
});

Movie.belongsTo(User, {
    foreignKey: 'filmmakerId',
    as: 'filmmaker'
});

// 2. USER -> REVIEW (One-to-Many)
// A user can write many reviews
User.hasMany(Review, {
    foreignKey: 'userId',
    as: 'writtenReviews',
    onDelete: 'CASCADE'
});

Review.belongsTo(User, {
    foreignKey: 'userId',
    as: 'author'
});

// 3. MOVIE -> REVIEW (One-to-Many)
// A movie can have many reviews
Movie.hasMany(Review, {
    foreignKey: 'movieId',
    as: 'reviews',
    onDelete: 'CASCADE'
});

Review.belongsTo(Movie, {
    foreignKey: 'movieId',
    as: 'movie'
});

// 4. USER -> PAYMENT (One-to-Many)
// A user can make many payments
User.hasMany(Payment, {
    foreignKey: 'userId',
    as: 'payments',
    onDelete: 'CASCADE'
});

Payment.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
});

// 5. USER -> WITHDRAWAL (One-to-Many)
// A user can have many withdrawals
User.hasMany(Withdrawal, {
    foreignKey: 'userId',
    as: 'withdrawals',
    onDelete: 'CASCADE'
});

Withdrawal.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
});

// 5. MOVIE -> PAYMENT (One-to-Many)
// A movie can have many payments (from multiple users)
Movie.hasMany(Payment, {
    foreignKey: 'movieId',
    as: 'payments',
    onDelete: 'CASCADE'
});

Payment.belongsTo(Movie, {
    foreignKey: 'movieId',
    as: 'movie'
});

// Payment -> Withdrawal (One-to-Many)
// A payment can have many withdrawals (automatic payouts, admin fee records)
Payment.hasMany(Withdrawal, {
    foreignKey: 'paymentId',
    as: 'withdrawals',
    onDelete: 'SET NULL'
});

Withdrawal.belongsTo(Payment, {
    foreignKey: 'paymentId',
    as: 'payment'
});

// 6. APPROVED_BY relationship (Self-referencing for User)
// An admin user can approve/reject other users
User.hasMany(User, {
    foreignKey: 'blockedBy',
    as: 'blockedUsers',
    onDelete: 'SET NULL'
});

User.belongsTo(User, {
    foreignKey: 'blockedBy',
    as: 'blockedByAdmin'
});

// ===== MOVIE RATINGS THROUGH REVIEWS =====
// Calculate avgRating through Review associations (virtual)
Movie.prototype.getAverageRating = async function() {
    const reviews = await this.getReviews();
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(2);
};

// ===== FILMMAKER STATISTICS THROUGH RELATIONSHIPS =====
User.prototype.getFilmmakerStats = async function() {
    const movies = await this.getCreatedMovies();
    const totalMovies = movies.length;
    const totalViews = movies.reduce((sum, m) => sum + (m.totalViews || 0), 0);
    const totalDownloads = movies.reduce((sum, m) => sum + (m.totalDownloads || 0), 0);
    const totalRevenue = movies.reduce((sum, m) => sum + (m.totalRevenue || 0), 0);
    const totalEarnings = (totalRevenue * (this.filmmmakerFinancePlatformFeePercentage || 95)) / 100;

    return {
        totalMovies,
        totalViews,
        totalDownloads,
        totalRevenue,
        totalEarnings
    };
};

// ===== USER APPROVAL HELPER =====
User.prototype.approveFilmmaker = async function(approvedBy) {
    await this.update({
        approvalStatus: 'approved',
        approvalHistory: [
            ...this.approvalHistory,
            {
                status: 'approved',
                approvedBy: approvedBy,
                approvedAt: new Date()
            }
        ]
    });
};

User.prototype.rejectFilmmaker = async function(approvedBy, reason) {
    await this.update({
        approvalStatus: 'rejected',
        rejectionReason: reason,
        approvalHistory: [
            ...this.approvalHistory,
            {
                status: 'rejected',
                approvedBy: approvedBy,
                reason: reason,
                approvedAt: new Date()
            }
        ]
    });
};

// ===== PAYMENT HELPER =====
Payment.prototype.getEarningsBreakdown = function() {
    const adminShare = (this.amount * 5) / 100;
    const filmmmakerShare = (this.amount * 95) / 100;
    return {
        totalAmount: this.amount,
        filmmmakerEarnings: filmmmakerShare,
        adminEarnings: adminShare,
        currency: this.currency
    };
};

// ===== MOVIE HELPER =====
Movie.prototype.incrementViews = async function() {
    await this.increment('totalViews', { by: 1 });
};

Movie.prototype.incrementDownloads = async function() {
    await this.increment('totalDownloads', { by: 1 });
};

Movie.prototype.updateRevenue = async function(amount) {
    await this.increment('totalRevenue', { by: amount });
};

// Ensure DB enum for withdrawals includes required values (safety for existing databases)
(async function ensureWithdrawalEnums() {
    // Ensure status enum has 'rejected'
    try {
        const [statusRows] = await sequelize.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'enum_withdrawals_status'");
        const statusLabels = statusRows.map(r => r.enumlabel);
        if (!statusLabels.includes('rejected')) {
            await sequelize.query("ALTER TYPE enum_withdrawals_status ADD VALUE 'rejected'", { raw: true });
            console.log("✅ Added 'rejected' value to enum_withdrawals_status");
        }
    } catch (err) {
        console.warn("⚠️ Could not ensure 'rejected' in enum_withdrawals_status:", err.message);
    }

    // Ensure type enum contains all expected types
    try {
        const expectedTypes = ['filmmaker_earning', 'admin_fee', 'manual_withdrawal', 'automatic_payout', 'subscription_admin_fee', 'series_access_admin_fee'];
        const [typeRows] = await sequelize.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'enum_withdrawals_type'");
        const typeLabels = typeRows.map(r => r.enumlabel);
        for (const t of expectedTypes) {
            if (!typeLabels.includes(t)) {
                await sequelize.query(`ALTER TYPE enum_withdrawals_type ADD VALUE '${t}'`, { raw: true });
                console.log(`✅ Added '${t}' to enum_withdrawals_type`);
            }
        }
    } catch (err) {
        console.warn("⚠️ Could not ensure values in enum_withdrawals_type:", err.message);
    }
})();

// ===== MODEL EXPORTS =====
export {
    User,
    Movie,
    Review,
    Payment,
    Withdrawal,
    OTP,
    sequelize
};

export default {
    User,
    Movie,
    Review,
    Payment,
    Withdrawal,
    OTP,
    sequelize
};
