export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('Movies', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    filmmakerId: { type: Sequelize.UUID, allowNull: false },
    title: { type: Sequelize.STRING, allowNull: false },
    slug: { type: Sequelize.STRING, unique: true },
    description: Sequelize.TEXT,
    language: { type: Sequelize.STRING, defaultValue: 'en' },
    original_language: { type: Sequelize.STRING, defaultValue: 'en' },

    streamingUrl: Sequelize.STRING,
    videoUrl: Sequelize.STRING,
    hlsUrl: Sequelize.STRING,
    videoQuality: Sequelize.STRING,
    videoDuration: Sequelize.FLOAT,
    fileSize: Sequelize.FLOAT,

    poster: Sequelize.STRING,
    backdrop: Sequelize.STRING,
    thumbnail: Sequelize.STRING,

    posterPublicId: Sequelize.STRING,
    backdropPublicId: Sequelize.STRING,

    categories: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
    tags: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },

    geoRestrictions: { type: Sequelize.JSONB, defaultValue: {} },

    ageRestriction: { type: Sequelize.INTEGER, defaultValue: 0 },
    shareCount: { type: Sequelize.INTEGER, defaultValue: 0 },

    price: { type: Sequelize.FLOAT, defaultValue: 0 },
    viewPrice: { type: Sequelize.FLOAT, defaultValue: 0 },
    downloadPrice: { type: Sequelize.FLOAT, defaultValue: 0 },
    currency: { type: Sequelize.STRING, defaultValue: 'RWF' },

    royaltyPercentage: { type: Sequelize.FLOAT, defaultValue: 70 },
    totalRevenue: { type: Sequelize.FLOAT, defaultValue: 0 },

    avgRating: { type: Sequelize.FLOAT, defaultValue: 0 },
    totalReviews: { type: Sequelize.INTEGER, defaultValue: 0 },

    totalViews: { type: Sequelize.INTEGER, defaultValue: 0 },
    popularity: { type: Sequelize.FLOAT, defaultValue: 0 },
    vote_average: { type: Sequelize.FLOAT, defaultValue: 0 },
    vote_count: { type: Sequelize.INTEGER, defaultValue: 0 },

    isFeatured: { type: Sequelize.BOOLEAN, defaultValue: false },
    site: { type: Sequelize.STRING, defaultValue: 'youtube' },
    youtubeTrailerLink: { type: Sequelize.STRING, defaultValue: '' },
    isTrending: { type: Sequelize.BOOLEAN, defaultValue: false },
    status: { type: Sequelize.STRING, defaultValue: 'pending' },

    contentType: { type: Sequelize.STRING, defaultValue: 'movie' },
    seriesId: { type: Sequelize.UUID, allowNull: true },
    seasonNumber: { type: Sequelize.INTEGER, allowNull: true },
    episodeNumber: { type: Sequelize.INTEGER, allowNull: true },

    release_date: Sequelize.DATE,
    uploadedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    processingStatus: { type: Sequelize.STRING, defaultValue: 'completed' },

    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable('Movies');
}