# MockBird API — Full Documentation

**Base URL:** `http://localhost:3001` (dev) · swap for production URL when deployed  
**Content-Type:** All request/response bodies are `application/json` unless noted  
**Authentication:** Protected routes require a `Bearer` token in the `Authorization` header

---

## Table of Contents
1. [Authentication](#1-authentication)
2. [Projects](#2-projects)
3. [Mocks](#3-mocks)
4. [Mock Responses](#4-mock-responses)
5. [Mock Execution (Public)](#5-mock-execution-public)
6. [Common Error Formats](#6-common-errors)

---

## 1. Authentication

### `POST /auth/register`
Create a new user account.

**Request**
```json
{
  "email": "user@example.com",
  "password": "YourPassword123",
  "name": "John Doe"
}
```

**Response `201 Created`**
```json
{
  "token": "<jwt_token>",
  "user": {
    "userId": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "free"
  }
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `400` | Missing `email`, `password`, or `name` |
| `409` | Email already registered |

---

### `POST /auth/login`
Log in with existing credentials.

**Request**
```json
{
  "email": "user@example.com",
  "password": "YourPassword123"
}
```

**Response `200 OK`**
```json
{
  "token": "<jwt_token>",
  "user": {
    "userId": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "free"
  }
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `400` | Missing email or password |
| `401` | Invalid credentials |

---

### `GET /auth/me`
Get the currently logged-in user's profile.

**Headers (required)**
```
Authorization: Bearer <jwt_token>
```

**Response `200 OK`**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "subscriptionTier": "free",
  "createdAt": "2026-02-20T12:07:40.455Z"
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `401` | Missing or invalid token |
| `404` | User not found |

---

## 2. Projects

> All project endpoints require `Authorization: Bearer <jwt_token>`.
> Users can only see and modify their own projects.

---

### `GET /projects`
List all projects for the authenticated user.

**Response `200 OK`**
```json
{
  "data": [
    {
      "project_id": "uuid",
      "name": "My API",
      "description": "Test project",
      "slug": "my-api",
      "user_id": "uuid",
      "is_public": 0,
      "mock_count": 5,
      "created_at": "2026-02-20T12:08:05.589Z",
      "updated_at": "2026-02-20T12:08:05.589Z"
    }
  ]
}
```

> `mock_count` — total number of mock endpoints in this project  
> `is_public` — `0` = private, `1` = public  
> `slug` — URL-safe ID used in mock execution URLs (auto-generated from name)

---

### `POST /projects`
Create a new project.

**Request**
```json
{
  "name": "My API",
  "description": "Optional description",
  "isPublic": false
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Used to auto-generate the `slug` |
| `description` | string | ❌ | |
| `isPublic` | boolean | ❌ | Defaults to `false` |

**Response `201 Created`**
```json
{
  "data": {
    "project_id": "uuid",
    "name": "My API",
    "description": "Optional description",
    "slug": "my-api",
    "user_id": "uuid",
    "is_public": 0,
    "created_at": "2026-02-20T12:08:05.589Z",
    "updated_at": "2026-02-20T12:08:05.589Z"
  }
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `400` | `name` is missing |

---

### `GET /projects/:id`
Get a single project including its mock list.

**Response `200 OK`**
```json
{
  "data": {
    "project_id": "uuid",
    "name": "My API",
    "description": "...",
    "slug": "my-api",
    "is_public": 0,
    "created_at": "...",
    "updated_at": "...",
    "mocks": [
      {
        "mock_id": "uuid",
        "name": "Get Users",
        "path": "/users",
        "method": "GET",
        "is_active": 1,
        "response_type": "json",
        "response_delay_ms": 0
      }
    ]
  }
}
```

**Errors**
| Status | Reason |
|--------|--------|
| `404` | Project not found or not owned by user |

---

### `PUT /projects/:id`
Update a project. All fields are optional — only send what you want to change.

**Request**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "isPublic": true
}
```

**Response `200 OK`** — returns the updated project object (same shape as POST response)

**Errors**
| Status | Reason |
|--------|--------|
| `404` | Project not found |

---

### `DELETE /projects/:id`
Delete a project. This cascades to delete all mocks and responses inside it.

**Response `200 OK`**
```json
{ "message": "Project deleted successfully" }
```

---

## 3. Mocks

> All mock endpoints require `Authorization: Bearer <jwt_token>`.

---

### `GET /projects/:projectId/mocks`
List all mock endpoints for a project.

**Response `200 OK`**
```json
{
  "data": [
    {
      "mock_id": "uuid",
      "project_id": "uuid",
      "name": "Get Users",
      "path": "/users",
      "method": "GET",
      "description": "",
      "is_active": 1,
      "response_type": "json",
      "response_delay_ms": 0,
      "response_count": 2,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

> `response_count` — number of configured responses for this mock

---

### `POST /projects/:projectId/mocks`
Create a new mock endpoint.

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
| `name` | string | ✅ | Display name |
| `path` | string | ✅ | e.g. `/users` or `/users/{id}` |
| `method` | string | ✅ | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `description` | string | ❌ | |
| `responseType` | string | ❌ | `json` (default), `xml`, `text`, `html` |
| `responseDelay` | number | ❌ | Delay in ms, default `0` |

> **Path Parameters:** Use `{paramName}` syntax in paths, e.g. `/users/{id}/posts/{postId}`

**Response `201 Created`**
```json
{
  "data": {
    "mock_id": "uuid",
    "project_id": "uuid",
    "name": "Get Users",
    "path": "/users",
    "method": "GET",
    "description": "Returns user list",
    "is_active": 1,
    "response_type": "json",
    "response_delay_ms": 500,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

### `GET /mocks/:id`
Get a single mock with all its configured responses.

**Response `200 OK`**
```json
{
  "data": {
    "mock_id": "uuid",
    "name": "Get Users",
    "path": "/users",
    "method": "GET",
    "is_active": 1,
    "response_type": "json",
    "response_delay_ms": 0,
    "responses": [
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
}
```

> `headers` field is returned as a **JSON string** — parse it before use: `JSON.parse(response.headers)`

---

### `PUT /mocks/:id`
Update a mock. All fields are optional.

**Request**
```json
{
  "name": "Updated Name",
  "path": "/users/v2",
  "method": "POST",
  "description": "Updated",
  "responseType": "json",
  "responseDelay": 1000,
  "isActive": false
}
```

**Response `200 OK`** — returns updated mock object

---

### `DELETE /mocks/:id`
Delete a mock and all its responses.

**Response `200 OK`**
```json
{ "message": "Mock deleted successfully" }
```

---

## 4. Mock Responses

> All response endpoints require `Authorization: Bearer <jwt_token>`.
> A single mock can have multiple responses. The one with `is_default: 1` is returned when the endpoint is hit.

---

### `GET /mocks/:id/responses`
List all responses for a mock.

**Response `200 OK`**
```json
{
  "data": [
    {
      "response_id": "uuid",
      "mock_id": "uuid",
      "name": "Success",
      "status_code": 200,
      "headers": "{\"Content-Type\": \"application/json\"}",
      "body": "{\"users\": []}",
      "is_default": 1,
      "weight": 100,
      "created_at": "..."
    }
  ]
}
```

---

### `POST /mocks/:id/responses`
Add a response to a mock.

**Request**
```json
{
  "name": "Success",
  "statusCode": 200,
  "headers": {
    "X-Custom-Header": "value",
    "Cache-Control": "no-cache"
  },
  "body": "{\"users\": [{\"id\": 1, \"name\": \"Alice\"}]}",
  "isDefault": true,
  "weight": 100
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ❌ | Label, defaults to `"Response"` |
| `statusCode` | number | ❌ | HTTP status, defaults to `200` |
| `headers` | object | ❌ | Key-value pairs of response headers |
| `body` | string | ❌ | Raw response body string |
| `isDefault` | boolean | ❌ | If `true`, this response is returned when the mock is hit. Setting a new default auto-unsets the previous one |
| `weight` | number | ❌ | Reserved for future random response weighting, defaults to `100` |

> **Important:** `body` must be a **string** — even for JSON, serialize it first: `JSON.stringify({users:[]})` → `"{\"users\":[]}"`. The server sends it as-is.

**Response `201 Created`**
```json
{
  "data": {
    "response_id": "uuid",
    "mock_id": "uuid",
    "name": "Success",
    "status_code": 200,
    "headers": "{\"X-Custom-Header\":\"value\"}",
    "body": "{\"users\":[]}",
    "is_default": 1,
    "weight": 100,
    "created_at": "..."
  }
}
```

---

### `PUT /mocks/:id/responses/:responseId`
Update a specific response. All fields optional.

**Request** — same shape as POST

**Response `200 OK`** — returns updated response object

---

### `DELETE /mocks/:id/responses/:responseId`
Delete a specific response.

**Response `200 OK`**
```json
{ "message": "Response deleted successfully" }
```

---

## 5. Mock Execution (Public)

> ⚡ **No authentication required.** These URLs are what end users/clients call.

### `{ANY METHOD} /m/:projectSlug/*path`

The slug is the `slug` field from the project object. This handles ALL HTTP methods.

**Examples:**
```
GET  http://localhost:3001/m/my-api/users
POST http://localhost:3001/m/my-api/users
GET  http://localhost:3001/m/my-api/users/123
GET  http://localhost:3001/m/my-api/products?category=electronics
```

**Behaviour:**
- Looks up project by `slug`
- Finds the best matching mock for (`method` + `path`)
- Supports exact match: `/users`
- Supports path params: `/users/{id}` matches `/users/123`
- Applies `response_delay_ms` before responding
- Sets all custom response headers from the default response
- Returns the response body with the configured status code
- Logs every request to `request_logs`

**Success** — returns the configured body, status code, and headers (varies per mock)

**Error Responses** (always JSON):

`404` — Project not found:
```json
{
  "error": "PROJECT_NOT_FOUND",
  "message": "No project found with slug \"my-api\""
}
```

`404` — No matching mock:
```json
{
  "error": "MOCK_NOT_FOUND",
  "message": "No mock found for GET /nonexistent"
}
```

`404` — Mock has no responses configured:
```json
{
  "error": "NO_RESPONSE_DEFINED",
  "message": "This mock has no responses configured"
}
```

`500` — Internal error:
```json
{
  "error": "INTERNAL_ERROR",
  "message": "An error occurred while processing the mock request"
}
```

**CORS:** All mock execution responses automatically include:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,PATCH,OPTIONS
Access-Control-Allow-Headers: *
```
OPTIONS preflight returns `204 No Content`.

---

## 6. Common Errors

### Auth Errors (applies to all protected routes)

`401 Unauthorized` — No token:
```json
{ "error": "Missing or invalid Authorization header" }
```

`401 Unauthorized` — Bad/expired token:
```json
{ "error": "Invalid or expired token" }
```

### General Server Error
`500 Internal Server Error`:
```json
{ "error": "Failed to <action>" }
```

---

## Quick Reference — All Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | ❌ | Register |
| `POST` | `/auth/login` | ❌ | Login |
| `GET` | `/auth/me` | ✅ | Get current user |
| `GET` | `/projects` | ✅ | List projects |
| `POST` | `/projects` | ✅ | Create project |
| `GET` | `/projects/:id` | ✅ | Get project + mocks |
| `PUT` | `/projects/:id` | ✅ | Update project |
| `DELETE` | `/projects/:id` | ✅ | Delete project |
| `GET` | `/projects/:projectId/mocks` | ✅ | List mocks |
| `POST` | `/projects/:projectId/mocks` | ✅ | Create mock |
| `GET` | `/mocks/:id` | ✅ | Get mock + responses |
| `PUT` | `/mocks/:id` | ✅ | Update mock |
| `DELETE` | `/mocks/:id` | ✅ | Delete mock |
| `GET` | `/mocks/:id/responses` | ✅ | List responses |
| `POST` | `/mocks/:id/responses` | ✅ | Add response |
| `PUT` | `/mocks/:id/responses/:rid` | ✅ | Update response |
| `DELETE` | `/mocks/:id/responses/:rid` | ✅ | Delete response |
| `ANY` | `/m/:slug/*path` | ❌ | **Execute mock** |
