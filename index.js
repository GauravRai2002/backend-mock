const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { clerkMiddleware } = require("@clerk/express");
const app = express();

/**
 * Trust the reverse proxy (Vercel, Render, Heroku, etc.)
 * This ensures req.ip represents the actual client IP, not the proxy's IP.
 * CRITICAL for rate limiting, otherwise all users share the same IP limit!
 */
app.set('trust proxy', 1);

// Route imports
const usersRouter = require("./routes/users");
const mockRouter = require("./routes/m");
const authRouter = require("./routes/auth");
const projectsRouter = require("./routes/projects");
const mocksRouter = require("./routes/mocks");
const organizationsRouter = require("./routes/organizations");
const templatesRouter = require("./routes/templates");
const billingRouter = require("./routes/billing");
const webhooksRouter = require("./routes/webhooks");
const authenticate = require("./middleware/auth");
const { mockExecutionLimiter, apiLimiter } = require("./middleware/rateLimiter");

/**
 * Dodo Payments webhooks — MUST be mounted BEFORE express.json()
 * so the raw body is preserved for signature verification.
 */
app.use("/webhooks", webhooksRouter);

/**
 * Global middleware
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

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
app.use("/templates", apiLimiter, authenticate, templatesRouter);
app.use("/", apiLimiter, authenticate, mocksRouter);
app.use("/organizations", apiLimiter, authenticate, organizationsRouter);
app.use("/billing", apiLimiter, authenticate, billingRouter);

// Legacy routes
app.use("/users", apiLimiter, authenticate, usersRouter);

/**
 * Start server
 */
const PORT = process.env.PORT || 3001;

// Auto-create subscriptions table if it doesn't exist (safe to run every startup)
const turso = require("./db");
turso.execute(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    user_id TEXT,
    dodo_subscription_id TEXT UNIQUE,
    dodo_customer_id TEXT,
    product_id TEXT,
    plan_key TEXT DEFAULT 'free_org',
    status TEXT DEFAULT 'inactive',
    current_period_start TEXT,
    current_period_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`).then(() => {
  console.log('✅ subscriptions table ready');
}).catch((err) => {
  console.error('⚠️  subscriptions table migration error:', err?.message || err);
});

app.listen(PORT, () => {
  console.log(`🐦 MockBird API running on port ${PORT}`);
});

module.exports = app;
