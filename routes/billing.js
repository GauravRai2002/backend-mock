const express = require('express');
const router = express.Router();
const { getAuth } = require('@clerk/express');
const turso = require('../db');
const { getPlanKey, getLimits, PLAN_LIMITS } = require('../middleware/billing');

/**
 * GET /billing/usage
 * Returns the caller's current resource usage alongside their plan limits.
 * Works for both org-scoped and personal (no-org) workspaces.
 */
router.get('/usage', async (req, res) => {
    try {
        const auth = getAuth(req);
        const planKey = getPlanKey(auth);
        const limits = getLimits(auth);

        const isOrg = !!auth.orgId;
        const projectWhere = isOrg ? 'p.org_id = ?' : 'p.user_id = ? AND p.org_id IS NULL';
        const scopeValues = isOrg ? [auth.orgId] : [auth.userId];

        const [projectResult, mockResult, requestResult] = await Promise.all([
            turso.execute(
                `SELECT COUNT(*) as count FROM projects p WHERE ${projectWhere}`,
                scopeValues
            ),
            turso.execute(
                `SELECT COUNT(*) as count FROM mocks m
                 INNER JOIN projects p ON m.project_id = p.project_id
                 WHERE ${projectWhere}`,
                scopeValues
            ),
            turso.execute(
                `SELECT COUNT(*) as count FROM request_logs rl
                 INNER JOIN projects p ON rl.project_id = p.project_id
                 WHERE ${projectWhere}
                   AND rl.created_at >= ?`,
                [...scopeValues, _monthStartISO()]
            ),
        ]);

        res.status(200).json({
            plan: planKey,
            usage: {
                projects: {
                    used: Number(projectResult.rows[0]?.count ?? 0),
                    limit: limits.maxProjects,
                },
                totalMocks: {
                    used: Number(mockResult.rows[0]?.count ?? 0),
                },
                monthlyRequests: {
                    used: Number(requestResult.rows[0]?.count ?? 0),
                    limit: limits.monthlyRequests,
                },
            },
            limits,
        });
    } catch (error) {
        console.error('GET /billing/usage error:', error);
        res.status(500).json({ error: 'Failed to fetch usage data' });
    }
});

/**
 * GET /billing/plans
 * Returns every available tier with its limits (public info the frontend
 * can use for upgrade prompts and comparison tables).
 */
router.get('/plans', async (_req, res) => {
    const plans = Object.entries(PLAN_LIMITS).map(([key, limits]) => ({
        planKey: key,
        ...limits,
    }));
    res.status(200).json({ data: plans });
});

function _monthStartISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

module.exports = router;
