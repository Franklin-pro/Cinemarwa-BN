export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('OTPs', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    email: { type: Sequelize.STRING, allowNull: false },
    otp: { type: Sequelize.STRING, allowNull: false },
    expiresAt: { type: Sequelize.DATE, allowNull: false },
    attempts: { type: Sequelize.INTEGER, defaultValue: 0 },
    maxAttempts: { type: Sequelize.INTEGER, defaultValue: 3 },
    isVerified: { type: Sequelize.BOOLEAN, defaultValue: false },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('OTPs');
}