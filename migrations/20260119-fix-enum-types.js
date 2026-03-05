export async function up(queryInterface, Sequelize) {
  // Fix enum type naming conflict after table rename
  try {
    // Drop the old enum type if it exists
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_Users_authProvider" CASCADE;`);
    
    // Create the new enum type
    await queryInterface.sequelize.query(`
      CREATE TYPE "public"."enum_users_authProvider" AS ENUM('local', 'google', 'both');
    `);
    
    // Update the column to use the new enum type
    await queryInterface.sequelize.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "authProvider" 
      TYPE "public"."enum_users_authProvider" 
      USING "authProvider"::"public"."enum_users_authProvider";
    `);
  } catch (error) {
    console.log('Enum fix migration error (might be already fixed):', error.message);
  }
}

export async function down(queryInterface, Sequelize) {
  // Revert the enum changes
  try {
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_users_authProvider" CASCADE;`);
    
    await queryInterface.sequelize.query(`
      CREATE TYPE "public"."enum_Users_authProvider" AS ENUM('local', 'google', 'both');
    `);
    
    await queryInterface.sequelize.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "authProvider" 
      TYPE "public"."enum_Users_authProvider" 
      USING "authProvider"::"public"."enum_Users_authProvider";
    `);
  } catch (error) {
    console.log('Enum revert migration error:', error.message);
  }
}
