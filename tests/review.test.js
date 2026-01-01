// import request from 'supertest';
// import app from '../server.js';

// describe('Review API Tests', () => {
//   let userToken = null;
//   let userId = null;
//   let reviewId = null;
//   const movieId = 'testmovie123';

//   const testReview = {
//     rating: 4.5,
//     comment: 'This is a great movie!',
//     user: 'testuser123', // Make sure this matches a real user ID
//     title: 'Excellent film'
//   };

//   // Helper to get user token
//   const getUserToken = async () => {
//     if (!userToken) {
//       const response = await request(app)
//         .post('/api/auth/login')
//         .send({
//           email: 'viewer@example.com',
//           password: 'Viewer@1234567'
//         });
//       if (response.status === 200) {
//         userToken = response.body.token;
//         userId = response.body.userId;
//       }
//     }
//     return userToken;
//   };

//   describe('POST /api/reviews/:movieId', () => {
//     it('should reject review without authentication', async () => {
//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .send(testReview);

//       expect(response.status).toBe(401);
//     });

//     it('should create review with valid token', async () => {
//       const token = await getUserToken();

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           user: userId // Use the actual user ID from login
//         });

//       expect([200, 201]).toContain(response.status);
//       if (response.status === 201 || response.status === 200) {
//         expect(response.body).toHaveProperty('data');
//         reviewId = response.body.data?._id || response.body.data?.id;
//       }
//     });

//     it('should validate rating is within range', async () => {
//       const token = await getUserToken();
//       const invalidReview = {
//         ...testReview,
//         rating: 6, // Rating > 5
//         user: userId
//       };

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send(invalidReview);

//       expect(response.status).toBe(400);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should reject negative rating', async () => {
//       const token = await getUserToken();
//       const invalidReview = {
//         ...testReview,
//         rating: -1,
//         user: userId
//       };

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send(invalidReview);

//       expect(response.status).toBe(400);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should validate required fields', async () => {
//       const token = await getUserToken();
//       const incompleteReview = {
//         // Missing rating
//         comment: 'Good movie',
//         user: userId
//       };

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send(incompleteReview);

//       expect(response.status).toBe(400);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should validate comment length', async () => {
//       const token = await getUserToken();
//       const invalidReview = {
//         ...testReview,
//         comment: '', // Empty comment
//         user: userId
//       };

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send(invalidReview);

//       expect(response.status).toBe(400);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should prevent duplicate reviews from same user', async () => {
//       const token = await getUserToken();

//       // Create first review
//       await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           user: userId
//         });

//       // Try to create duplicate
//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           user: userId,
//           comment: 'Different comment'
//         });

//       expect(response.status).toBe(409);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should validate movie exists', async () => {
//       const token = await getUserToken();

//       const response = await request(app)
//         .post('/api/reviews/nonexistentmovie123')
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           user: userId
//         });

//       expect(response.status).toBe(404);
//       expect(response.body).toHaveProperty('message');
//     });
//   });

//   describe('GET /api/reviews/:movieId', () => {
//     it('should get reviews for a movie', async () => {
//       const response = await request(app)
//         .get(`/api/reviews/${movieId}`);

//       expect(response.status).toBe(200);
//       expect(response.body).toHaveProperty('data');
//       expect(Array.isArray(response.body.data)).toBe(true);
//     });

//     it('should return empty array for movie with no reviews', async () => {
//       const response = await request(app)
//         .get('/api/reviews/moviewithnoreviews123');

//       expect(response.status).toBe(200);
//       expect(Array.isArray(response.body.data)).toBe(true);
//       expect(response.body.data.length).toBe(0);
//     });

//     it('should handle non-existent movie gracefully', async () => {
//       const response = await request(app)
//         .get('/api/reviews/nonexistentmovie123');

//       expect(response.status).toBe(404);
//       expect(response.body).toHaveProperty('message');
//     });
//   });

//   describe('DELETE /api/reviews/:id', () => {
//     it('should reject delete without authentication', async () => {
//       const response = await request(app)
//         .delete(`/api/reviews/testreview123`);

//       expect(response.status).toBe(401);
//     });

//     it('should delete own review with valid token', async () => {
//       const token = await getUserToken();

//       // First create a review to delete
//       const createResponse = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           user: userId
//         });

//       if (createResponse.status === 201 || createResponse.status === 200) {
//         const createdReviewId = createResponse.body.data?._id || createResponse.body.data?.id;

//         const deleteResponse = await request(app)
//           .delete(`/api/reviews/${createdReviewId}`)
//           .set('Authorization', `Bearer ${token}`);

//         expect([200, 204]).toContain(deleteResponse.status);
//       }
//     });

//     it('should handle non-existent review gracefully', async () => {
//       const token = await getUserToken();

//       const response = await request(app)
//         .delete('/api/reviews/nonexistentreview123')
//         .set('Authorization', `Bearer ${token}`);

//       expect(response.status).toBe(404);
//       expect(response.body).toHaveProperty('message');
//     });
//   });

//   describe('Review Validation Tests', () => {
//     it('should validate rating is a number', async () => {
//       const token = await getUserToken();
//       const invalidReview = {
//         ...testReview,
//         rating: 'not-a-number',
//         user: userId
//       };

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send(invalidReview);

//       expect(response.status).toBe(400);
//       expect(response.body).toHaveProperty('message');
//     });

//     it('should handle very long comments', async () => {
//       const token = await getUserToken();
//       const longComment = 'A'.repeat(10000);

//       const response = await request(app)
//         .post(`/api/reviews/${movieId}`)
//         .set('Authorization', `Bearer ${token}`)
//         .send({
//           ...testReview,
//           comment: longComment,
//           user: userId
//         });

//       expect([200, 201]).toContain(response.status);
//     });
//   });
// });