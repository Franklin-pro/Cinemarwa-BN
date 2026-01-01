import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        trim: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: DataTypes.STRING
    },
    googleId: {
        type: DataTypes.STRING
    },
    authProvider: {
        type: DataTypes.ENUM('local', 'google', 'both'),
        defaultValue: 'local'
    },
    profilePicture: DataTypes.STRING,
    role: {
        type: DataTypes.ENUM('viewer', 'admin', 'filmmaker'),
        defaultValue: 'viewer',
        allowNull: false
    },
    isUpgraded: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    
    activeDevices: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: 'Array of {deviceId, token, loginAt, userAgent, ipAddress, lastActive}'
    },
    maxDevices: {
        type: DataTypes.INTEGER,
        defaultValue: 1
    },

    // ====== FILMMAKER PROFILE ======
    filmmmakerIsVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    filmmmakerVerifiedAt: DataTypes.DATE,
    filmmmakerBio: DataTypes.TEXT,
    filmmmakerProfileImage: DataTypes.STRING,
    filmmmakerProfilePublicId: DataTypes.STRING,
    filmmmakerBannerImage: DataTypes.STRING,
    filmmmakerBannerPublicId: DataTypes.STRING,
    filmmmakerWebsite: DataTypes.STRING,
    filmmmakerSocialLinks: {
        type: DataTypes.JSON,
        defaultValue: {},
        comment: 'Object with twitter, instagram, youtube, facebook'
    },
    filmmmakerMomoPhoneNumber: DataTypes.STRING,
    filmmmakerBankDetails: {
        type: DataTypes.JSON,
        defaultValue: {},
        comment: 'Object with accountName, accountNumber, bankName, country, swiftCode, isVerified'
    },
    filmmmakerStripeAccountId: DataTypes.STRING,
    filmmmakerPaypalEmail: DataTypes.STRING,

    // ====== FILMMAKER STATISTICS ======
    filmmmakerStatsTotalMovies: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    filmmmakerStatsTotalViews: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    filmmmakerStatsTotalDownloads: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    filmmmakerStatsTotalRevenue: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    filmmmakerStatsTotalEarnings: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    filmmmakerStatsAverageRating: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 0
    },
    filmmmakerStatsTotalReviews: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },

    // ====== FILMMAKER REVENUE & PAYMENTS ======
    filmmmakerFinancePlatformFeePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 5
    },
    filmmmakerFinancePendingBalance: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    filmmmakerFinanceWithdrawnBalance: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    filmmmakerFinanceTotalEarned: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    filmmmakerFinanceMinimumWithdrawalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 50
    },
    filmmmakerFinanceLastWithdrawalDate: DataTypes.DATE,
    filmmmakerFinancePayoutMethod: {
        type: DataTypes.ENUM('bank_transfer', 'paypal', 'stripe', 'momo'),
        defaultValue: 'bank_transfer'
    },

    // ====== USER APPROVAL (FOR FILMMAKERS) ======
    approvalStatus: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
    },
    approvalHistory: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: 'Array of {status, approvedBy, reason, approvedAt}'
    },
    rejectionReason: DataTypes.TEXT,

    // ====== ADMIN FLAGS ======
    isBlocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    blockedReason: DataTypes.TEXT,
    blockedAt: DataTypes.DATE,
    blockedBy: DataTypes.UUID,
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['email'] },
        { fields: ['googleId'] },
        { fields: ['role'] },
        { fields: ['approvalStatus'] },
        { fields: ['isBlocked'] }
    ]
});

export default User;