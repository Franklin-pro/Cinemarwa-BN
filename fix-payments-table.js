// scripts/fix-payments-table.js
import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';

async function fixPaymentsTable() {
  try {
    console.log('🔧 Fixing Payments table structure...');
    
    // Check if type column exists
    const checkColumn = await sequelize.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'Payments' AND column_name = 'type'`,
      { type: QueryTypes.SELECT }
    );
    
    if (checkColumn.length === 0) {
      console.log('📊 Adding type column to Payments table...');
      
      // Create enum type first
      await sequelize.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Payments_type') THEN
            CREATE TYPE "enum_Payments_type" AS ENUM (
              'movie_watch', 
              'movie_download', 
              'subscription_upgrade', 
              'subscription_renewal'
            );
          END IF;
        END $$;
      `);
      
      // Add column with default value
      await sequelize.query(`
        ALTER TABLE "Payments" 
        ADD COLUMN IF NOT EXISTS "type" "enum_Payments_type" 
        DEFAULT 'movie_watch';
      `);
      
      // Add comment
      await sequelize.query(`
        COMMENT ON COLUMN "Payments"."type" IS 'Type of payment: movie access or subscription';
      `);
      
      console.log('✅ Type column added successfully');
    } else {
      console.log('✅ Type column already exists');
    }
    
    // Update any NULL values to default
    const nullCount = await sequelize.query(
      `SELECT COUNT(*) as count FROM "Payments" WHERE "type" IS NULL`,
      { type: QueryTypes.SELECT }
    );
    
    if (nullCount[0].count > 0) {
      console.log(`🔄 Updating ${nullCount[0].count} NULL values to 'movie_watch'...`);
      await sequelize.query(
        `UPDATE "Payments" SET "type" = 'movie_watch' WHERE "type" IS NULL`
      );
      console.log('✅ NULL values updated');
    }
    
    // Now change column to NOT NULL if needed
    console.log('🔧 Setting column to NOT NULL...');
    await sequelize.query(`
      ALTER TABLE "Payments" 
      ALTER COLUMN "type" SET NOT NULL;
    `);
    
    console.log('🎉 Payments table fixed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing Payments table:', error);
    process.exit(1);
  }
}

fixPaymentsTable();