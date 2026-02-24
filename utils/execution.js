/**
 * utils/execution.js
 *
 * Pure functions extracted from routes/m.js for testability.
 * These contain zero database or HTTP side effects.
 */

/**
 * Path pattern matching — converts /users/{id}/posts/{postId} to a regex
 * and extracts named parameters from the actual request path.
 *
 * @param {string} pattern - The stored mock path, e.g. /users/{id}
 * @param {string} actualPath - The incoming request path, e.g. /users/123
 * @returns {{ isMatch: boolean, params: Record<string, string> }}
 */
function matchPath(pattern, actualPath) {
    const paramNames = [];
    const regexStr = pattern.replace(/{([^}]+)}/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
    });
    const escaped = regexStr.replace(/\./g, '\\.');
    const regex = new RegExp(`^${escaped}$`);
    const match = actualPath.match(regex);
    if (!match) return { isMatch: false, params: {} };

    const params = {};
    paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
    });
    return { isMatch: true, params };
}

/**
 * Evaluate a single condition against an incoming request-like object.
 *
 * @param {{ type: string, field: string, operator: string, value: string }} condition
 * @param {{ headers: object, query: object, body: any }} req
 * @param {Record<string, string>} pathParams
 * @returns {boolean}
 */
function evaluateCondition(condition, req, pathParams = {}) {
    const { type, field, operator, value } = condition;

    let actual;
    switch (type) {
        case 'header':
            actual = req.headers[field.toLowerCase()];
            break;
        case 'query':
            actual = req.query[field];
            break;
        case 'body':
            actual = typeof req.body === 'object' && req.body !== null
                ? req.body[field]
                : undefined;
            break;
        case 'path':
            actual = pathParams[field];
            break;
        default:
            return false;
    }

    if (actual === undefined || actual === null) return false;
    const actualStr = String(actual);

    switch (operator) {
        case 'equals':
            return actualStr === value;
        case 'contains':
            return actualStr.includes(value);
        case 'regex':
            try { return new RegExp(value).test(actualStr); } catch { return false; }
        default:
            return false;
    }
}

/**
 * Check if ALL conditions for a response are satisfied.
 * A response with an empty or missing conditions array always qualifies (no conditions = neutral).
 *
 * @param {{ conditions?: string | Array }} response
 * @param {object} req
 * @param {Record<string, string>} pathParams
 * @returns {{ matches: boolean, hasConditions: boolean }}
 */
function responseMatchesConditions(response, req, pathParams = {}) {
    let conditions = [];
    try {
        conditions = typeof response.conditions === 'string'
            ? JSON.parse(response.conditions)
            : (response.conditions || []);
    } catch {
        conditions = [];
    }

    if (!Array.isArray(conditions) || conditions.length === 0) {
        return { matches: true, hasConditions: false };
    }

    const allMatch = conditions.every((c) => evaluateCondition(c, req, pathParams));
    return { matches: allMatch, hasConditions: true };
}

/**
 * Pick which response to return.
 *
 * Priority:
 * 1. Conditional responses whose ALL conditions match → weighted-random among them
 * 2. If no conditional responses match → unconditioned responses → weighted-random
 * 3. If all weights are 0 → fall back to is_default or first
 *
 * @param {Array} responses - All responses for this mock
 * @param {object} req - Express request object (or equivalent plain object for tests)
 * @param {Record<string, string>} pathParams - Extracted path parameters
 * @returns {object|null}
 */
function pickResponse(responses, req = { headers: {}, query: {}, body: {} }, pathParams = {}) {
    if (!responses || responses.length === 0) return null;
    if (responses.length === 1) return responses[0];

    const conditionalMatches = [];
    const unconditioned = [];

    for (const resp of responses) {
        const { matches, hasConditions } = responseMatchesConditions(resp, req, pathParams);
        if (hasConditions && matches) {
            conditionalMatches.push(resp);
        } else if (!hasConditions) {
            unconditioned.push(resp);
        }
    }

    const pool = conditionalMatches.length > 0 ? conditionalMatches : unconditioned;
    const candidates = pool.length > 0 ? pool : responses;

    if (candidates.length === 1) return candidates[0];

    const totalWeight = candidates.reduce((sum, r) => sum + (r.weight || 0), 0);

    if (totalWeight === 0) {
        return candidates.find((r) => r.is_default === 1) || candidates[0];
    }

    let roll = Math.random() * totalWeight;
    for (const resp of candidates) {
        roll -= (resp.weight || 0);
        if (roll <= 0) return resp;
    }

    return candidates[candidates.length - 1];
}

module.exports = { matchPath, evaluateCondition, responseMatchesConditions, pickResponse };
