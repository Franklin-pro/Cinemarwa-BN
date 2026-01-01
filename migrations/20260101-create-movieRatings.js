export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('movieRatings', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    rating: { type: Sequelize.INTEGER, allowNull: false },
    comment: { type: Sequelize.STRING, allowNull: true },
    userId: { type: Sequelize.UUID, allowNull: false },
    movieId: { type: Sequelize.UUID, allowNull: false },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('movieRatings');
}