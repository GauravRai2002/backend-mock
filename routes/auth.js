const express = require('express');
const router = express.Router();
const { getAuth, clerkClient } = require('@clerk/express');
const turso = require('../db');

/**
 * GET /auth/me
 * Syncs Clerk user into local DB (upsert). Returns full user profile.
 * If user is in an org context, also returns org name + role.
 * ⚠️ Must be called after every Clerk login.
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
        const imageUrl = clerkUser.imageUrl || null;
        const now = new Date().toISOString();

        // Upsert into local users table
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

        // Fetch org name from Clerk if user is in an org context
        let orgName = null;
        let orgSlug = null;
        if (orgId) {
            try {
                const org = await clerkClient.organizations.getOrganization({ organizationId: orgId });
                orgName = org.name;
                orgSlug = org.slug;
            } catch (_) {
                // org fetch can fail gracefully
            }
        }

        res.status(200).json({
            userId: user.user_id,
            email: user.email,
            name: user.name,
            imageUrl,
            subscriptionTier: user.subscription_tier,
            createdAt: user.created_at,
            orgId: orgId || null,
            orgRole: orgRole || null,
            orgName,
            orgSlug,
        });
    } catch (error) {
        console.error('GET /auth/me error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * PATCH /auth/profile
 * Update the authenticated user's display name.
 * Updates both Clerk (source of truth) and local DB.
 */
router.patch('/profile', async (req, res) => {
    try {
        const { userId } = getAuth(req);
        const { firstName, lastName } = req.body;

        if (!firstName && !lastName) {
            return res.status(400).json({ error: 'At least firstName or lastName is required' });
        }

        // Update in Clerk
        const updatedClerkUser = await clerkClient.users.updateUser(userId, {
            ...(firstName !== undefined && { firstName }),
            ...(lastName !== undefined && { lastName }),
        });

        const name = `${updatedClerkUser.firstName || ''} ${updatedClerkUser.lastName || ''}`.trim();
        const now = new Date().toISOString();

        // Sync to local DB
        await turso.execute(
            'UPDATE users SET name = ?, updated_at = ? WHERE user_id = ?',
            [name, now, userId]
        );

        res.status(200).json({
            userId,
            name,
            firstName: updatedClerkUser.firstName,
            lastName: updatedClerkUser.lastName,
            imageUrl: updatedClerkUser.imageUrl,
        });
    } catch (error) {
        console.error('PATCH /auth/profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
