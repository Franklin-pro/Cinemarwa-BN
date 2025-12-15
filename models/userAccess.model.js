import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const UserAccess = sequelize.define(
  "UserAccess",
  {
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
        key: 'id'
      }
    },
    movieId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Movies',
        key: 'id'
      }
    },
    // For series access
    seriesId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Movies',
        key: 'id'
      }
    },
    accessType: {
      type: DataTypes.ENUM("view", "download", "series"),
      defaultValue: "view",
    },
    accessPeriod: {
      type: DataTypes.ENUM("one-time", "24h", "7d", "30d", "90d", "180d", "365d"),
      defaultValue: "one-time",
    },
    pricePaid: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING,
      defaultValue: "RWF",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "expired", "cancelled"),
      defaultValue: "active",
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["movieId"] },
      { fields: ["seriesId"] },
      { fields: ["userId", "seriesId"] },
      { fields: ["expiresAt"] },
      { fields: ["status"] },
    ],
  }
);

export default UserAccess;