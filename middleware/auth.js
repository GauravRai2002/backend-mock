const { requireAuth, getAuth } = require('@clerk/express');

/**
 * Clerk auth middleware.
 * Verifies the Clerk session token from the Authorization: Bearer <token> header.
 * Attaches req.auth = { userId, orgId, orgRole, sessionId } on success.
 *
 * Usage: app.use('/protected-route', authenticate, router)
 */
const authenticate = requireAuth();

module.exports = authenticate;