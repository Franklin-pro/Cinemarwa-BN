import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Withdrawal = sequelize.define('Withdrawal', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 100, // Minimum withdrawal 100 RWF
    },
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'RWF',
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending',
  },
  referenceId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  paymentId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Payments',
      key: 'id',
    },
    comment: 'Associated payment that triggered this withdrawal',
  },
  type: {
    type: DataTypes.ENUM('filmmaker_earning', 'admin_fee', 'manual_withdrawal'),
    allowNull: false,
    defaultValue: 'filmmaker_earning',
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  failureReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
}, {
  tableName: 'withdrawals',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['referenceId'] },
    { fields: ['paymentId'] },
    { fields: ['createdAt'] },
  ],
});

export default Withdrawal;