import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Subscribe = sequelize.define(
    "Subscribe",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true, // Add unique constraint
        },
        status: {
            type: DataTypes.ENUM("active", "inactive"),
            defaultValue: "active",
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        tableName: "subscribe",
        timestamps: false,
    }
);

// Sync model with database (add this)
Subscribe.sync({ alter: true }).then(() => {
    // console.log('Subscribe table synced');
}).catch(err => {
    console.error('Error syncing Subscribe table:', err);
});

export default Subscribe;