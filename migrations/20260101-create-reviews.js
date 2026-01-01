export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Reviews', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    movieId: { type: Sequelize.UUID, allowNull: false },
    userId: { type: Sequelize.UUID, allowNull: false },
    rating: { type: Sequelize.INTEGER, allowNull: false },
    comment: Sequelize.TEXT,
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Reviews');
}