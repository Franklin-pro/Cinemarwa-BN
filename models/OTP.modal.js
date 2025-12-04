import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const OTP = sequelize.define('OTP', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        lowercase: true,
        trim: true,
        index: true
    },
    otp: {
        type: DataTypes.STRING,
        allowNull: false
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Use a scheduled job or query to delete expired OTPs'
    },
    attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    maxAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 3
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: false,
    indexes: [
        { fields: ['email'] },
        { fields: ['expiresAt'] }
    ]
});

export default OTP;
