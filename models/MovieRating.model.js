import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./User.modal.js";
import Movie from "./Movie.model.js";


const MovieRating = sequelize.define('movieRating', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    rating: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    comment: {
        type: DataTypes.STRING,
        allowNull: true
    }
});
MovieRating.belongsTo(User, { foreignKey: 'userId' });
MovieRating.belongsTo(Movie, { foreignKey: 'movieId' });
export default MovieRating;