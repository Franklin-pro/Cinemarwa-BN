export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('shares', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    movieId: { type: Sequelize.STRING, allowNull: false },
    userId: { type: Sequelize.STRING, allowNull: false },
    platform: { type: Sequelize.STRING, allowNull: false },
    shareLink: { type: Sequelize.STRING, allowNull: false },
    movieTitle: { type: Sequelize.STRING, allowNull: false },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('shares');
}