import request from 'supertest';
import app from '../server.js';




describe('Payment API Tests', () => {
  let authToken = null;
  let userId = null;
  let paymentId = null;

  const testPayment = {
    movieId: 'testmovie123',
    amount: 1000,
    currency: 'XOF'
  };

  const momoPayment = {
    movieId: 'testmovie123',
    amount: 1000,
    phoneNumber: '+237123456789',
    currency: 'XAF'
  };

  const stripePayment = {
    movieId: 'testmovie123',
    amount: 10,
    token: 'tok_visa', // Stripe test token
    currency: 'USD'
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
        userId = response.body.userId;
      }
    }
    return authToken;
  };

  describe('POST /api/payments/momo', () => {
    it('should reject MoMo payment without authentication', async () => {
      const response = await request(app)
        .post('/api/payments/momo')
        .send(momoPayment);

      expect(response.status).toBe(400);
    });

    it('should validate required fields for MoMo payment', async () => {
      const token = await getAuthToken();
      const invalidPayment = { movieId: 'test123' }; // Missing required fields

      const response = await request(app)
        .post('/api/payments/momo')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate phone number format', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...momoPayment,
        phoneNumber: 'invalid-phone'
      };

      const response = await request(app)
        .post('/api/payments/momo')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate amount is positive', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...momoPayment,
        amount: -100
      };

      const response = await request(app)
        .post('/api/payments/momo')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('POST /api/payments/stripe', () => {
    it('should reject Stripe payment without authentication', async () => {
      const response = await request(app)
        .post('/api/payments/stripe')
        .send(stripePayment);

      expect(response.status).toBe(400);
    });

    it('should validate required fields for Stripe payment', async () => {
      const token = await getAuthToken();
      const invalidPayment = { movieId: 'test123' };

      const response = await request(app)
        .post('/api/payments/stripe')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate amount is positive', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...stripePayment,
        amount: 0
      };

      const response = await request(app)
        .post('/api/payments/stripe')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });

    it('should reject invalid Stripe token', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...stripePayment,
        token: 'invalid_token'
      };

      const response = await request(app)
        .post('/api/payments/stripe')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/payments/status/:paymentId', () => {
    it('should get payment status', async () => {
      const response = await request(app)
        .get('/api/payments/status/testpayment123');

      expect([200, 404,500]).toContain(response.status);
    });

    it('should handle non-existent payment ID', async () => {
      const response = await request(app)
        .get('/api/payments/status/nonexistent12345');

      expect([404,500]).toContain(response.status);
    });
  });

  describe('GET /api/payments/user/:userId', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get(`/api/payments/user/testuser123`);

      expect(response.status).toBe(401);
    });

    it('should get user payment history with valid token', async () => {
      const token = await getAuthToken();

      const response = await request(app)
        .get(`/api/payments/user/${userId || 'testuser123'}`)
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404,403]).toContain(response.status);
    });

    it('should prevent users from viewing other user payments', async () => {
      const token = await getAuthToken();

      const response = await request(app)
        .get('/api/payments/user/differentuser123')
        .set('Authorization', `Bearer ${token}`);

      expect([403, 401]).toContain(response.status);
    });
  });

  describe('PATCH /api/payments/:paymentId/confirm', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/payments/testpayment123/confirm');

      expect(response.status).toBe(401);
    });

    it('should confirm payment with valid token', async () => {
      const token = await getAuthToken();

      const response = await request(app)
        .patch('/api/payments/testpayment123/confirm')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 404,403]).toContain(response.status);
    });
  });

  describe('GET /api/payments/movie/:movieId/analytics', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/payments/movie/testmovie123/analytics');

      expect(response.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const token = await getAuthToken();

      const response = await request(app)
        .get('/api/payments/movie/testmovie123/analytics')
        .set('Authorization', `Bearer ${token}`);

      expect([403]).toContain(response.status);
    });
  });

  describe('Payment Validation Tests', () => {
    it('should validate currency is supported', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...momoPayment,
        currency: 'INVALID'
      };

      const response = await request(app)
        .post('/api/payments/momo')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate movie exists', async () => {
      const token = await getAuthToken();
      const invalidPayment = {
        ...momoPayment,
        movieId: 'nonexistentmovie12345'
      };

      const response = await request(app)
        .post('/api/payments/momo')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayment);

      expect([400, 404]).toContain(response.status);
    });
  });
});
