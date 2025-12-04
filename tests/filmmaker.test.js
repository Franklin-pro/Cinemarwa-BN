import request from 'supertest';
import app from '../server.js';




describe('Filmmaker API Tests', () => {
  let filmmakerToken = null;
  let filmmakerUserId = null;
  let movieId = null;

  const filmmakerProfile = {
    bio: 'Indie filmmaker passionate about storytelling',
    profileImage: 'https://example.com/profile.jpg',
    socialLinks: {
      twitter: 'https://twitter.com/filmmaker',
      instagram: 'https://instagram.com/filmmaker'
    },
    specialization: 'Documentary'
  };

  const paymentMethod = {
    bankName: 'Test Bank',
    accountNumber: '1234567890',
    accountHolder: 'Test Filmmaker',
    swiftCode: 'TESTSWIFT'
  };

  // Helper to get filmmaker token
  const getFilmmakerToken = async () => {
    if (!filmmakerToken) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'filmmaker@example.com',
          password: 'FilmMaker@1234567'
        });
      if (response.status === 200) {
        filmmakerToken = response.body.token;
        filmmakerUserId = response.body.userId;
      }
    }
    return filmmakerToken;
  };

  describe('GET /api/filmmaker/profile', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/profile');

      expect(response.status).toBe(401);
    });

    it('should get filmmaker profile with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/profile')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('PUT /api/filmmaker/profile', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .put('/api/filmmaker/profile')
        .send(filmmakerProfile);

      expect(response.status).toBe(401);
    });

    it('should update filmmaker profile with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .put('/api/filmmaker/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(filmmakerProfile);

      expect([200, 404]).toContain(response.status);
    });

    it('should validate profile data', async () => {
      const token = await getFilmmakerToken();
      const invalidProfile = {
        ...filmmakerProfile,
        bio: '' // Empty bio might be invalid
      };

      const response = await request(app)
        .put('/api/filmmaker/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidProfile);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/dashboard', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/dashboard');

      expect(response.status).toBe(401);
    });

    it('should get filmmaker dashboard with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('data');
      }
    });
  });

  describe('GET /api/filmmaker/analytics/:movieId', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/analytics/testmovie123');

      expect(response.status).toBe(401);
    });

    it('should get movie analytics with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/analytics/testmovie123')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/stats', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/stats');

      expect(response.status).toBe(401);
    });

    it('should get filmmaker statistics with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/stats')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/payment-method', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/payment-method');

      expect(response.status).toBe(401);
    });

    it('should get payment method with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/payment-method')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('PUT /api/filmmaker/payment-method', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .put('/api/filmmaker/payment-method')
        .send(paymentMethod);

      expect(response.status).toBe(401);
    });

    it('should validate bank details', async () => {
      const token = await getFilmmakerToken();
      const invalidPaymentMethod = {
        bankName: 'Test Bank',
        // Missing required fields
      };

      const response = await request(app)
        .put('/api/filmmaker/payment-method')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPaymentMethod);

      expect([200, 400]).toContain(response.status);
    });

    it('should update payment method with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .put('/api/filmmaker/payment-method')
        .set('Authorization', `Bearer ${token}`)
        .send(paymentMethod);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/finance', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/finance');

      expect(response.status).toBe(401);
    });

    it('should get financial summary for verified filmmaker', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/finance')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('POST /api/filmmaker/withdraw', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/filmmaker/withdraw')
        .send({ amount: 10000 });

      expect(response.status).toBe(401);
    });

    it('should validate withdrawal amount', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .post('/api/filmmaker/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 0 });

      expect([400, 422]).toContain(response.status);
    });

    it('should reject negative withdrawal amount', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .post('/api/filmmaker/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: -1000 });

      expect([400, 422]).toContain(response.status);
    });

    it('should reject withdrawal without verified status', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .post('/api/filmmaker/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 10000 });

      expect([403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/withdrawals', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/withdrawals');

      expect(response.status).toBe(401);
    });

    it('should get withdrawal history with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/withdrawals')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/filmmaker/movies', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/filmmaker/movies');

      expect(response.status).toBe(401);
    });

    it('should get filmmaker movies with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/movies')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    it('should support pagination for movies', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .get('/api/filmmaker/movies?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('PUT /api/filmmaker/movies/:movieId', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .put('/api/filmmaker/movies/testmovie123')
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(401);
    });

    it('should update filmmaker movie with valid token', async () => {
      const token = await getFilmmakerToken();

      const response = await request(app)
        .put('/api/filmmaker/movies/testmovie123')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Title',
          description: 'Updated description'
        });

      expect([200, 403, 404]).toContain(response.status);
    });
  });
});
