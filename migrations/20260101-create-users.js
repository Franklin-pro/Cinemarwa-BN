export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Users', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    password: {
      type: Sequelize.STRING
    },
    googleId: { type: Sequelize.STRING },
    authProvider: {
      type: Sequelize.ENUM('local','google','both'),
      defaultValue: 'local'
    },
    profilePicture: Sequelize.STRING,
    role: {
      type: Sequelize.ENUM('viewer','admin','filmmaker'),
      defaultValue: 'viewer',
      allowNull: false
    },
    isUpgraded: { type: Sequelize.BOOLEAN, defaultValue: false },
    activeDevices: { type: Sequelize.JSON, defaultValue: [] },
    maxDevices: { type: Sequelize.INTEGER, defaultValue: 1 },

    filmmmakerIsVerified: { type: Sequelize.BOOLEAN, defaultValue: false },
    filmmmakerVerifiedAt: Sequelize.DATE,
    filmmmakerBio: Sequelize.TEXT,
    filmmmakerProfileImage: Sequelize.STRING,
    filmmmakerProfilePublicId: Sequelize.STRING,
    filmmmakerBannerImage: Sequelize.STRING,
    filmmmakerBannerPublicId: Sequelize.STRING,
    filmmmakerWebsite: Sequelize.STRING,
    filmmmakerSocialLinks: { type: Sequelize.JSON, defaultValue: {} },
    filmmmakerMomoPhoneNumber: Sequelize.STRING,
    filmmmakerBankDetails: { type: Sequelize.JSON, defaultValue: {} },
    filmmmakerStripeAccountId: Sequelize.STRING,
    filmmmakerPaypalEmail: Sequelize.STRING,

    filmmmakerStatsTotalMovies: { type: Sequelize.INTEGER, defaultValue: 0 },
    filmmmakerStatsTotalViews: { type: Sequelize.INTEGER, defaultValue: 0 },
    filmmmakerStatsTotalDownloads: { type: Sequelize.INTEGER, defaultValue: 0 },
    filmmmakerStatsTotalRevenue: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
    filmmmakerStatsTotalEarnings: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
    filmmmakerStatsAverageRating: { type: Sequelize.DECIMAL(3,2), defaultValue: 0 },
    filmmmakerStatsTotalReviews: { type: Sequelize.INTEGER, defaultValue: 0 },

    filmmmakerFinancePlatformFeePercentage: { type: Sequelize.DECIMAL(5,2), defaultValue: 5 },
    filmmmakerFinancePendingBalance: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
    filmmmakerFinanceWithdrawnBalance: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
    filmmmakerFinanceTotalEarned: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
    filmmmakerFinanceMinimumWithdrawalAmount: { type: Sequelize.DECIMAL(10,2), defaultValue: 50 },
    filmmmakerFinanceLastWithdrawalDate: Sequelize.DATE,
    filmmmakerFinancePayoutMethod: { type: Sequelize.ENUM('bank_transfer','paypal','stripe','momo'), defaultValue: 'bank_transfer' },

    approvalStatus: { type: Sequelize.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
    approvalHistory: { type: Sequelize.JSON, defaultValue: [] },
    rejectionReason: Sequelize.TEXT,

    isBlocked: { type: Sequelize.BOOLEAN, defaultValue: false },
    status: { type: Sequelize.BOOLEAN, defaultValue: true },
    blockedReason: Sequelize.TEXT,
    blockedAt: Sequelize.DATE,
    blockedBy: Sequelize.UUID,

    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Users');
}