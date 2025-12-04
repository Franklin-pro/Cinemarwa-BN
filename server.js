import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import sessionSequelize from "connect-session-sequelize";
import passport from "passport";
import sequelize, { connectDB } from "./config/database.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import movieRoutes from "./routes/movieRoute.js";
import reviewRoutes from "./routes/reviewRoute.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoute.js";
import filmmmakerRoutes from "./routes/filmmmakerRoute.js";
import googleOAuthRoutes from "./routes/googleOAuthRoutes.js";
import { initializePassport } from "./config/googleOAuth.js";
import { User, Movie, Review, Payment, OTP } from "./models/index.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

let sessionStore;

// Session Configuration will be set up in startServer

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Note: Session and Passport middleware will be initialized in startServer()

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "Server is running", timestamp: new Date() });
});

// Routes
app.use("/api/payments", paymentRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleOAuthRoutes);
app.use("/api/filmmaker", filmmmakerRoutes);
app.use("/api/admin", adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    message: "Server error",
    error: err.message,
  });
});

// Export app for testing
export default app;

// Initialize database and start server
async function startServer() {
  try {
    // Connect to database
    await connectDB();

    // Sync database models
    await sequelize.sync({ 
      alter: process.env.NODE_ENV === 'development',
      logging: false 
    });

    // Initialize session store
    let sessionStore;
    try {
      const SessionStore = SequelizeStore(session.Store);
      sessionStore = new SessionStore({
        db: sequelize,
        table: 'sessions',
        checkExpirationInterval: 15 * 60 * 1000, // Clean up expired sessions every 15 minutes
        expiration: 24 * 60 * 60 * 1000 // Session expiration (24 hours)
      });
      
      await sessionStore.sync();
      console.log('✅ Session store initialized');
    } catch (storeError) {
      console.warn('⚠️ Using memory session store (not recommended for production)');
      sessionStore = null;
    }

    // Setup session middleware
    const sessionConfig = {
      secret: process.env.SESSION_SECRET || "your-fallback-secret",
      resave: false,
      saveUninitialized: false,
      store: sessionStore || undefined, // Use memory store if sessionStore is null
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    };

    app.use(session(sessionConfig));

    // Initialize Passport after session is set up
    initializePassport(app);
    app.use(passport.initialize());
    app.use(passport.session());

    // Only start server if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
