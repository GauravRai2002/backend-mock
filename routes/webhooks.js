const express = require('express');
const router = express.Router();
const { Webhook } = require('standardwebhooks');
const turso = require('../db');
const { v4: uuidv4 } = require('uuid');
const { clearOrgPlanCache } = require('../middleware/billing');

/**
 * POST /webhooks/dodo
 *
 * Receives Dodo Payments webhook events and updates the local
 * subscriptions table accordingly.
 *
 * Handled events:
 *   subscription.active  → upsert subscription, plan = 'pro', status = 'active'
 *   subscription.on_hold → update status to 'on_hold'
 *   subscription.failed  → update status to 'failed'
 *   subscription.renewed → update current_period_end, status stays 'active'
 *   subscription.updated → sync latest status
 *   payment.succeeded    → log only
 *   payment.failed       → log only
 */
router.post('/dodo', express.raw({ type: '*/*' }), async (req, res) => {
    try {
        const webhookSecret = process.env.DODO_WEBHOOK_KEY;
        if (!webhookSecret) {
            console.error('DODO_WEBHOOK_KEY is not set');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        // Verify signature
        // standardwebhooks expects the secret as base64-encoded.
        // Dodo webhook keys may come as "whsec_<base64>" or raw strings.
        let secret = webhookSecret;

        // Strip the whsec_ prefix if present — standardwebhooks handles it,
        // but we need to ensure the remaining part is valid base64.
        const hasPrefix = secret.startsWith('whsec_');
        const rawSecret = hasPrefix ? secret.slice(6) : secret;

        // Check if it looks like valid base64; if not, encode it
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(rawSecret) && rawSecret.length % 4 === 0;
        if (!isBase64) {
            secret = (hasPrefix ? 'whsec_' : '') + Buffer.from(rawSecret).toString('base64');
        }

        const wh = new Webhook(secret);
        const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf8');

        const webhookHeaders = {
            'webhook-id': req.headers['webhook-id'] || '',
            'webhook-signature': req.headers['webhook-signature'] || '',
            'webhook-timestamp': req.headers['webhook-timestamp'] || '',
        };

        let payload;
        try {
            wh.verify(rawBody, webhookHeaders);
            payload = JSON.parse(rawBody);
        } catch (verifyErr) {
            console.error('Webhook verification failed:', verifyErr?.message || verifyErr);
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        const eventType = payload.type;
        const data = payload.data;

        console.log(`📧 Dodo webhook: ${eventType}`);

        if (eventType.startsWith('subscription.')) {
            // Determine status and plan
            let status = 'active';
            if (eventType === 'subscription.on_hold') status = 'on_hold';
            if (eventType === 'subscription.failed') status = 'failed';
            if (eventType === 'subscription.updated') status = data.status || 'active';
            if (eventType === 'subscription.cancelled') status = 'cancelled'; // If Dodo sends cancelled

            const planKey = (status === 'cancelled' || status === 'failed') ? 'free_org' : 'pro';
            const dodoSubId = data.subscription_id;

            const orgId = data.metadata?.org_id || null;
            const userId = data.metadata?.user_id || null;
            const dodoCustomerId = data.customer?.customer_id || null;
            const productId = data.product_id || null;
            const currentPeriodStart = data.current_period_start || null;
            const currentPeriodEnd = data.current_period_end || null;

            // Robust UPSERT handling out-of-order webhooks
            await turso.execute(
                `INSERT INTO subscriptions
                    (id, org_id, user_id, dodo_subscription_id, dodo_customer_id,
                     product_id, plan_key, status, current_period_start, current_period_end)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(dodo_subscription_id) DO UPDATE SET
                    plan_key = excluded.plan_key,
                    status = excluded.status,
                    current_period_start = excluded.current_period_start,
                    current_period_end = excluded.current_period_end,
                    updated_at = datetime('now')`,
                [
                    uuidv4(), orgId, userId, dodoSubId, dodoCustomerId,
                    productId, planKey, status, currentPeriodStart, currentPeriodEnd
                ]
            );

            // Fetch the orgId if it was missed in the payload metadata
            let finalOrgId = orgId;
            if (!finalOrgId) {
                const res = await turso.execute('SELECT org_id FROM subscriptions WHERE dodo_subscription_id = ?', [dodoSubId]);
                finalOrgId = res.rows[0]?.org_id;
            }

            // Invalidate the cache right away so the user immediately gets Pro features
            if (finalOrgId) {
                clearOrgPlanCache(finalOrgId);
            }

        } else if (eventType.startsWith('payment.')) {
            console.log(`  └─ Payment ${eventType}: ${data.payment_id}`);
        } else {
            console.log(`  └─ Unhandled event type: ${eventType}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
