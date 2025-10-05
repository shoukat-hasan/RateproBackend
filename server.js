// server.js
require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const { globalLimiter } = require("./middlewares/rateLimiter");
const seedPermissions = require("./seeds/seedPermissions");

console.log('🔍 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

// MongoDB connection and seeding
const startServer = async () => {
  try {
    await connectDB();
    await seedPermissions(); // Run permission seeding after DB connection
  } catch (err) {
    console.error("Server startup error:", err);
    process.exit(1);
  }
};

startServer();

const app = express();

app.set("trust proxy", 1);

// CORS allowed origins
const allowedOrigins = [
  process.env.PUBLIC_URL_LOCAL || "http://localhost:5173",
  process.env.ADMIN_URL_LOCAL || "http://localhost:5174",
  process.env.PUBLIC_URL_PROD || "https://ratepro-public.vercel.app",
  process.env.ADMIN_URL_PROD || "https://rate-pro-admin.vercel.app",
  'http://192.168.0.4:5173/'
];

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ✅ moved here
  })
);


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(globalLimiter);

// Static folder for uploads (avatars, PDFs, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use('/api/tenants', require("./routes/tenantRoutes"));
app.use("/api/roles", require("./routes/roleRoutes"));
app.use("/api/permissions", require("./routes/permissionRoutes.js"));
app.use('/api', require("./routes/permissionAssignmentRoutes.js"));
app.use("/api/surveys", require("./routes/surveyRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/actions", require("./routes/actionRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/subscriptions", require("./routes/subscriptionRoutes"));
app.use("/api/sms", require("./routes/smsRoutes"));
app.use("/api/whatsapp", require("./routes/whatsappRoutes"));
app.use("/api/insights", require("./routes/insightRoutes"));
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/api/distribution", require("./routes/distributionRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));

// Error Handling Middleware
const { notFound, errorHandler } = require("./middlewares/errorHandler");
app.use(notFound);
app.use(errorHandler);

// Server Boot
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);