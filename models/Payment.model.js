import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Payment = sequelize.define('Payment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false
    },
    currency: {
        type: DataTypes.STRING,
        allowNull: false
    },
    paymentMethod: {
        type: DataTypes.STRING,
        allowNull: false
    },
    paymentStatus: {
        type: DataTypes.STRING,
        allowNull: false
    },
    filmmakerId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    paymentDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('movie_watch', 'movie_download', 'subscription_upgrade', 'subscription_renewal'),
        allowNull: false,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    movieId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    // === ADD THESE CRITICAL FIELDS ===
    filmmakerAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    adminAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
    },
    // Also add other missing fields from your payment creation code:
    referenceId: {
        type: DataTypes.STRING
    },
    phoneNumber: {
        type: DataTypes.STRING
    },
    exchangeRate: {
        type: DataTypes.DECIMAL(10, 4)
    },
    expiresAt: {
        type: DataTypes.DATE
    },
    accessPeriod: {
        type: DataTypes.STRING
    },
    contentType: {
        type: DataTypes.STRING
    },
    seriesId: {
        type: DataTypes.UUID
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true
});

export default Payment;