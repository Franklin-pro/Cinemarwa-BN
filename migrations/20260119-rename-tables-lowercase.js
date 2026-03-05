export async function up(queryInterface, Sequelize) {
  // Rename all tables to lowercase
  const renamePromises = [
    queryInterface.renameTable('Movies', 'movies'),
    queryInterface.renameTable('Payments', 'payments'),
    queryInterface.renameTable('Users', 'users'),
    queryInterface.renameTable('UserAccesses', 'useraccesses'),
    queryInterface.renameTable('subscribe', 'subscribes'),
    queryInterface.renameTable('shares', 'shares'), // already lowercase
    queryInterface.renameTable('Reviews', 'reviews'),
    queryInterface.renameTable('OTPs', 'otps'),
    queryInterface.renameTable('withdrawals', 'withdrawals'), // already lowercase
    queryInterface.renameTable('movieRatings', 'movieratings')
  ];

  await Promise.all(renamePromises);
}

export async function down(queryInterface, Sequelize) {
  // Revert to original names
  const revertPromises = [
    queryInterface.renameTable('movies', 'Movies'),
    queryInterface.renameTable('payments', 'Payments'),
    queryInterface.renameTable('users', 'Users'),
    queryInterface.renameTable('useraccesses', 'UserAccesses'),
    queryInterface.renameTable('subscribes', 'subscribe'),
    queryInterface.renameTable('shares', 'shares'),
    queryInterface.renameTable('reviews', 'Reviews'),
    queryInterface.renameTable('otps', 'OTPs'),
    queryInterface.renameTable('withdrawals', 'withdrawals'),
    queryInterface.renameTable('movieratings', 'movieRatings')
  ];

  await Promise.all(revertPromises);
}
