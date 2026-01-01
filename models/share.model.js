// models/Share.js - Basic version
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Share = sequelize.define('Share', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  movieId: {
    type: DataTypes.STRING, // Use STRING to accept both UUIDs and integers
    allowNull: false,
  },
  userId: {
    type: DataTypes.STRING, // or UUID/STRING based on your User ID type
    allowNull: false,
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  shareLink: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  movieTitle: {
    type: DataTypes.STRING,
    allowNull: false,
  }
}, {
  tableName: 'shares',
  timestamps: true,
});

export default Share;