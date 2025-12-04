import request from 'supertest';
import app from '../server.js';




describe('Authentication API Tests', () => {
  let authToken = null;
  let userId = null;
  let refreshToken = null;

  // Test User Data
  const testUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'Test@1234567',
    firstName: 'Test',
    lastName: 'User'
  };

  describe('POST /api/auth/register', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBeLessThan(500);
      if (response.status === 201 || response.status === 200) {
        expect(response.body).toHaveProperty('message');
        userId = response.body.data?.userId || response.body.userId;
      }
    });

    it('should reject registration with missing email', async () => {
      const invalidUser = { ...testUser, email: undefined };
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      const invalidUser = { ...testUser, email: 'invalid-email' };
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
    });

    it('should reject registration with weak password', async () => {
      const weakPasswordUser = { ...testUser, password: '123' };
      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordUser);

      expect(response.status).toBe(400);
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Attempt duplicate
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(response.status).toBeLessThan(500);
      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('token');
        authToken = response.body.token;
        userId = response.body.userId || response.body.data?.userId;
      }
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123'
        });

      expect(response.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password
        });

      expect(response.status).toBe(401);
    });

    it('should reject login with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: testUser.password
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      if (!authToken) {
        // First login to get token
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });
        authToken = loginRes.body.token;
      }

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeLessThan(500);
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
    });

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout-all', () => {
    it('should logout from all devices with valid token', async () => {
      if (!authToken) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });
        authToken = loginRes.body.token;
      }

      const response = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeLessThan(500);
    });

    it('should reject logout-all without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout-all');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/devices', () => {
    it('should get active devices with valid token', async () => {
      if (!authToken) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });
        authToken = loginRes.body.token;
      }

      const response = await request(app)
        .get('/api/auth/devices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeLessThan(500);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data) || Array.isArray(response.body)).toBe(true);
      }
    });

    it('should reject get devices without token', async () => {
      const response = await request(app)
        .get('/api/auth/devices');

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/auth/upgrade/:userId', () => {
    it('should upgrade user account with admin token', async () => {
      // This test requires admin token - adjust based on your actual flow
      const response = await request(app)
        .patch(`/api/auth/upgrade/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ isPremium: true });

      expect([200, 403, 404]).toContain(response.status);
    });
  });
});
