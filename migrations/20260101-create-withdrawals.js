export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('withdrawals', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' } },
    amount: { type: Sequelize.DECIMAL(10,2), allowNull: false },
    currency: { type: Sequelize.STRING, allowNull: false, defaultValue: 'RWF' },
    phoneNumber: { type: Sequelize.STRING, allowNull: false },
    status: { type: Sequelize.ENUM('pending','processing','completed','failed','cancelled','rejected'), defaultValue: 'pending' },
    referenceId: { type: Sequelize.STRING, allowNull: true, unique: true },
    transactionId: { type: Sequelize.STRING, allowNull: true },
    paymentId: { type: Sequelize.UUID, allowNull: true, references: { model: 'Payments', key: 'id' } },
    type: { type: Sequelize.ENUM('filmmaker_earning','admin_fee','manual_withdrawal','automatic_payout','subscription_admin_fee','series_access_admin_fee'), allowNull: false, defaultValue: 'filmmaker_earning' },
    description: { type: Sequelize.STRING(500), allowNull: true },
    failureReason: { type: Sequelize.STRING(500), allowNull: true },
    processedAt: { type: Sequelize.DATE, allowNull: true },
    completedAt: { type: Sequelize.DATE, allowNull: true },
    metadata: { type: Sequelize.JSON, allowNull: true, defaultValue: {} },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });

  await queryInterface.addIndex('withdrawals', ['userId']);
  await queryInterface.addIndex('withdrawals', ['status']);
  await queryInterface.addIndex('withdrawals', ['type']);
  await queryInterface.addIndex('withdrawals', ['referenceId']);
  await queryInterface.addIndex('withdrawals', ['paymentId']);
  await queryInterface.addIndex('withdrawals', ['createdAt']);
}

export async function down(queryInterface) {
  await queryInterface.dropTable('withdrawals');
}