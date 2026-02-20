const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();

// Route imports
const usersRouter = require("./routes/users");
const organizationRouter = require("./routes/organization");
const membersRouter = require("./routes/members");
const mockRouter = require("./routes/m");
const authRouter = require("./routes/auth");
const projectsRouter = require("./routes/projects");
const mocksRouter = require("./routes/mocks");
const authenticate = require("./middleware/auth");

/**
 * Express middleware configuration
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", app: "MockBird API" });
});

/**
 * Public routes — no auth required
 */
app.use("/auth", authRouter);

// Mock execution endpoint — PUBLIC (clients hit this from anywhere)
app.use("/m", mockRouter);

/**
 * Protected routes — require JWT
 */
app.use("/projects", authenticate, projectsRouter);

// Mocks CRUD uses both /projects/:projectId/mocks and /mocks/:id patterns
app.use("/", authenticate, mocksRouter);

// Legacy / existing routes
app.use("/users", authenticate, usersRouter);
app.use("/organization", authenticate, organizationRouter);
app.use("/members", authenticate, membersRouter);

/**
 * Start server
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🐦 MockBird API running on port ${PORT}`);
});

module.exports = app;
