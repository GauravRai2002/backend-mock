const { clerkClient } = require('@clerk/express');
const turso = require('../db');

/**
 * Lazily ensures a Clerk user exists in the local database.
 * If not found, fetches from Clerk and upserts into the `users` table.
 * Crucial to call before inserting records that have a FOREIGN KEY 
 * dependency on `user_id` (e.g. projects).
 */
async function ensureUserExists(userId) {
    if (!userId) return;

    try {
        // Check if user exists in local DB
        const existing = await turso.execute('SELECT user_id FROM users WHERE user_id = ?', [userId]);
        if (existing.rows.length > 0) return; // User already exists

        // User not found, fetch from Clerk and upsert
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
        const now = new Date().toISOString();

        await turso.execute(
            `INSERT INTO users (user_id, email, name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
             email = excluded.email,
             name = excluded.name,
             updated_at = excluded.updated_at`,
            [userId, email, name, now, now]
        );
        console.log(`[userSync] Lazily synced missing user ${userId} from Clerk.`);
    } catch (error) {
        console.error(`[userSync] Failed to lazily sync user ${userId}:`, error.message || error);
    }
}

module.exports = {
    ensureUserExists
};
