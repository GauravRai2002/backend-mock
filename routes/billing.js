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
        const planKey = await getPlanKey(auth);
        const limits = await getLimits(auth);

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

/**
 * POST /billing/checkout-session
 * Creates a Dodo Payments checkout session for the Pro subscription.
 * Body: { email, name, returnUrl? }
 * Returns: { checkout_url, session_id }
 */
router.post('/checkout-session', async (req, res) => {
    try {
        const auth = getAuth(req);
        const { email, name, returnUrl } = req.body;
        const productId = process.env.DODO_PRO_PRODUCT_ID;
        const apiKey = process.env.DODO_PAYMENTS_API_KEY;

        if (!productId || !apiKey) {
            return res.status(500).json({ error: 'Dodo Payments is not configured' });
        }

        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }

        // Determine API base URL: test_mode for development, live for production
        const baseUrl = process.env.DODO_ENV === 'live'
            ? 'https://live.dodopayments.com/api/v1'
            : 'https://test.dodopayments.com/api/v1';

        const response = await fetch(`${baseUrl}/checkouts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                product_cart: [{ product_id: productId, quantity: 1 }],
                customer: { email, name: name || email },
                metadata: {
                    org_id: auth.orgId || '',
                    user_id: auth.userId || '',
                },
                return_url: returnUrl || process.env.FRONTEND_URL + '/billing',
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Dodo checkout error:', response.status, errBody);
            return res.status(502).json({ error: 'Failed to create checkout session' });
        }

        const session = await response.json();
        res.status(200).json({
            checkout_url: session.checkout_url,
            session_id: session.session_id,
        });
    } catch (error) {
        console.error('POST /billing/checkout-session error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

/**
 * GET /billing/subscription
 * Returns the current subscription details from the local DB.
 */
router.get('/subscription', async (req, res) => {
    try {
        const auth = getAuth(req);
        const isOrg = !!auth.orgId;
        const where = isOrg ? 'org_id = ?' : 'user_id = ? AND org_id IS NULL';
        const values = isOrg ? [auth.orgId] : [auth.userId];

        const result = await turso.execute(
            `SELECT * FROM subscriptions WHERE ${where} ORDER BY updated_at DESC LIMIT 1`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(200).json({ subscription: null });
        }

        res.status(200).json({ subscription: result.rows[0] });
    } catch (error) {
        console.error('GET /billing/subscription error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription' });
    }
});

/**
 * POST /billing/cancel-subscription
 * Cancels the active Dodo Payments subscription for the current org/user.
 */
router.post('/cancel-subscription', async (req, res) => {
    try {
        const auth = getAuth(req);
        const isOrg = !!auth.orgId;
        const where = isOrg ? 'org_id = ?' : 'user_id = ? AND org_id IS NULL';
        const values = isOrg ? [auth.orgId] : [auth.userId];

        // Find active subscription
        const result = await turso.execute(
            `SELECT dodo_subscription_id FROM subscriptions
             WHERE ${where} AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No active subscription found' });
        }

        const dodoSubId = result.rows[0].dodo_subscription_id;
        const apiKey = process.env.DODO_PAYMENTS_API_KEY;

        const baseUrl = process.env.DODO_ENV === 'live'
            ? 'https://live.dodopayments.com/api/v1'
            : 'https://test.dodopayments.com/api/v1';

        // Cancel via Dodo API
        const response = await fetch(`${baseUrl}/subscriptions/${dodoSubId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ status: 'cancelled' }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Dodo cancel error:', response.status, errBody);
            return res.status(502).json({ error: 'Failed to cancel subscription' });
        }

        // Immediately update local DB (webhook will also confirm)
        await turso.execute(
            `UPDATE subscriptions SET status = 'cancelled', plan_key = 'free_org', updated_at = datetime('now')
             WHERE dodo_subscription_id = ?`,
            [dodoSubId]
        );

        res.status(200).json({ cancelled: true });
    } catch (error) {
        console.error('POST /billing/cancel-subscription error:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

function _monthStartISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

module.exports = router;
