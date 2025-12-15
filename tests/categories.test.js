import { jest } from '@jest/globals';

describe('Categories parsing', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('parses JSON stringified categories into an array when creating content', async () => {
    // Arrange - mock dependent modules before importing the controller
    const mockCreate = jest.fn(async (input) => ({ id: '1', ...input, toJSON() { return { id: '1', ...input }; } }));
    jest.unstable_mockModule('../models/Movie.model.js', () => ({ default: { create: mockCreate } }));
    jest.unstable_mockModule('../utils/backblazeB2.js', () => ({ uploadToB2: jest.fn().mockResolvedValue({ secure_url: 'https://example.com/img.jpg', public_id: 'img-id' }), deleteFromB2: jest.fn() }));

    const { addMovie } = await import('../controllers/movieController.js');
    const Movie = (await import('../models/Movie.model.js')).default;

    const req = {
      body: {
        title: 'Test Series',
        overview: 'This is a sufficiently long overview for testing purposes.',
        contentType: 'series',
        categories: '["Drama","Comedy","Animation"]',
        totalSeasons: 1
      },
      files: {
        posterFile: [{ originalname: 'poster.jpg', buffer: Buffer.from(''), mimetype: 'image/jpeg' }],
        backdropFile: [{ originalname: 'backdrop.jpg', buffer: Buffer.from(''), mimetype: 'image/jpeg' }]
      },
      user: { id: 'test-user' }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Act
    await addMovie(req, res);

    // Assert
    expect(mockCreate).toHaveBeenCalled();
    const createdArg = mockCreate.mock.calls[0][0];
    expect(createdArg.categories).toEqual(['Drama', 'Comedy', 'Animation']);
  });
});
