export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('subscribe', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: Sequelize.STRING, allowNull: false, unique: true },
    status: { type: Sequelize.ENUM('active','inactive'), defaultValue: 'active' },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('subscribe');
}