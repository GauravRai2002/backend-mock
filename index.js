const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { clerkMiddleware } = require("@clerk/express");
const app = express();

// Route imports
const usersRouter = require("./routes/users");
const mockRouter = require("./routes/m");
const authRouter = require("./routes/auth");
const projectsRouter = require("./routes/projects");
const mocksRouter = require("./routes/mocks");
const organizationsRouter = require("./routes/organizations");
const authenticate = require("./middleware/auth");
const { mockExecutionLimiter, apiLimiter } = require("./middleware/rateLimiter");

/**
 * Global middleware
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/**
 * Clerk middleware — must come before any route that needs auth.
 * Parses the Clerk session token and populates req.auth on every request.
 * does NOT block unauthenticated requests — use authenticate for that.
 */
app.use(clerkMiddleware());

/**
 * Health check (public)
 */
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", app: "MockBird API" });
});

/**
 * Auth routes — /auth/me is protected via authenticate inside the router
 */
app.use("/auth", authenticate, authRouter);

/**
 * Mock execution — PUBLIC, no auth required.
 * Rate limited: 100 requests per 15 minutes per IP per project.
 */
app.use("/m", mockExecutionLimiter, mockRouter);

/**
 * Protected management routes
 * Rate limited: 200 requests per 15 minutes per IP.
 */
app.use("/projects", apiLimiter, authenticate, projectsRouter);
app.use("/", apiLimiter, authenticate, mocksRouter);
app.use("/organizations", apiLimiter, authenticate, organizationsRouter);

// Legacy routes
app.use("/users", apiLimiter, authenticate, usersRouter);

/**
 * Start server
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🐦 MockBird API running on port ${PORT}`);
});

module.exports = app;
