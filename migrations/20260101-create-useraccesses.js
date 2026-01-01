export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('UserAccesses', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' } },
    movieId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Movies', key: 'id' } },
    seriesId: { type: Sequelize.UUID, allowNull: true, references: { model: 'Movies', key: 'id' } },
    accessType: { type: Sequelize.ENUM('view','download','series'), defaultValue: 'view' },
    accessPeriod: { type: Sequelize.ENUM('one-time','24h','7d','30d','90d','180d','365d'), defaultValue: 'one-time' },
    pricePaid: { type: Sequelize.DECIMAL(10,2), defaultValue: 0 },
    currency: { type: Sequelize.STRING, defaultValue: 'RWF' },
    expiresAt: { type: Sequelize.DATE, allowNull: true },
    paymentId: { type: Sequelize.STRING, allowNull: true },
    status: { type: Sequelize.ENUM('active','expired','cancelled'), defaultValue: 'active' },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.addIndex('UserAccesses', ['userId']);
  await queryInterface.addIndex('UserAccesses', ['movieId']);
  await queryInterface.addIndex('UserAccesses', ['seriesId']);
  await queryInterface.addIndex('UserAccesses', ['userId','seriesId']);
  await queryInterface.addIndex('UserAccesses', ['expiresAt']);
  await queryInterface.addIndex('UserAccesses', ['status']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('UserAccesses');
}