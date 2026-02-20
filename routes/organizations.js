const express = require('express');
const router = express.Router();
const { clerkClient, getAuth } = require('@clerk/express');

/**
 * GET /organizations/:id
 * Returns org name, slug, and member count from Clerk.
 * User must be a member of the org (their token must include that orgId).
 */
router.get('/:id', async (req, res) => {
    try {
        const { orgId } = getAuth(req);
        const { id } = req.params;

        // Only allow fetching orgs the user belongs to
        if (orgId !== id) {
            return res.status(403).json({ error: 'You are not a member of this organization' });
        }

        const org = await clerkClient.organizations.getOrganization({ organizationId: id });

        res.status(200).json({
            orgId: org.id,
            name: org.name,
            slug: org.slug,
            imageUrl: org.imageUrl || null,
            membersCount: org.membersCount ?? null,
            createdAt: new Date(org.createdAt).toISOString(),
        });
    } catch (error) {
        if (error?.status === 404) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        console.error('GET /organizations/:id error:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

/**
 * GET /organizations/:id/members
 * Returns paginated list of org members from Clerk.
 * Query params: limit (default 20), offset (default 0)
 */
router.get('/:id/members', async (req, res) => {
    try {
        const { orgId } = getAuth(req);
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        if (orgId !== id) {
            return res.status(403).json({ error: 'You are not a member of this organization' });
        }

        const membershipList = await clerkClient.organizations.getOrganizationMembershipList({
            organizationId: id,
            limit,
            offset,
        });

        const members = membershipList.data.map((m) => ({
            membershipId: m.id,
            role: m.role,
            joinedAt: new Date(m.createdAt).toISOString(),
            user: {
                userId: m.publicUserData?.userId,
                firstName: m.publicUserData?.firstName,
                lastName: m.publicUserData?.lastName,
                email: m.publicUserData?.identifier,
                imageUrl: m.publicUserData?.imageUrl,
            },
        }));

        res.status(200).json({
            data: members,
            totalCount: membershipList.totalCount,
            limit,
            offset,
        });
    } catch (error) {
        console.error('GET /organizations/:id/members error:', error);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});

module.exports = router;
