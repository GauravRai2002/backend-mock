const express = require('express');
const router = express.Router();
const { getAuth, clerkClient } = require('@clerk/express');
const turso = require('../db');

/**
 * GET /auth/me
 *
 * Called by the frontend after Clerk login to sync the Clerk user into
 * our local DB (upsert). Returns the local user record.
 *
 * The Clerk session token must be passed as:
 *   Authorization: Bearer <session_token>
 */
router.get('/me', async (req, res) => {
    try {
        const { userId, orgId, orgRole } = getAuth(req);

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Fetch user details from Clerk
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
        const now = new Date().toISOString();

        // Upsert into local users table — keyed on Clerk userId
        await turso.execute(
            `INSERT INTO users (user_id, email, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         updated_at = excluded.updated_at`,
            [userId, email, name, now, now]
        );

        const result = await turso.execute(
            'SELECT user_id, email, name, subscription_tier, created_at FROM users WHERE user_id = ?',
            [userId]
        );

        const user = result.rows[0];
        res.status(200).json({
            userId: user.user_id,
            email: user.email,
            name: user.name,
            subscriptionTier: user.subscription_tier,
            createdAt: user.created_at,
            // Clerk org context (if user is acting within an org)
            orgId: orgId || null,
            orgRole: orgRole || null,
        });
    } catch (error) {
        console.error('GET /auth/me error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

module.exports = router;
