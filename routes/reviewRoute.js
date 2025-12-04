import express from "express";
import {
  addReview,
  getReviews,
  deleteReview,
} from "../controllers/reviewController.js";

const router = express.Router();

// POST /api/reviews/:movieId → Add review for a movie
router.post("/:movieId", addReview);

// GET /api/reviews/:movieId → Get all reviews for a movie
router.get("/:movieId", getReviews);

// DELETE /api/reviews/:id → Delete a review
router.delete("/:id", deleteReview);

export default router;
