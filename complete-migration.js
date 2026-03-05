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

async function runMigration() {
  try {
    console.log('Running complete table rename and enum fix...');
    
    // 1. First, rename all tables to lowercase
    console.log('Step 1: Renaming tables...');
    await sequelize.query(`ALTER TABLE "Movies" RENAME TO movies;`);
    await sequelize.query(`ALTER TABLE "Payments" RENAME TO payments;`);
    await sequelize.query(`ALTER TABLE "Users" RENAME TO users;`);
    await sequelize.query(`ALTER TABLE "UserAccesses" RENAME TO useraccesses;`);
    await sequelize.query(`ALTER TABLE "subscribe" RENAME TO subscribes;`);
    // shares and withdrawals already lowercase
    // await sequelize.query(`ALTER TABLE "Reviews" RENAME TO reviews;`);
    // await sequelize.query(`ALTER TABLE "OTPs" RENAME TO otps;`);
    // await sequelize.query(`ALTER TABLE "movieRatings" RENAME TO movieratings;`);
    console.log('✅ Tables renamed to lowercase');
    
    // 2. Fix enum types
    console.log('Step 2: Fixing enum types...');
    
    // Drop old enum types
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_authProvider" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_users_role" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_users_approvalStatus" CASCADE;`);
    await sequelize.query(`DROP TYPE IF EXISTS "enum_filmmakerFinancePayoutMethod" CASCADE;`);
    console.log('✅ Dropped old enum types');
    
    // Create new enum types
    await sequelize.query(`CREATE TYPE "enum_users_authProvider" AS ENUM('local', 'google', 'both');`);
    await sequelize.query(`CREATE TYPE "enum_users_role" AS ENUM('viewer', 'admin', 'filmmaker');`);
    await sequelize.query(`CREATE TYPE "enum_users_approvalStatus" AS ENUM('pending', 'approved', 'rejected');`);
    await sequelize.query(`CREATE TYPE "enum_filmmakerFinancePayoutMethod" AS ENUM('bank_transfer', 'paypal', 'stripe', 'momo');`);
    console.log('✅ Created new enum types');
    
    // 3. Update columns to use new enum types
    await sequelize.query(`ALTER TABLE users ALTER COLUMN authProvider TYPE enum_users_authProvider USING authProvider::enum_users_authProvider;`);
    await sequelize.query(`ALTER TABLE users ALTER COLUMN role TYPE enum_users_role USING role::enum_users_role;`);
    await sequelize.query(`ALTER TABLE users ALTER COLUMN approvalStatus TYPE enum_users_approvalStatus USING approvalStatus::enum_users_approvalStatus;`);
    await sequelize.query(`ALTER TABLE users ALTER COLUMN filmmmakerFinancePayoutMethod TYPE enum_filmmakerFinancePayoutMethod USING filmmmakerFinancePayoutMethod::enum_filmmakerFinancePayoutMethod;`);
    console.log('✅ Updated enum columns');
    
    console.log('✅ Complete migration finished successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await sequelize.close();
  }
}

runMigration();
