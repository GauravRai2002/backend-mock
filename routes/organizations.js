const express = require('express');
const router = express.Router();
const { clerkClient, getAuth } = require('@clerk/express');

// ─── Helper: verify calling user is admin/owner of the org ────────────────

async function requireOrgAdmin(req, orgId) {
    const { userId, orgId: tokenOrgId } = getAuth(req);

    // User must have this org active in their session
    if (tokenOrgId !== orgId) {
        return { allowed: false, status: 403, error: 'You are not a member of this organization' };
    }

    // Check the calling user's role in this org
    const memberships = await clerkClient.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit: 100,
    });

    const callerMembership = memberships.data.find(
        (m) => m.publicUserData?.userId === userId
    );

    if (!callerMembership) {
        return { allowed: false, status: 403, error: 'You are not a member of this organization' };
    }

    const role = callerMembership.role;
    if (role !== 'org:admin' && role !== 'org:owner' && role !== 'admin' && role !== 'owner') {
        return { allowed: false, status: 403, error: 'Only admins and owners can perform this action' };
    }

    return { allowed: true, role, userId };
}

// ─── CREATE ORGANIZATION ──────────────────────────────────────────────────

/**
 * POST /organizations
 * Creates a new Clerk organization. The calling user becomes the owner.
 * Body: { name: string, slug?: string }
 */
router.post('/', async (req, res) => {
    try {
        const { userId } = getAuth(req);
        const { name, slug } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'name is required' });
        }

        const org = await clerkClient.organizations.createOrganization({
            name,
            slug: slug || undefined,
            createdBy: userId,
        });

        res.status(201).json({
            orgId: org.id,
            name: org.name,
            slug: org.slug,
            imageUrl: org.imageUrl || null,
            membersCount: org.membersCount ?? 1,
            createdAt: new Date(org.createdAt).toISOString(),
        });
    } catch (error) {
        console.error('POST /organizations error:', error);
        if (error?.errors?.[0]?.code === 'form_identifier_exists') {
            return res.status(409).json({ error: 'An organization with this slug already exists' });
        }
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

// ─── GET ORGANIZATION ─────────────────────────────────────────────────────

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

// ─── LIST MEMBERS ─────────────────────────────────────────────────────────

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

// ─── INVITE MEMBER ────────────────────────────────────────────────────────

/**
 * POST /organizations/:id/invitations
 * Invite a user by email to the organization.
 * Body: { emailAddress: string, role?: string }
 * Role defaults to "org:member". Options: "org:member", "org:admin"
 */
router.post('/:id/invitations', async (req, res) => {
    try {
        const { id } = req.params;
        const { emailAddress, role } = req.body;

        if (!emailAddress) {
            return res.status(400).json({ error: 'emailAddress is required' });
        }

        // Verify caller is admin/owner
        const check = await requireOrgAdmin(req, id);
        if (!check.allowed) {
            return res.status(check.status).json({ error: check.error });
        }

        const invitation = await clerkClient.organizations.createOrganizationInvitation({
            organizationId: id,
            emailAddress,
            role: role || 'org:member',
            inviterUserId: check.userId,
        });

        res.status(201).json({
            id: invitation.id,
            emailAddress: invitation.emailAddress,
            role: invitation.role,
            status: invitation.status,
            createdAt: new Date(invitation.createdAt).toISOString(),
        });
    } catch (error) {
        console.error('POST /organizations/:id/invitations error:', error);
        if (error?.errors?.[0]?.code === 'already_a_member') {
            return res.status(409).json({ error: 'This user is already a member of the organization' });
        }
        res.status(500).json({ error: 'Failed to invite member' });
    }
});

// ─── UPDATE MEMBER ROLE ───────────────────────────────────────────────────

/**
 * PUT /organizations/:id/members/:membershipId
 * Change a member's role.
 * Body: { role: string } — e.g. "org:admin", "org:member"
 */
router.put('/:id/members/:membershipId', async (req, res) => {
    try {
        const { id, membershipId } = req.params;
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({ error: 'role is required' });
        }

        // Verify caller is admin/owner
        const check = await requireOrgAdmin(req, id);
        if (!check.allowed) {
            return res.status(check.status).json({ error: check.error });
        }

        const updated = await clerkClient.organizations.updateOrganizationMembership({
            organizationId: id,
            userId: membershipId,
            role,
        });

        res.status(200).json({
            membershipId: updated.id,
            role: updated.role,
            user: {
                userId: updated.publicUserData?.userId,
                firstName: updated.publicUserData?.firstName,
                lastName: updated.publicUserData?.lastName,
                email: updated.publicUserData?.identifier,
                imageUrl: updated.publicUserData?.imageUrl,
            },
        });
    } catch (error) {
        console.error('PUT /organizations/:id/members/:membershipId error:', error);
        if (error?.status === 404) {
            return res.status(404).json({ error: 'Membership not found' });
        }
        res.status(500).json({ error: 'Failed to update member role' });
    }
});

// ─── REMOVE MEMBER ────────────────────────────────────────────────────────

/**
 * DELETE /organizations/:id/members/:membershipId
 * Remove a member from the organization.
 */
router.delete('/:id/members/:membershipId', async (req, res) => {
    try {
        const { id, membershipId } = req.params;

        // Verify caller is admin/owner
        const check = await requireOrgAdmin(req, id);
        if (!check.allowed) {
            return res.status(check.status).json({ error: check.error });
        }

        await clerkClient.organizations.deleteOrganizationMembership({
            organizationId: id,
            userId: membershipId,
        });

        res.status(200).json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('DELETE /organizations/:id/members/:membershipId error:', error);
        if (error?.status === 404) {
            return res.status(404).json({ error: 'Membership not found' });
        }
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

module.exports = router;
