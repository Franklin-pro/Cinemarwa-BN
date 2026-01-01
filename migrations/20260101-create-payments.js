export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Payments', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    amount: { type: Sequelize.DECIMAL(15,2), allowNull: false },
    currency: { type: Sequelize.STRING, allowNull: false },
    paymentMethod: { type: Sequelize.STRING, allowNull: false },
    paymentStatus: { type: Sequelize.STRING, allowNull: false },
    filmmakerId: { type: Sequelize.UUID, allowNull: false },
    paymentDate: { type: Sequelize.DATE, allowNull: false },
    type: { type: Sequelize.ENUM('movie_watch','movie_download','subscription_upgrade','subscription_renewal'), allowNull: false },
    userId: { type: Sequelize.UUID, allowNull: false },
    movieId: { type: Sequelize.UUID, allowNull: false },
    filmmakerAmount: { type: Sequelize.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
    adminAmount: { type: Sequelize.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
    referenceId: Sequelize.STRING,
    phoneNumber: Sequelize.STRING,
    exchangeRate: Sequelize.DECIMAL(10,4),
    expiresAt: Sequelize.DATE,
    accessPeriod: Sequelize.STRING,
    contentType: Sequelize.STRING,
    seriesId: Sequelize.UUID,
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Payments');
}