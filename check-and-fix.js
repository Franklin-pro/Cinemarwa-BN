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

async function checkAndFix() {
  try {
    console.log('Checking current tables...');
    
    // Check what tables exist
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('Current tables:', tables.map(t => t.table_name));
    
    // Check enum types
    const [enums] = await sequelize.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
      ORDER BY typname;
    `);
    
    console.log('Current enum types:', enums.map(e => e.typname));
    
    // Fix enum types if needed
    console.log('Fixing enum types...');
    
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
    
    // Update columns if they exist
    try {
      await sequelize.query(`ALTER TABLE users ALTER COLUMN authProvider TYPE enum_users_authProvider USING authProvider::enum_users_authProvider;`);
      console.log('✅ Updated authProvider column');
    } catch (e) {
      console.log('authProvider column update skipped:', e.message);
    }
    
    try {
      await sequelize.query(`ALTER TABLE users ALTER COLUMN role TYPE enum_users_role USING role::enum_users_role;`);
      console.log('✅ Updated role column');
    } catch (e) {
      console.log('role column update skipped:', e.message);
    }
    
    try {
      await sequelize.query(`ALTER TABLE users ALTER COLUMN approvalStatus TYPE enum_users_approvalStatus USING approvalStatus::enum_users_approvalStatus;`);
      console.log('✅ Updated approvalStatus column');
    } catch (e) {
      console.log('approvalStatus column update skipped:', e.message);
    }
    
    try {
      await sequelize.query(`ALTER TABLE users ALTER COLUMN filmmmakerFinancePayoutMethod TYPE enum_filmmakerFinancePayoutMethod USING filmmmakerFinancePayoutMethod::enum_filmmakerFinancePayoutMethod;`);
      console.log('✅ Updated filmmmakerFinancePayoutMethod column');
    } catch (e) {
      console.log('filmmakerFinancePayoutMethod column update skipped:', e.message);
    }
    
    console.log('✅ Enum fix completed!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkAndFix();
