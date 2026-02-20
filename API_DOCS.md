# MockBird API — Full Documentation

**Base URL:** `http://localhost:3001` (dev) · swap for production URL when deployed  
**Content-Type:** All request/response bodies are `application/json`  
**Auth:** Protected routes require `Authorization: Bearer <clerk_session_token>`

---

## Table of Contents
1. [Authentication & Profile](#1-authentication--profile)
2. [Organizations](#2-organizations)
3. [Projects](#3-projects)
4. [Mocks](#4-mocks)
5. [Mock Responses](#5-mock-responses)
6. [Request Logs](#6-request-logs)
7. [Mock Execution (Public)](#7-mock-execution-public)
8. [Quick Reference](#8-quick-reference)

---

## 1. Authentication & Profile

MockBird uses **[Clerk](https://clerk.com)** for authentication. The backend does not handle registration, login, or passwords — Clerk's frontend SDK does that.

### Getting a session token (frontend)
```js
// Next.js App Router
const { getToken } = useAuth();
const token = await getToken();
```
Pass it on every request:
```
Authorization: Bearer <clerk_session_token>
```

---

### `GET /auth/me` ⚠️ Call this after every login
Upserts the Clerk user into MockBird's DB and returns their profile. **Must be called at least once before using any other endpoint.**

**Response `200 OK`**
```json
{
  "userId": "user_2abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "imageUrl": "https://...",
  "subscriptionTier": "free",
  "createdAt": "2026-02-20T12:07:40.455Z",
  "orgId": "org_xyz789",
  "orgRole": "org:admin",
  "orgName": "Acme Corp",
  "orgSlug": "acme-corp"
}
```

> - `orgId`, `orgRole`, `orgName`, `orgSlug` are `null` when the user is in personal (non-org) context
> - This endpoint **auto-creates** the user record in the DB — no separate signup needed

---

### `PATCH /auth/profile`
Update the user's display name (syncs to both Clerk and local DB).

**Request**
```json
{
  "firstName": "John",
  "lastName": "Doe"
}
```

| Field | Type | Required |
|-------|------|----------|
| `firstName` | string | ❌ |
| `lastName` | string | ❌ |

> At least one of `firstName` or `lastName` must be provided.

**Response `200 OK`**
```json
{
  "userId": "user_2abc123",
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "imageUrl": "https://..."
}
```

---

### Organization Context

When the user switches to an org in the frontend:
```js
await clerk.setActive({ organization: 'org_xyz789' });
```
The session token automatically includes `orgId`. MockBird scopes all project data to the org automatically — no extra params needed.

- **No `orgId` in token** → personal projects (user-scoped)
- **`orgId` present** → org projects (shared across all org members)

---

## 2. Organizations

All endpoints require `Authorization: Bearer <clerk_session_token>`.  
User must be a **member of the org** (their active session must have `orgId` matching the requested org).

---

### `GET /organizations/:id`
Get org name, slug, and member count.

**Response `200 OK`**
```json
{
  "orgId": "org_xyz789",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "imageUrl": "https://...",
  "membersCount": 5,
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `403` | User is not a member of this org |
| `404` | Org not found |

---

### `GET /organizations/:id/members?limit=20&offset=0`
Get paginated list of org members.

**Query params**
| Param | Default | Notes |
|-------|---------|-------|
| `limit` | `20` | Max 100 |
| `offset` | `0` | For pagination |

**Response `200 OK`**
```json
{
  "data": [
    {
      "membershipId": "mem_xxx",
      "role": "org:admin",
      "joinedAt": "2026-02-20T10:00:00.000Z",
      "user": {
        "userId": "user_2abc123",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "imageUrl": "https://..."
      }
    }
  ],
  "totalCount": 5,
  "limit": 20,
  "offset": 0
}
```

---

## 3. Projects

All endpoints require `Authorization: Bearer <clerk_session_token>`.  
Projects are automatically scoped to the **user** or **organization** based on the token.

---

### `GET /projects?search=`
List projects. Supports optional server-side search by name or description.

**Query params**
| Param | Notes |
|-------|-------|
| `search` | Filters by name or description (case-insensitive, partial match) |

**Response `200 OK`**
```json
{
  "data": [
    {
      "project_id": "uuid",
      "name": "My API",
      "description": "Test project",
      "slug": "my-api",
      "user_id": "user_2abc123",
      "org_id": "org_xyz789",
      "is_public": 0,
      "mock_count": 5,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

> `org_id` is `null` for personal projects

---

### `POST /projects`

**Request**
```json
{
  "name": "My API",
  "description": "Optional",
  "isPublic": false
}
```

**Response `201 Created`** — returns created project object

---

### `GET /projects/:id`
Returns project with its full `mocks` array.

---

### `PUT /projects/:id`
Update name/description/isPublic. All fields optional.

---

### `DELETE /projects/:id`
Cascades to delete all mocks + responses inside it.

---

### `GET /projects/:id/stats`
Aggregate hit stats for a project and per-mock breakdown.

**Response `200 OK`**
```json
{
  "data": {
    "projectId": "uuid",
    "totalRequests": 1234,
    "lastRequestAt": "2026-02-20T18:00:00.000Z",
    "mocks": [
      {
        "mock_id": "uuid",
        "name": "Get Users",
        "path": "/users",
        "method": "GET",
        "total_requests": 900,
        "last_request_at": "2026-02-20T18:00:00.000Z",
        "avg_response_time_ms": 12.5
      }
    ]
  }
}
```

---

### `POST /projects/:id/duplicate`
Deep-clones a project including **all mocks and all responses**.  
The clone gets a new slug (`original-slug-copy`) and name (`Original Name (Copy)`).

**Response `201 Created`** — returns the new cloned project object

---

## 4. Mocks

All endpoints require `Authorization: Bearer <clerk_session_token>`.

---

### `GET /projects/:projectId/mocks`
List all mocks for a project. Includes `response_count` per mock.

---

### `POST /projects/:projectId/mocks`

**Request**
```json
{
  "name": "Get Users",
  "path": "/users",
  "method": "GET",
  "description": "Returns user list",
  "responseType": "json",
  "responseDelay": 500
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | |
| `path` | string | ✅ | Use `{paramName}` for path params, e.g. `/users/{id}` |
| `method` | string | ✅ | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `description` | string | ❌ | |
| `responseType` | string | ❌ | `json` (default), `xml`, `text`, `html` |
| `responseDelay` | number | ❌ | Delay in ms before responding. Default `0` |

**Response `201 Created`** — returns created mock object

---

### `GET /mocks/:id`
Returns mock with its full `responses` array.

---

### `PUT /mocks/:id`
Update any mock field. All optional. Supports `isActive` (boolean) to toggle the mock on/off.

---

### `DELETE /mocks/:id`
Deletes the mock and all its responses.

---

### `POST /mocks/:id/duplicate`
Clones a single mock (with all responses) into the same project.  
The clone gets name `Original Name (Copy)`.

**Response `201 Created`** — returns the new cloned mock object

---

## 5. Mock Responses

All endpoints require `Authorization: Bearer <clerk_session_token>`.  
A mock can have multiple responses. The one where `is_default = 1` is returned when the endpoint is hit.

---

### `GET /mocks/:id/responses`

**Response `200 OK`**
```json
{
  "data": [
    {
      "response_id": "uuid",
      "mock_id": "uuid",
      "name": "Success",
      "status_code": 200,
      "headers": "{\"X-Custom\": \"value\"}",
      "body": "{\"users\": []}",
      "is_default": 1,
      "weight": 100,
      "created_at": "..."
    }
  ]
}
```

> `headers` is returned as a **JSON string** — use `JSON.parse(response.headers)` before displaying

---

### `POST /mocks/:id/responses`

**Request**
```json
{
  "name": "Success",
  "statusCode": 200,
  "headers": {
    "X-Custom-Header": "value"
  },
  "body": "{\"users\": [{\"id\": 1}]}",
  "isDefault": true,
  "weight": 100
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ❌ | Defaults to `"Response"` |
| `statusCode` | number | ❌ | Defaults to `200` |
| `headers` | object | ❌ | Key-value pairs |
| `body` | string | ❌ | **Must be a string** — serialize JSON first |
| `isDefault` | boolean | ❌ | Setting `true` auto-unsets the previous default |
| `weight` | number | ❌ | Defaults to `100` (reserved for future use) |

**Response `201 Created`** — returns created response object

---

### `PUT /mocks/:id/responses/:responseId`
Update any field. Same shape as POST. All optional.

---

### `DELETE /mocks/:id/responses/:responseId`

---

## 6. Request Logs

All endpoints require `Authorization: Bearer <clerk_session_token>`.

---

### `GET /mocks/:id/request-logs`
Returns paginated log of every request that hit this mock endpoint.

**Query params**
| Param | Default | Notes |
|-------|---------|-------|
| `page` | `1` | Page number |
| `limit` | `50` | Max `100` |
| `startDate` | — | ISO 8601 string, e.g. `2026-02-01T00:00:00Z` |
| `endDate` | — | ISO 8601 string |

**Response `200 OK`**
```json
{
  "data": [
    {
      "log_id": "uuid",
      "mock_id": "uuid",
      "project_id": "uuid",
      "request_path": "/users",
      "request_method": "GET",
      "request_headers": "{...}",
      "request_body": "",
      "request_query": "{}",
      "response_status": 200,
      "response_time_ms": 12,
      "ip_address": "127.0.0.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2026-02-20T18:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 243,
    "totalPages": 5
  }
}
```

> `request_headers` and `request_query` are JSON strings — parse them before display

---

## 7. Mock Execution (Public)

> ⚡ **No authentication required.** External clients call these URLs.

### `{ANY METHOD} /m/:projectSlug/*path`

**Examples:**
```
GET    http://localhost:3001/m/my-api/users
POST   http://localhost:3001/m/my-api/users
GET    http://localhost:3001/m/my-api/users/123
DELETE http://localhost:3001/m/my-api/users/123
```

**Behaviour:**
- Looks up project by `slug`
- Finds best matching mock (exact path → then pattern match with `{param}`)
- Applies `response_delay_ms` before responding
- Sets custom headers and status code from the default response
- Logs every request automatically

**CORS headers are always set:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,PATCH,OPTIONS
Access-Control-Allow-Headers: *
```
OPTIONS preflight → `204 No Content`

**Error responses (always JSON):**

| Error code | HTTP | Meaning |
|------------|------|---------|
| `PROJECT_NOT_FOUND` | 404 | No project with that slug |
| `MOCK_NOT_FOUND` | 404 | No mock matches the method + path |
| `NO_RESPONSE_DEFINED` | 404 | Mock exists but has no responses |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 8. Quick Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/me` | ✅ | Sync Clerk user + get profile (call after login) |
| `PATCH` | `/auth/profile` | ✅ | Update display name |
| `GET` | `/organizations/:id` | ✅ | Get org name, slug, member count |
| `GET` | `/organizations/:id/members` | ✅ | List org members with roles |
| `GET` | `/projects?search=` | ✅ | List projects (supports search) |
| `POST` | `/projects` | ✅ | Create project |
| `GET` | `/projects/:id` | ✅ | Get project + mocks |
| `PUT` | `/projects/:id` | ✅ | Update project |
| `DELETE` | `/projects/:id` | ✅ | Delete project (cascades) |
| `GET` | `/projects/:id/stats` | ✅ | Request stats + per-mock breakdown |
| `POST` | `/projects/:id/duplicate` | ✅ | Deep-clone project |
| `GET` | `/projects/:projectId/mocks` | ✅ | List mocks |
| `POST` | `/projects/:projectId/mocks` | ✅ | Create mock |
| `GET` | `/mocks/:id` | ✅ | Get mock + responses |
| `PUT` | `/mocks/:id` | ✅ | Update mock |
| `DELETE` | `/mocks/:id` | ✅ | Delete mock |
| `POST` | `/mocks/:id/duplicate` | ✅ | Clone mock |
| `GET` | `/mocks/:id/responses` | ✅ | List responses |
| `POST` | `/mocks/:id/responses` | ✅ | Add response |
| `PUT` | `/mocks/:id/responses/:rid` | ✅ | Update response |
| `DELETE` | `/mocks/:id/responses/:rid` | ✅ | Delete response |
| `GET` | `/mocks/:id/request-logs` | ✅ | View request history |
| `ANY` | `/m/:slug/*path` | ❌ | **Execute mock** (public endpoint) |

> ✅ = requires `Authorization: Bearer <clerk_session_token>`  
> ❌ = no auth required
