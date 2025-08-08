// const passport = require("passport");
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// const User = require("../models/User");
// require("dotenv").config();

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: process.env.GOOGLE_CALLBACK_URL,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         // 1) Try find by googleId
//         let user = await User.findOne({ googleId: profile.id });
//         if (user) return done(null, user);

//         // 2) If not found, try find by email (link accounts)
//         const email = profile.emails && profile.emails[0] && profile.emails[0].value;
//         if (email) {
//           user = await User.findOne({ email: email.toLowerCase() });
//           if (user) {
//             // Link google to existing local user
//             user.googleId = profile.id;
//             user.authProvider = "google";
//             user.isVerified = true; // Google email already verified
//             // update avatar if available
//             if (profile.photos && profile.photos[0]) {
//               user.avatar = user.avatar || {};
//               user.avatar.url = profile.photos[0].value;
//             }
//             await user.save();
//             return done(null, user);
//           }
//         }

//         // 3) No user found -> create new user
//         const newUser = new User({
//           name: profile.displayName || (email ? email.split("@")[0] : "Google User"),
//           email: email,
//           authProvider: "google",
//           googleId: profile.id,
//           isVerified: true,
//           avatar: {
//             url: profile.photos && profile.photos[0] ? profile.photos[0].value : undefined,
//           },
//           // password is NOT required for google auth because authProvider !== 'local'
//         });

//         await newUser.save();
//         return done(null, newUser);
//       } catch (err) {
//         return done(err, null);
//       }
//     }
//   )
// );

// passport.serializeUser((user, done) => {
//   done(null, user.id); // MongoDB _id
// });

// passport.deserializeUser(async (id, done) => {
//   try {
//     const user = await User.findById(id);
//     done(null, user);
//   } catch (err) {
//     done(err, null);
//   }
// });
