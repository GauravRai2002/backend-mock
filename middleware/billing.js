const { getAuth } = require('@clerk/express');
const turso = require('../db');

/**
 * Plan limits enforced across MockBird.
 * Plan keys:
 *   "free_org" — Free tier (default for all orgs/users)
 *   "pro"      — Pro tier (activated via Dodo Payments subscription)
 *
 * Personal workspaces (no org active) always receive free-tier limits.
 */
const PLAN_LIMITS = {
    free_org: {
        maxProjects: 3,
        maxMocksPerProject: 5,
        maxResponsesPerMock: 3,
        requestLogsRetentionDays: 7,
        monthlyRequests: 1000,
    },
    pro: {
        maxProjects: 50,
        maxMocksPerProject: 100,
        maxResponsesPerMock: 20,
        requestLogsRetentionDays: 30,
        monthlyRequests: 100000,
    },
};

// ─── In-memory org plan cache ────────────────────────────────────────────────
// Populated by plan lookups from the local subscriptions table.

const _orgPlanCache = new Map();
const _PLAN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function _cacheOrgPlan(orgId, planKey) {
    if (orgId) {
        _orgPlanCache.set(orgId, { plan: planKey, ts: Date.now() });
    }
}

/**
 * Fetch the org's plan from the local subscriptions table, cache it,
 * and return the plan key. Replaces the old Clerk Billing API call.
 */
async function _fetchAndCacheOrgPlan(orgId) {
    try {
        const result = await turso.execute(
            `SELECT plan_key FROM subscriptions
             WHERE org_id = ? AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1`,
            [orgId]
        );
        const planKey = result.rows[0]?.plan_key || 'free_org';
        _cacheOrgPlan(orgId, planKey);
        return planKey;
    } catch (error) {
        console.error('_fetchAndCacheOrgPlan error:', error?.message || error);
        _cacheOrgPlan(orgId, 'free_org');
        return 'free_org';
    }
}

/**
 * Get the plan for an org, checking cache first and falling back to
 * a DB query when the cache is stale or empty.
 * Used by the mock-execution endpoint which has no Clerk session.
 */
async function getOrgPlan(orgId) {
    if (!orgId) return 'free_org';
    const entry = _orgPlanCache.get(orgId);
    if (entry && Date.now() - entry.ts < _PLAN_CACHE_TTL) return entry.plan;
    return _fetchAndCacheOrgPlan(orgId);
}

// ─── In-memory monthly request counters ──────────────────────────────────────
// Keyed by "ownerId:YYYY-MM". Lazily seeded from DB on first access,
// then incremented in-memory to avoid a COUNT(*) on every mock execution.

const _monthlyCounters = new Map();

