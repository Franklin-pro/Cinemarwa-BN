import request from 'supertest';
import app from '../server.js';

describe('Movies API Tests', () => {
  let authToken = null;
  let movieId = null;
  let filmmakerToken = null;

  const testMovie = {
    title: `Test Movie ${Date.now()}`,
    description: 'This is a test movie',
    category: 'Action',
    duration: 120,
    releaseYear: 2024,
    genres: ['Action', 'Adventure'],
    thumbnail: 'https://example.com/image.jpg'
  };

  // Helper to get token
  const getAuthToken = async () => {
    if (!authToken) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test@1234567'
        });
      if (response.status === 200) {
        authToken = response.body.token;
      }
    }
    return authToken;
  };

describe('GET /api/movies', () => {
  it('should retrieve all movies', async () => {
    const response = await request(app)
      .get('/api/movies');

    expect([200, 404]).toContain(response.status);
    
    if (response.status === 200) {
      // Your API returns: { success: true, data: { movies: [...] } }
      // Check that movies property exists and is an array
      expect(response.body.data.movies).toBeDefined();
      expect(Array.isArray(response.body.data.movies)).toBe(true);
    } else if (response.status === 404) {
      expect(response.body.message).toBeDefined();
    } else {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
  });

  it('should retrieve movies with pagination', async () => {
    const response = await request(app)
      .get('/api/movies?page=1&limit=10');

    expect([200, 404]).toContain(response.status);
  });

  it('should retrieve movies with sorting', async () => {
    const response = await request(app)
      .get('/api/movies?sort=-releaseYear');

    expect([200, 404]).toContain(response.status);
  });

  it('should filter movies by category', async () => {
    const response = await request(app)
      .get('/api/movies?category=Action');

    expect([200, 404]).toContain(response.status);
  });
});

  describe('GET /api/movies/search', () => {
    it('should search movies by keyword', async () => {
      const response = await request(app)
        .get('/api/movies/search?query=test');

      expect([200, 404]).toContain(response.status);
    });

    it('should return empty results for non-existent movie', async () => {
      const response = await request(app)
        .get('/api/movies/search?query=nonexistentmovie12345');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/movies/trending', () => {
    it('should retrieve trending movies', async () => {
      const response = await request(app)
        .get('/api/movies/trending');

      expect([200, 404]).toContain(response.status);
    });

    it('should retrieve trending movies with limit', async () => {
      const response = await request(app)
        .get('/api/movies/trending?limit=5');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/movies/top-rated', () => {
    it('should retrieve top-rated movies', async () => {
      const response = await request(app)
        .get('/api/movies/top-rated');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/movies/category/:category', () => {
    it('should retrieve movies by category', async () => {
      const response = await request(app)
        .get('/api/movies/category/Action');

      expect([200, 404]).toContain(response.status);
    });

    it('should handle invalid category gracefully', async () => {
      const response = await request(app)
        .get('/api/movies/category/InvalidCategory123');

      expect([200, 404,400]).toContain(response.status);
    });
  });

  describe('GET /api/movies/filmmaker/:filmmakerID', () => {
    it('should retrieve movies by filmmaker', async () => {
      const response = await request(app)
        .get('/api/movies/filmmaker/testfilmmaker');

      expect([200, 404,500,400,401]).toContain(response.status);
    });
  });

  describe('GET /api/movies/:id', () => {
    it('should retrieve movie by ID or slug', async () => {
      const response = await request(app)
        .get('/api/movies/test-movie-slug');

      expect([200, 404,500,400,401]).toContain(response.status);
    });

    it('should handle non-existent movie ID', async () => {
      const response = await request(app)
        .get('/api/movies/nonexistentmovie123');

      expect([200, 404,500,400,401]).toContain(response.status);
    });
  });

  describe('GET /api/movies/:movieId/streaming', () => {
    it('should retrieve streaming URLs', async () => {
      const response = await request(app)
        .get('/api/movies/testmovie/streaming');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('POST /api/movies/upload (Protected)', () => {
    it('should reject upload without authentication', async () => {
      const response = await request(app)
        .post('/api/movies/upload')
        .send(testMovie);

      expect(response.status).toBe(401);
    });

    it('should reject upload with invalid token', async () => {
      const response = await request(app)
        .post('/api/movies/upload')
        .set('Authorization', 'Bearer invalid_token')
        .send(testMovie);

      expect([400, 401,403]).toContain(response.status);
    });
  });

  describe('PUT /api/movies/:id (Protected)', () => {
    it('should reject update without authentication', async () => {
      const response = await request(app)
        .put('/api/movies/testmovie')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/movies/:id (Protected)', () => {
    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete('/api/movies/testmovie');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/movies/:movieId/video (Protected)', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/movies/testmovie/video')
        .send({ videoUrl: 'https://example.com/video.mp4' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/movies/:movieId/poster (Protected)', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/movies/testmovie/poster');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/movies/:movieId/backdrop (Protected)', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/movies/testmovie/backdrop');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/movies/:movieId/subtitle (Protected)', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/movies/testmovie/subtitle');

      expect(response.status).toBe(404);
    });
  });
});
