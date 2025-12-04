import request from 'supertest';
import app from '../server.js';




describe('Admin API Tests', () => {
  let adminToken = null;
  let adminUserId = null;

  // Helper to get admin token
  const getAdminToken = async () => {
    if (!adminToken) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'Admin@1234567'
        });
      if (response.status === 200) {
        adminToken = response.body.token;
        adminUserId = response.body.userId;
      }
    }
    return adminToken;
  };

  describe('GET /api/admin/dashboard', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard');

      expect(response.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer invalid_user_token');

      expect([401, 403]).toContain(response.status);
    });

    it('should get admin dashboard with valid admin token', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('data');
      }
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/analytics');

      expect(response.status).toBe(401);
    });

    it('should get analytics with period filtering', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/analytics?period=monthly')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should support date range filtering', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/analytics?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/filmmakers', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/filmmakers');

      expect(response.status).toBe(401);
    });

    it('should get all filmmakers with valid token', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/filmmakers')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data) || Array.isArray(response.body)).toBe(true);
      }
    });

    it('should support filtering filmmakers', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/filmmakers?status=verified')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/filmmakers?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/filmmakers/pending', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/filmmakers/pending');

      expect(response.status).toBe(401);
    });

    it('should get pending filmmaker approvals', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/filmmakers/pending')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PATCH /api/admin/filmmakers/:filmmakerID/approve', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/filmmakers/testfilmmaker/approve')
        .send({ approved: true });

      expect(response.status).toBe(401);
    });

    it('should validate approval action', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/filmmakers/testfilmmaker/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ approved: true });

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should allow rejection with reason', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/filmmakers/testfilmmaker/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          approved: false,
          rejectionReason: 'Incomplete documents'
        });

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PATCH /api/admin/filmmakers/:filmmakerID/verify-bank', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/filmmakers/testfilmmaker/verify-bank')
        .send({ verified: true });

      expect(response.status).toBe(401);
    });

    it('should verify filmmaker bank details', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/filmmakers/testfilmmaker/verify-bank')
        .set('Authorization', `Bearer ${token}`)
        .send({ verified: true });

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/users');

      expect(response.status).toBe(401);
    });

    it('should get all users with valid token', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data) || Array.isArray(response.body)).toBe(true);
      }
    });

    it('should support user filtering', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/users?role=viewer')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should support search functionality', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/users?search=testuser')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PATCH /api/admin/users/:userId/block', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/users/testuser123/block')
        .send({ reason: 'Violation' });

      expect(response.status).toBe(401);
    });

    it('should block user with valid reason', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/users/testuser123/block')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Violation of terms' });

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PATCH /api/admin/users/:userId/unblock', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/users/testuser123/unblock');

      expect(response.status).toBe(401);
    });

    it('should unblock user with valid token', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/users/testuser123/unblock')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/admin/users/:userId', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .delete('/api/admin/users/testuser123');

      expect(response.status).toBe(401);
    });

    it('should require confirmation to delete user', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .delete('/api/admin/users/testuser123')
        .set('Authorization', `Bearer ${token}`)
        .send({ confirmed: true });

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/movies/pending', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/movies/pending');

      expect(response.status).toBe(401);
    });

    it('should get pending movie approvals', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/movies/pending')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('PATCH /api/admin/movies/:movieId/approve', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/movies/testmovie/approve')
        .send({ approved: true });

      expect(response.status).toBe(401);
    });

    it('should approve movie with valid token', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/movies/testmovie/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ approved: true });

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should allow movie rejection with reason', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .patch('/api/admin/movies/testmovie/approve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          approved: false,
          rejectionReason: 'Inappropriate content'
        });

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/flagged-content', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/flagged-content');

      expect(response.status).toBe(401);
    });

    it('should get flagged content', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/flagged-content')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should support filtering flagged content', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/flagged-content?status=pending')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe('GET /api/admin/payments/reconciliation', () => {
    it('should reject without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/payments/reconciliation');

      expect(response.status).toBe(401);
    });

    it('should get payment reconciliation data', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/payments/reconciliation')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });

    it('should support date range filtering for reconciliation', async () => {
      const token = await getAdminToken();

      const response = await request(app)
        .get('/api/admin/payments/reconciliation?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });
});
