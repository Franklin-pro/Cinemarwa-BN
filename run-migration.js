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
    logging: true, // Enable logging to see what's happening
  }
);

async function runMigration() {
  try {
    console.log('Running enum fix migration...');
    
    // Drop old enum type if it exists
    await sequelize.query(`DROP TYPE IF EXISTS "enum_Users_authProvider" CASCADE;`);
    console.log('✅ Dropped old enum type');
    
    // Drop new enum type if it exists (to recreate it cleanly)
    await sequelize.query(`DROP TYPE IF EXISTS "public"."enum_users_authProvider" CASCADE;`);
    console.log('✅ Dropped existing new enum type');
    
    // Create new enum type
    await sequelize.query(`
      CREATE TYPE "public"."enum_users_authProvider" AS ENUM('local', 'google', 'both');
    `);
    console.log('✅ Created new enum type');
    
    // Update column to use new enum type
    await sequelize.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "authProvider" 
      TYPE "public"."enum_users_authProvider" 
      USING "authProvider"::"public"."enum_users_authProvider";
    `);
    console.log('✅ Updated authProvider column');
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await sequelize.close();
  }
}

runMigration();
