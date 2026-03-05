export async function up(queryInterface, Sequelize) {
  // Users
  await queryInterface.addIndex('Users', ['email']);
  await queryInterface.addIndex('Users', ['googleId']);
  await queryInterface.addIndex('Users', ['role']);
  await queryInterface.addIndex('Users', ['approvalStatus']);
  await queryInterface.addIndex('Users', ['isBlocked']);

  // Movies
  await queryInterface.addIndex('Movies', ['filmmakerId']);
  await queryInterface.addIndex('Movies', ['status']);
  await queryInterface.addIndex('Movies', ['slug']);
  await queryInterface.addIndex('Movies', ['createdAt']);
  await queryInterface.addIndex('Movies', ['avgRating','totalViews']);
  await queryInterface.addIndex('Movies', ['viewPrice']);
  await queryInterface.addIndex('Movies', ['downloadPrice']);
  await queryInterface.addIndex('Movies', ['contentType']);
  await queryInterface.addIndex('Movies', ['seriesId']);
  await queryInterface.addIndex('Movies', ['seriesId','seasonNumber']);
  await queryInterface.addIndex('Movies', ['seriesId','seasonNumber','episodeNumber'], { unique: true });
  await queryInterface.addIndex('Movies', ['seriesId','status']);
  await queryInterface.addIndex('Movies', ['title']);
  await queryInterface.addIndex('Movies', ['language']);
  await queryInterface.addIndex('Movies', ['original_language']);
  await queryInterface.addIndex('Movies', ['isFeatured']);
  await queryInterface.addIndex('Movies', ['isTrending']);
  await queryInterface.addIndex('Movies', ['popularity']);
  await queryInterface.addIndex('Movies', ['vote_average']);
  await queryInterface.addIndex('Movies', ['totalRevenue']);
  await queryInterface.addIndex('Movies', ['release_date']);
  await queryInterface.addIndex('Movies', ['ageRestriction']);
  await queryInterface.addIndex('Movies', ['contentType','status','createdAt']);
  await queryInterface.addIndex('Movies', ['filmmakerId','status','createdAt']);

  // OTPs
  await queryInterface.addIndex('OTPs', ['email']);
  await queryInterface.addIndex('OTPs', ['expiresAt']);

  // MovieRatings
  await queryInterface.addIndex('movieRatings', ['userId']);
  await queryInterface.addIndex('movieRatings', ['movieId']);

  // Reviews
  await queryInterface.addIndex('Reviews', ['movieId']);
  await queryInterface.addIndex('Reviews', ['userId']);

  // Shares
  await queryInterface.addIndex('shares', ['movieId']);
  await queryInterface.addIndex('shares', ['userId']);

  // Payments
  await queryInterface.addIndex('Payments', ['filmmakerId']);
  await queryInterface.addIndex('Payments', ['userId']);
  await queryInterface.addIndex('Payments', ['movieId']);
  await queryInterface.addIndex('Payments', ['paymentStatus']);
  await queryInterface.addIndex('Payments', ['paymentDate']);
}

export async function down(queryInterface) {
  // reverse: remove indexes
  await queryInterface.removeIndex('Users', ['email']);
  await queryInterface.removeIndex('Users', ['googleId']);
  await queryInterface.removeIndex('Users', ['role']);
  await queryInterface.removeIndex('Users', ['approvalStatus']);
  await queryInterface.removeIndex('Users', ['isBlocked']);

  await queryInterface.removeIndex('Movies', ['filmmakerId']);
  await queryInterface.removeIndex('Movies', ['status']);
  await queryInterface.removeIndex('Movies', ['slug']);
  await queryInterface.removeIndex('Movies', ['createdAt']);
  await queryInterface.removeIndex('Movies', ['avgRating','totalViews']);
  await queryInterface.removeIndex('Movies', ['viewPrice']);
  await queryInterface.removeIndex('Movies', ['downloadPrice']);
  await queryInterface.removeIndex('Movies', ['contentType']);
  await queryInterface.removeIndex('Movies', ['seriesId']);
  await queryInterface.removeIndex('Movies', ['seriesId','seasonNumber']);
  await queryInterface.removeIndex('Movies', ['seriesId','seasonNumber','episodeNumber']);
  await queryInterface.removeIndex('Movies', ['seriesId','status']);
  await queryInterface.removeIndex('Movies', ['title']);
  await queryInterface.removeIndex('Movies', ['language']);
  await queryInterface.removeIndex('Movies', ['original_language']);
  await queryInterface.removeIndex('Movies', ['isFeatured']);
  await queryInterface.removeIndex('Movies', ['isTrending']);
  await queryInterface.removeIndex('Movies', ['popularity']);
  await queryInterface.removeIndex('Movies', ['vote_average']);
  await queryInterface.removeIndex('Movies', ['totalRevenue']);
  await queryInterface.removeIndex('Movies', ['release_date']);
  await queryInterface.removeIndex('Movies', ['ageRestriction']);
  await queryInterface.removeIndex('Movies', ['contentType','status','createdAt']);
  await queryInterface.removeIndex('Movies', ['filmmakerId','status','createdAt']);

  await queryInterface.removeIndex('OTPs', ['email']);
  await queryInterface.removeIndex('OTPs', ['expiresAt']);

  await queryInterface.removeIndex('movieRatings', ['userId']);
  await queryInterface.removeIndex('movieRatings', ['movieId']);

  await queryInterface.removeIndex('Reviews', ['movieId']);
  await queryInterface.removeIndex('Reviews', ['userId']);

  await queryInterface.removeIndex('shares', ['movieId']);
  await queryInterface.removeIndex('shares', ['userId']);

  await queryInterface.removeIndex('Payments', ['filmmakerId']);
  await queryInterface.removeIndex('Payments', ['userId']);
  await queryInterface.removeIndex('Payments', ['movieId']);
  await queryInterface.removeIndex('Payments', ['paymentStatus']);
  await queryInterface.removeIndex('Payments', ['paymentDate']);
}