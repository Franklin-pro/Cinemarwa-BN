import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false, // Completely disable Sequelize logging
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to PostgreSQL Database');
    return sequelize;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error);
    process.exit(1);
  }
};

export const syncDB = async () => {
  try {
    console.log('🔄 Synchronizing database...');
    await sequelize.sync({ 
      alter: process.env.NODE_ENV === 'development',
      logging: false 
    });
    console.log('✅ Database synchronized successfully');
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    throw error;
  }
};

export default sequelize;