function _counterKey(orgId, userId) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${orgId || `u:${userId}`}:${month}`;
}

function _monthStartISO() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine the org's plan from the local subscriptions table.
 * Also populates the in-memory cache so /m/ can use it later.
 */
async function getPlanKey(auth) {
    if (!auth?.orgId) return 'free_org';
    return getOrgPlan(auth.orgId);
}

async function getLimits(auth) {
    const plan = await getPlanKey(auth);
    return PLAN_LIMITS[plan];
}

function _billingScope(auth) {
    if (auth.orgId) {
        return { where: 'org_id = ?', values: [auth.orgId] };
    }
    return { where: 'user_id = ? AND org_id IS NULL', values: [auth.userId] };
}

// ─── Enforcement middleware ──────────────────────────────────────────────────

/**
 * Block project creation when the org/user has hit their plan ceiling.
 */
async function enforceProjectLimit(req, res, next) {
    try {
        const auth = getAuth(req);
        const limits = await getLimits(auth);
        const { where, values } = _billingScope(auth);

        const result = await turso.execute(
            `SELECT COUNT(*) as count FROM projects WHERE ${where}`, values
        );
        const current = Number(result.rows[0]?.count ?? 0);

        if (current >= limits.maxProjects) {
            const plan = await getPlanKey(auth);
            return res.status(403).json({
                error: 'PLAN_LIMIT_REACHED',
                message: `Your plan allows up to ${limits.maxProjects} projects. Upgrade to create more.`,
                limit: limits.maxProjects,
                current,
                plan,
            });
        }
        next();
    } catch (error) {
        console.error('enforceProjectLimit error:', error);
        next();
    }
}

/**
 * Block mock creation when the project has hit its plan ceiling.
 * Expects req.params.projectId.
 */
async function enforceMockLimit(req, res, next) {
    try {
        const { projectId } = req.params;
        const auth = getAuth(req);
        const limits = await getLimits(auth);

        const result = await turso.execute(
            'SELECT COUNT(*) as count FROM mocks WHERE project_id = ?', [projectId]
        );
        const current = Number(result.rows[0]?.count ?? 0);

        if (current >= limits.maxMocksPerProject) {
            const plan = await getPlanKey(auth);
            return res.status(403).json({
                error: 'PLAN_LIMIT_REACHED',
                message: `Your plan allows up to ${limits.maxMocksPerProject} mocks per project. Upgrade to create more.`,
                limit: limits.maxMocksPerProject,
                current,
                plan,
            });
        }
        next();
    } catch (error) {
        console.error('enforceMockLimit error:', error);
        next();
    }
}

/**
 * Block response creation when the mock has hit its plan ceiling.
 * Expects req.params.id (mock_id).
 */
async function enforceResponseLimit(req, res, next) {
    try {
        const { id } = req.params;
        const auth = getAuth(req);
        const limits = await getLimits(auth);

        const result = await turso.execute(
            'SELECT COUNT(*) as count FROM mock_responses WHERE mock_id = ?', [id]
        );
        const current = Number(result.rows[0]?.count ?? 0);

        if (current >= limits.maxResponsesPerMock) {
            const plan = await getPlanKey(auth);
            return res.status(403).json({
                error: 'PLAN_LIMIT_REACHED',
                message: `Your plan allows up to ${limits.maxResponsesPerMock} responses per mock. Upgrade to add more.`,
                limit: limits.maxResponsesPerMock,
                current,
                plan,
            });
        }
        next();
    } catch (error) {
        console.error('enforceResponseLimit error:', error);
        next();
    }
}

/**
 * Ensure the in-memory counter for this org/user+month exists, seeding
 * it from the DB on the first call.  Returns the entry (never null).
 */
async function _ensureCounter(orgId, userId) {
    const key = _counterKey(orgId, userId);
    let entry = _monthlyCounters.get(key);

    if (!entry) {
        const scopeWhere = orgId
            ? 'p.org_id = ?'
            : 'p.user_id = ? AND p.org_id IS NULL';
        const scopeVal = orgId || userId;

        try {
            const result = await turso.execute(
                `SELECT COUNT(*) as count FROM request_logs rl
                 INNER JOIN projects p ON rl.project_id = p.project_id
                 WHERE ${scopeWhere} AND rl.created_at >= ?`,
                [scopeVal, _monthStartISO()]
            );
            entry = { count: Number(result.rows[0]?.count ?? 0) };
        } catch {
            entry = { count: 0 };
        }
        _monthlyCounters.set(key, entry);
    }

    return entry;
}

/**
 * Read-only quota check for the mock-execution endpoint.
 * Does NOT increment the counter — call incrementMonthlyCounter()
 * only after the request has been successfully served and logged.
 *
 * @param {string|null} orgId   — project's org_id (null for personal projects)
 * @param {string|null} userId  — project's user_id
 * @returns {Promise<{ allowed: boolean, used: number, limit: number }>}
 */
async function checkMonthlyQuota(orgId, userId) {
    const entry = await _ensureCounter(orgId, userId);

    const plan = await getOrgPlan(orgId);
    const limit = PLAN_LIMITS[plan]?.monthlyRequests ?? PLAN_LIMITS.free_org.monthlyRequests;

    return { allowed: entry.count < limit, used: entry.count, limit };
}

/**
 * Increment the in-memory monthly counter after a request has been
 * successfully served.  Call this alongside logRequest().
 */
function incrementMonthlyCounter(orgId, userId) {
    const key = _counterKey(orgId, userId);
    const entry = _monthlyCounters.get(key);
    if (entry) entry.count++;
}

module.exports = {
    PLAN_LIMITS,
    getPlanKey,
    getLimits,
    getOrgPlan,
    enforceProjectLimit,
    enforceMockLimit,
    enforceResponseLimit,
    checkMonthlyQuota,
    incrementMonthlyCounter,
};
