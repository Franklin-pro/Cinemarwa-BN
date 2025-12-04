import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import User from "../models/User.modal.js";
import bcrypt from "bcryptjs";

export const configureGoogleStrategy = () => {
    passport.use(
        new GoogleStrategy.Strategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL,
                passReqToCallback: true
            },
            async (req, accessToken, refreshToken, profile, done) => {
                try {
                    let user = await User.findOne({ googleId: profile.id });

                    if (user) return done(null, user);

                    const existingEmail = await User.findOne({
                        email: profile.emails?.[0]?.value
                    });

                    if (existingEmail) {
                        existingEmail.googleId = profile.id;
                        existingEmail.authProvider = "both";
                        await existingEmail.save();
                        return done(null, existingEmail);
                    }

                    user = await User.create({
                        name: profile.displayName,
                        email: profile.emails?.[0]?.value,
                        googleId: profile.id,
                        authProvider: "google",
                        role: "viewer",
                        isUpgraded: false,
                        maxDevices: 1,
                        profilePicture: profile.photos?.[0]?.value,
                    });

                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            }
        )
    );
};

export const serializeUser = () => {
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });
};

export const deserializeUser = () => {
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);  // FIXED FOR MONGODB
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
};

export const initializePassport = (app) => {
    configureGoogleStrategy();
    serializeUser();
    deserializeUser();
    return passport;
};
