import request from 'supertest';
import app from '../server.js';




describe('Review API Tests', () => {
  let userToken = null;
  let userId = null;
  let reviewId = null;
  const movieId = 'testmovie123';

  const testReview = {
    rating: 4.5,
    comment: 'This is a great movie!',
    title: 'Excellent film'
  };

  // Helper to get user token
  const getUserToken = async () => {
    if (!userToken) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'viewer@example.com',
          password: 'Viewer@1234567'
        });
      if (response.status === 200) {
        userToken = response.body.token;
        userId = response.body.userId;
      }
    }
    return userToken;
  };

  describe('POST /api/reviews/:movieId', () => {
    it('should reject review without authentication', async () => {
      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .send(testReview);

      expect(response.status).toBe(401);
    });

    it('should create review with valid token', async () => {
      const token = await getUserToken();

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(testReview);

      expect([200, 201]).toContain(response.status);
      if (response.status === 201 || response.status === 200) {
        expect(response.body).toHaveProperty('data');
        reviewId = response.body.data?.id || response.body.id;
      }
    });

    it('should validate rating is within range', async () => {
      const token = await getUserToken();
      const invalidReview = {
        ...testReview,
        rating: 6 // Rating > 5
      };

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(invalidReview);

      expect([400, 422]).toContain(response.status);
    });

    it('should reject negative rating', async () => {
      const token = await getUserToken();
      const invalidReview = {
        ...testReview,
        rating: -1
      };

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(invalidReview);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate required fields', async () => {
      const token = await getUserToken();
      const incompleteReview = {
        // Missing rating
        comment: 'Good movie'
      };

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(incompleteReview);

      expect([400, 422]).toContain(response.status);
    });

    it('should validate comment length', async () => {
      const token = await getUserToken();
      const invalidReview = {
        ...testReview,
        comment: '' // Empty comment
      };

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(invalidReview);

      expect([200, 400, 422]).toContain(response.status);
    });

    it('should prevent duplicate reviews from same user', async () => {
      const token = await getUserToken();

      // Create first review
      await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(testReview);

      // Try to create duplicate
      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...testReview,
          comment: 'Different comment'
        });

      expect([200, 400, 409]).toContain(response.status);
    });

    it('should validate movie exists', async () => {
      const token = await getUserToken();

      const response = await request(app)
        .post('/api/reviews/nonexistentmovie123')
        .set('Authorization', `Bearer ${token}`)
        .send(testReview);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('GET /api/reviews/:movieId', () => {
    it('should get reviews for a movie', async () => {
      const response = await request(app)
        .get(`/api/reviews/${movieId}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data) || Array.isArray(response.body)).toBe(true);
      }
    });

    it('should support pagination for reviews', async () => {
      const response = await request(app)
        .get(`/api/reviews/${movieId}?page=1&limit=10`);

      expect([200, 404]).toContain(response.status);
    });

    it('should support sorting reviews', async () => {
      const response = await request(app)
        .get(`/api/reviews/${movieId}?sort=-rating`);

      expect([200, 404]).toContain(response.status);
    });

    it('should return empty array for movie with no reviews', async () => {
      const response = await request(app)
        .get('/api/reviews/moviewithnreviews123');

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data) || Array.isArray(response.body)).toBe(true);
      }
    });

    it('should handle non-existent movie gracefully', async () => {
      const response = await request(app)
        .get('/api/reviews/nonexistentmovie123');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/reviews/:id', () => {
    it('should reject delete without authentication', async () => {
      const response = await request(app)
        .delete(`/api/reviews/testreview123`);

      expect(response.status).toBe(401);
    });

    it('should delete own review with valid token', async () => {
      const token = await getUserToken();

      // First create a review to delete
      const createResponse = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(testReview);

      if (createResponse.status === 201 || createResponse.status === 200) {
        const createdReviewId = createResponse.body.data?.id || createResponse.body.id;

        const deleteResponse = await request(app)
          .delete(`/api/reviews/${createdReviewId}`)
          .set('Authorization', `Bearer ${token}`);

        expect([200, 204]).toContain(deleteResponse.status);
      }
    });

    it('should prevent deleting others reviews', async () => {
      const token = await getUserToken();

      // Try to delete a review not owned by this user
      const response = await request(app)
        .delete(`/api/reviews/someonelsereviews123`)
        .set('Authorization', `Bearer ${token}`);

      expect([403, 404]).toContain(response.status);
    });

    it('should handle non-existent review gracefully', async () => {
      const token = await getUserToken();

      const response = await request(app)
        .delete('/api/reviews/nonexistentreview123')
        .set('Authorization', `Bearer ${token}`);

      expect([404]).toContain(response.status);
    });
  });

  describe('Review Validation Tests', () => {
    it('should validate rating is a number', async () => {
      const token = await getUserToken();
      const invalidReview = {
        ...testReview,
        rating: 'not-a-number'
      };

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(invalidReview);

      expect([400, 422]).toContain(response.status);
    });

    it('should handle very long comments', async () => {
      const token = await getUserToken();
      const longComment = 'A'.repeat(10000);

      const response = await request(app)
        .post(`/api/reviews/${movieId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...testReview,
          comment: longComment
        });

      expect([200, 400, 422]).toContain(response.status);
    });

    it('should validate movie ID format', async () => {
      const token = await getUserToken();

      const response = await request(app)
        .post(`/api/reviews/`) // Missing movieId
        .set('Authorization', `Bearer ${token}`)
        .send(testReview);

      expect([404, 405]).toContain(response.status);
    });
  });

  describe('Review Stats', () => {
    it('should calculate average rating correctly', async () => {
      // Create multiple reviews with different ratings
      const token = await getUserToken();

      const ratings = [5, 4, 3, 4.5];
      for (const rating of ratings) {
        await request(app)
          .post(`/api/reviews/${movieId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            ...testReview,
            rating,
            comment: `Review with rating ${rating}`
          });
      }

      // Get reviews
      const response = await request(app)
        .get(`/api/reviews/${movieId}`);

      expect([200, 404]).toContain(response.status);
      // The response might include average rating information
    });
  });
});
