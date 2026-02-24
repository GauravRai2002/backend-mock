const rateLimit = require('express-rate-limit');

/**
 * middleware/rateLimiter.js
 *
 * Rate limiting middleware for MockBird.
 *
 * Two limiters are exported:
 *
 * 1. mockExecutionLimiter — for the PUBLIC /m/:slug/* endpoint.
 *    Per-IP: 100 requests per 15-minute window (generous for testing,
 *    strict enough to protect against abuse).
 *
 * 2. apiLimiter — for the authenticated management API.
 *    Per-IP: 200 requests per 15-minute window (higher because these
 *    are legitimate dashboard actions).
 *
 * When a client hits the limit, they receive a 429 response with a
 * clear JSON error and a Retry-After header.
 */

const mockExecutionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // 100 requests per window per IP
    standardHeaders: true,     // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,      // Disable X-RateLimit-* headers
    keyGenerator: (req) => {
        // Use IP + project slug so different projects get independent limits
        return `${req.ip}:${req.params?.projectSlug || 'global'}`;
    },
    handler: (_req, res) => {
        res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests to this mock endpoint. Please try again later.',
            retryAfterMs: 15 * 60 * 1000,
        });
    },
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,                  // 200 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many API requests. Please try again later.',
            retryAfterMs: 15 * 60 * 1000,
        });
    },
});

module.exports = { mockExecutionLimiter, apiLimiter };
