import express from "express";
import {
   getMovieById,
  updateMovie,
  deleteMovie,
  searchMovies,
  addMovie,
  getFilmmakerMovies,
  getTrendingMovies,
  getTopRatedMovies,
  getMoviesByCategory,
  uploadMovieVideo,
  uploadPoster,
  uploadBackdrop,
  // uploadSubtitle,
  getStreamingUrls,
  getMovieCategories,
  getAllMovies,
  getFilmmakerSeries,
  addRatingMovies,
} from "../controllers/movieController.js";
import { authenticateToken, requireAdmin, optionalAuthenticate } from "../middleware/authMiddleware.js";
import {
  uploadVideoMiddleware,
  uploadImageMiddleware,
  uploadMovieFilesMiddleware,
} from "../utils/backblazeB2.js";
import { getSecureStreamUrl } from "../controllers/paymentController.js";
import { addEpisode, createSeries } from "../controllers/series.controller.js";

const router = express.Router();

// ====== PUBLIC ROUTES ======

// Get all movies (with pagination, filtering, sorting)
router.get("/", getAllMovies);

// Search movies
// api/movies/search?query= In the query string
router.get("/search", searchMovies);
router.get('/secure-stream/:movieId', authenticateToken, getSecureStreamUrl);

// Get trending movies
router.get("/trending", getTrendingMovies);

// Get top rated movies
router.get("/top-rated", getTopRatedMovies);

// Get movies by category
router.get("/category/:category", getMoviesByCategory);
router.get("/categories", getMovieCategories);
// Get movies by filmmaker
router.get("/filmmaker/:filmamakerId", getFilmmakerMovies);
router.get("/filmmaker/:filmmakerId/series", getFilmmakerSeries);
// Get movie by ID or slug (must be last)
// `optionalAuthenticate` will attach `req.user` when a valid token is sent.
router.get("/:id", optionalAuthenticate, getMovieById);

// ====== PROTECTED ROUTES ======

// Upload new movie (Filmmaker or Admin)
// Expects multipart form data with: videoFile, posterFile, backdropFile + other fields
router.post(
  "/upload",
  authenticateToken,
  uploadMovieFilesMiddleware(),
  addMovie
);
router.post("/:filmmakerId/series", authenticateToken, createSeries);
router.post("/:filmmakerId/series/:seriesId/add-episode", authenticateToken, addEpisode);
router.post("/rating", authenticateToken,addRatingMovies);
// Update movie (Filmmaker or Admin)
router.put("/:id", authenticateToken, updateMovie);

// Delete movie (Filmmaker or Admin)
router.delete("/:id", authenticateToken, deleteMovie);

// ====== MEDIA UPLOAD ROUTES (Filmmaker or Admin) ======

// Add movie video URL (for pre-uploaded videos)
// Request: POST /api/movies/:movieId/video
// Body: { streamingUrl, hlsUrl (optional), quality, duration (optional), fileSize (optional) }
router.post("/:movieId/video", authenticateToken, uploadMovieVideo);

// Upload poster image
router.post(
  "/:movieId/poster",
  authenticateToken,
  uploadImageMiddleware().single("poster"),
  uploadPoster
);

// Upload backdrop image
router.post(
  "/:movieId/backdrop",
  authenticateToken,
  uploadImageMiddleware().single("backdrop"),
  uploadBackdrop
);

// Upload subtitle file
// router.post(
//   "/:movieId/subtitle",
//   authenticateToken,
//   uploadImageMiddleware().single("subtitle"),
//   uploadSubtitle
// );

// ====== STREAMING ROUTES ======

// Get streaming URLs for a movie (public)
router.get("/:movieId/streaming", getStreamingUrls);

export default router;