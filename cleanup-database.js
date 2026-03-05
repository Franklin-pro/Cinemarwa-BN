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
    logging: true,
  }
);

async function cleanupAndFix() {
  try {
    console.log('Cleaning up duplicate tables and fixing enums...');
    
    // Drop old uppercase tables (they're duplicates)
    console.log('Step 1: Dropping old uppercase tables...');
    await sequelize.query(`DROP TABLE IF EXISTS "Movies" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "Payments" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "Users" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "UserAccesses" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "Reviews" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "OTPs" CASCADE;`);
    await sequelize.query(`DROP TABLE IF EXISTS "subscribe" CASCADE;`);
    console.log('✅ Dropped old uppercase tables');
    
    // Drop old enum types
    console.log('Step 2: Dropping old enum types...');
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_authProvider" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_role" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_approvalStatus" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_filmmmakerFinancePayoutMethod" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Payments_type" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_UserAccesses_accessPeriod" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_UserAccesses_accessType" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_UserAccesses_status" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_subscribe_status" CASCADE;`);
    console.log('✅ Dropped old enum types');
    
    // Create new enum types (if they don't exist)
    console.log('Step 3: Creating new enum types...');
    try {
      await sequelize.query(`CREATE TYPE "enum_users_authProvider" AS ENUM('local', 'google', 'both');`);
    } catch (e) { console.log('enum_users_authProvider already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_users_role" AS ENUM('viewer', 'admin', 'filmmaker');`);
    } catch (e) { console.log('enum_users_role already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_users_approvalStatus" AS ENUM('pending', 'approved', 'rejected');`);
    } catch (e) { console.log('enum_users_approvalStatus already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_users_filmmmakerFinancePayoutMethod" AS ENUM('bank_transfer', 'paypal', 'stripe', 'momo');`);
    } catch (e) { console.log('enum_users_filmmmakerFinancePayoutMethod already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_payments_type" AS ENUM('movie_watch','movie_download','subscription_upgrade','subscription_renewal');`);
    } catch (e) { console.log('enum_payments_type already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_useraccesses_accessPeriod" AS ENUM("one-time", "24h", "7d", "30d", "90d", "180d", "365d");`);
    } catch (e) { console.log('enum_useraccesses_accessPeriod already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_useraccesses_accessType" AS ENUM("view", "download", "series");`);
    } catch (e) { console.log('enum_useraccesses_accessType already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_useraccesses_status" AS ENUM("active", "expired", "cancelled");`);
    } catch (e) { console.log('enum_useraccesses_status already exists'); }
    
    try {
      await sequelize.query(`CREATE TYPE "enum_subscribes_status" AS ENUM("active", "inactive");`);
    } catch (e) { console.log('enum_subscribes_status already exists'); }
    
    console.log('✅ Enum types ready');
    
    console.log('✅ Cleanup completed! Server should start now.');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

cleanupAndFix();
