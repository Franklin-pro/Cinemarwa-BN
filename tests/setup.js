// Test setup file - runs before all tests
import dotenv from 'dotenv';

// Load environment variables - try .env.test first, fall back to .env
const path = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path });

// Set test environment FIRST before loading app
process.env.NODE_ENV = 'test';
