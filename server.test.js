import request from 'supertest';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// Mock setup for basic health check
const app = express();

describe('API Health Check', () => {
  it('should respond to health check endpoint', async () => {
    app.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'Server is running', timestamp: new Date() });
    });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });
});
