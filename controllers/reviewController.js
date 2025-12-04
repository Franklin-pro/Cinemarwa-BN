import Review from "../models/Review.model.js";
import Movie from "../models/Movie.model.js";

// 📌 Add a review to a movie
export const addReview = async (req, res) => {
  const { movieId } = req.params;
  const { user, rating, comment } = req.body;

  try {
    const movie = await Movie.findByPk(movieId);
    if (!movie) return res.status(404).json({ message: "Movie not found" });

    const review = await Review.create({
      movie: movieId,
      user,
      rating,
      comment,
    });

    // Recalculate average rating for the movie
    const reviews = await Review.find({ movie: movieId });
    const avgRating =
      reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length;

    movie.vote_average = Number(avgRating.toFixed(1));
    movie.vote_count = reviews.length;
    await movie.save();

    res.status(201).json({
      message: "Review added successfully",
      review,
      updatedMovie: movie,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 📋 Get all reviews for a movie
export const getReviews = async (req, res) => {
  const { movieId } = req.params;
  try {
    const reviews = await Review.find({ movie: movieId }).sort({
      createdAt: -1,
    });
    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ❌ Delete review by ID
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.destroy(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
