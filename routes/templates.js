const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');
const { getAuth } = require('@clerk/express');

function getScope(auth) {
    if (auth.orgId) {
        return { scopeWhere: 'org_id = ?', scopeValues: [auth.orgId] };
    }
    return { scopeWhere: 'user_id = ? AND org_id IS NULL', scopeValues: [auth.userId] };
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 50);
}

async function uniqueSlug(base) {
    const existing = await turso.execute('SELECT slug FROM projects WHERE slug = ?', [base]);
    if (existing.rows.length === 0) return base;
    const suffix = uuidv4().substring(0, 6);
    return `${base}-${suffix}`;
}

// ── Helper to build response objects consistently ──────────────────────────
const jsonHeaders = JSON.stringify({ 'Content-Type': 'application/json' });

function resp(name, statusCode, body, opts = {}) {
    return {
        name,
        statusCode,
        headers: jsonHeaders,
        body: JSON.stringify(body, null, 2),
        isDefault: opts.isDefault || false,
        weight: opts.weight ?? 100,
        conditions: opts.conditions || null,
    };
}

// ── TEMPLATES ──────────────────────────────────────────────────────────────
const TEMPLATES = [

    // ───────────────────────────────── 1. E-COMMERCE ──────────────────────────
    {
        id: 'ecommerce',
        name: 'E-commerce API',
        description: 'Product catalog, cart, and checkout flow with realistic sample data',
        icon: '🛒',
        mocks: [
            {
                name: 'List Products', path: '/products', method: 'GET',
                description: 'Returns a paginated list of products.\n\nSupports query params: ?page=1&limit=10&category=electronics',
                responses: [
                    resp('Success', 200, {
                        page: 1, limit: 10, total: 3,
                        data: [
                            { id: 1, name: 'Wireless Headphones', price: 99.99, currency: 'USD', stock: 45, category: 'electronics', imageUrl: 'https://placehold.co/200x200?text=Headphones' },
                            { id: 2, name: 'Mechanical Keyboard', price: 129.99, currency: 'USD', stock: 12, category: 'electronics', imageUrl: 'https://placehold.co/200x200?text=Keyboard' },
                            { id: 3, name: 'USB-C Hub', price: 49.99, currency: 'USD', stock: 78, category: 'accessories', imageUrl: 'https://placehold.co/200x200?text=Hub' }
                        ]
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Get Product', path: '/products/{id}', method: 'GET',
                description: 'Get details for a single product by ID',
                responses: [
                    resp('Found', 200, { id: 1, name: 'Wireless Headphones', price: 99.99, currency: 'USD', stock: 45, category: 'electronics', description: 'Premium over-ear headphones with ANC', specs: { connectivity: 'Bluetooth 5.3', battery: '30h', weight: '250g' }, ratings: { average: 4.7, count: 128 } }, { isDefault: true }),
                    resp('Not Found', 404, { error: 'PRODUCT_NOT_FOUND', message: 'No product found with the given ID' }, { conditions: [{ type: 'path', field: 'id', operator: 'equals', value: '999' }] })
                ]
            },
            {
                name: 'Add to Cart', path: '/cart/items', method: 'POST',
                description: 'Add a product to the shopping cart.\n\nExpected JSON Body:\n{\n  "productId": 1,\n  "quantity": 2\n}', expectedBody: "{\n  \"productId\": 1,\n  \"quantity\": 2\n}",
                responses: [
                    resp('Added', 201, { cartId: 'cart_abc123', items: [{ productId: 1, name: 'Wireless Headphones', quantity: 2, unitPrice: 99.99, subtotal: 199.98 }], total: 199.98, itemCount: 2 }, { isDefault: true }),
                    resp('Out of Stock', 400, { error: 'OUT_OF_STOCK', message: 'Requested quantity exceeds available stock' }, { conditions: [{ type: 'body', field: 'quantity', operator: 'regex', value: '^[1-9][0-9]{2,}$' }] })
                ]
            },
            {
                name: 'Get Cart', path: '/cart', method: 'GET',
                description: 'Retrieve the current cart contents',
                responses: [
                    resp('Cart', 200, { cartId: 'cart_abc123', items: [{ productId: 1, name: 'Wireless Headphones', quantity: 1, unitPrice: 99.99 }], subtotal: 99.99, tax: 8.00, total: 107.99, currency: 'USD' }, { isDefault: true })
                ]
            },
            {
                name: 'Checkout', path: '/checkout', method: 'POST',
                description: 'Process payment and complete order.\n\nExpected JSON Body:\n{\n  "cartId": "cart_abc123",\n  "paymentMethod": "card",\n  "shippingAddress": {\n    "line1": "123 Main St",\n    "city": "San Francisco",\n    "state": "CA",\n    "zip": "94102"\n  }\n}', expectedBody: "{\n  \"cartId\": \"cart_abc123\",\n  \"paymentMethod\": \"card\",\n  \"shippingAddress\": {\n    \"line1\": \"123 Main St\",\n    \"city\": \"San Francisco\",\n    \"state\": \"CA\",\n    \"zip\": \"94102\"\n  }\n}",
                responses: [
                    resp('Success', 200, { orderId: 'ORD-8X9Y2Z', status: 'confirmed', paymentStatus: 'paid', estimatedDelivery: '2025-03-05', trackingUrl: null }, { isDefault: true }),
                    resp('Payment Failed', 402, { error: 'PAYMENT_DECLINED', message: 'Card declined by issuing bank. Try a different payment method.' }, { conditions: [{ type: 'body', field: 'paymentMethod', operator: 'equals', value: 'declined_card' }] })
                ]
            }
        ]
    },

    // ───────────────────────────────── 2. AUTHENTICATION ─────────────────────
    {
        id: 'auth',
        name: 'Authentication API',
        description: 'Registration, login, token refresh, and password reset flow',
        icon: '🔐',
        mocks: [
            {
                name: 'Register', path: '/auth/register', method: 'POST',
                description: 'Create a new user account.\n\nExpected JSON Body:\n{\n  "email": "user@example.com",\n  "password": "securepassword123",\n  "name": "John Doe"\n}', expectedBody: "{\n  \"email\": \"user@example.com\",\n  \"password\": \"securepassword123\",\n  \"name\": \"John Doe\"\n}",
                responses: [
                    resp('Created', 201, { userId: 'us_abc123', email: 'user@example.com', name: 'John Doe', token: 'eyJhbGciOiJIUzI1NiJ9.mock_access_token', refreshToken: 'rt_mock_refresh_abc', expiresIn: 3600 }, { isDefault: true }),
                    resp('Email Taken', 409, { error: 'EMAIL_EXISTS', message: 'An account with this email already exists' }, { conditions: [{ type: 'body', field: 'email', operator: 'equals', value: 'admin@example.com' }] }),
                    resp('Validation Error', 400, { error: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }, { conditions: [{ type: 'body', field: 'password', operator: 'equals', value: 'short' }] })
                ]
            },
            {
                name: 'Login', path: '/auth/login', method: 'POST',
                description: 'Authenticate and receive tokens.\n\nExpected JSON Body:\n{\n  "email": "user@example.com",\n  "password": "securepassword123"\n}', expectedBody: "{\n  \"email\": \"user@example.com\",\n  \"password\": \"securepassword123\"\n}",
                responses: [
                    resp('Success', 200, { token: 'eyJhbGciOiJIUzI1NiJ9.mock_access_token', refreshToken: 'rt_mock_refresh_abc', expiresIn: 3600, user: { id: 'us_abc123', email: 'user@example.com', role: 'user' } }, { isDefault: true }),
                    resp('Invalid Credentials', 401, { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, { conditions: [{ type: 'body', field: 'password', operator: 'equals', value: 'wrongpassword' }] })
                ]
            },
            {
                name: 'Get Current User', path: '/auth/me', method: 'GET',
                description: 'Get the currently authenticated user profile.\n\nExpected Headers:\nAuthorization: Bearer <token>', expectedHeaders: "{\"Authorization\":\"Bearer <token>\"}",
                responses: [
                    resp('Success', 200, { id: 'us_abc123', email: 'user@example.com', name: 'John Doe', role: 'user', verified: true, avatar: 'https://placehold.co/100x100?text=JD', createdAt: '2025-01-15T10:30:00Z' }, { isDefault: true }),
                    resp('Unauthorized', 401, { error: 'UNAUTHORIZED', message: 'Token expired or invalid' }, { conditions: [{ type: 'header', field: 'authorization', operator: 'equals', value: 'Bearer expired_token' }] })
                ]
            },
            {
                name: 'Refresh Token', path: '/auth/refresh', method: 'POST',
                description: 'Exchange a refresh token for a new access token.\n\nExpected JSON Body:\n{\n  "refreshToken": "rt_mock_refresh_abc"\n}', expectedBody: "{\n  \"refreshToken\": \"rt_mock_refresh_abc\"\n}",
                responses: [
                    resp('Refreshed', 200, { token: 'eyJhbGciOiJIUzI1NiJ9.new_mock_token', refreshToken: 'rt_mock_refresh_new', expiresIn: 3600 }, { isDefault: true }),
                    resp('Invalid Token', 401, { error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is expired or revoked' }, { conditions: [{ type: 'body', field: 'refreshToken', operator: 'equals', value: 'invalid' }] })
                ]
            },
            {
                name: 'Forgot Password', path: '/auth/forgot-password', method: 'POST',
                description: 'Request a password reset email.\n\nExpected JSON Body:\n{\n  "email": "user@example.com"\n}', expectedBody: "{\n  \"email\": \"user@example.com\"\n}",
                responses: [
                    resp('Email Sent', 200, { message: 'If an account with that email exists, a reset link has been sent.' }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 3. TO-DO LIST ─────────────────────────
    {
        id: 'todos',
        name: 'To-Do List API',
        description: 'Simple CRUD for managing tasks with status and priority',
        icon: '✅',
        mocks: [
            {
                name: 'List Tasks', path: '/todos', method: 'GET',
                description: 'Get all tasks. Supports ?status=pending&priority=high',
                responses: [
                    resp('Success', 200, [
                        { id: 1, title: 'Buy groceries', completed: false, priority: 'medium', dueDate: '2025-03-01', createdAt: '2025-02-20T08:00:00Z' },
                        { id: 2, title: 'Finish MockBird launch', completed: true, priority: 'high', dueDate: '2025-02-25', createdAt: '2025-02-18T10:00:00Z' },
                        { id: 3, title: 'Read documentation', completed: false, priority: 'low', dueDate: null, createdAt: '2025-02-22T14:30:00Z' }
                    ], { isDefault: true })
                ]
            },
            {
                name: 'Create Task', path: '/todos', method: 'POST',
                description: 'Create a new task.\n\nExpected JSON Body:\n{\n  "title": "New Task",\n  "priority": "medium",\n  "dueDate": "2025-04-01"\n}', expectedBody: "{\n  \"title\": \"New Task\",\n  \"priority\": \"medium\",\n  \"dueDate\": \"2025-04-01\"\n}",
                responses: [
                    resp('Created', 201, { id: 4, title: 'New Task', completed: false, priority: 'medium', dueDate: '2025-04-01', createdAt: '2025-02-25T12:00:00Z' }, { isDefault: true }),
                    resp('Validation Error', 400, { error: 'VALIDATION_ERROR', message: 'title is required' }, { conditions: [{ type: 'body', field: 'title', operator: 'equals', value: '' }] })
                ]
            },
            {
                name: 'Update Task', path: '/todos/{id}', method: 'PUT',
                description: 'Update an existing task.\n\nExpected JSON Body:\n{\n  "title": "Updated title",\n  "completed": true,\n  "priority": "high"\n}', expectedBody: "{\n  \"title\": \"Updated title\",\n  \"completed\": true,\n  \"priority\": \"high\"\n}",
                responses: [
                    resp('Updated', 200, { id: 1, title: 'Updated title', completed: true, priority: 'high', dueDate: '2025-03-01', updatedAt: '2025-02-25T12:05:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Delete Task', path: '/todos/{id}', method: 'DELETE',
                description: 'Delete a task by ID',
                responses: [
                    resp('Deleted', 200, { message: 'Task deleted successfully' }, { isDefault: true }),
                    resp('Not Found', 404, { error: 'NOT_FOUND', message: 'Task not found' }, { conditions: [{ type: 'path', field: 'id', operator: 'equals', value: '999' }] })
                ]
            }
        ]
    },

    // ───────────────────────────────── 4. SOCIAL MEDIA ───────────────────────
    {
        id: 'social',
        name: 'Social Media API',
        description: 'Users, posts, comments, likes, and follow system',
        icon: '📱',
        mocks: [
            {
                name: 'Get Feed', path: '/feed', method: 'GET',
                description: 'Get the user\'s personalized feed. Supports ?page=1&limit=20',
                responses: [
                    resp('Success', 200, {
                        page: 1, hasMore: true,
                        posts: [
                            { id: 'post_1', author: { id: 'us_1', name: 'Jane Doe', avatar: 'https://placehold.co/50x50?text=JD' }, content: 'Just launched my new project on MockBird! 🚀', imageUrl: null, likes: 42, comments: 5, isLiked: false, createdAt: '2025-02-24T18:00:00Z' },
                            { id: 'post_2', author: { id: 'us_2', name: 'Alex Smith', avatar: 'https://placehold.co/50x50?text=AS' }, content: 'Beautiful sunset from the office', imageUrl: 'https://placehold.co/600x400?text=Sunset', likes: 128, comments: 12, isLiked: true, createdAt: '2025-02-24T16:30:00Z' }
                        ]
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Create Post', path: '/posts', method: 'POST',
                description: 'Create a new post.\n\nExpected JSON Body:\n{\n  "content": "Hello world!",\n  "imageUrl": "https://example.com/photo.jpg"\n}', expectedBody: "{\n  \"content\": \"Hello world!\",\n  \"imageUrl\": \"https://example.com/photo.jpg\"\n}",
                responses: [
                    resp('Created', 201, { id: 'post_new', content: 'Hello world!', imageUrl: null, likes: 0, comments: 0, createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Get Post Comments', path: '/posts/{postId}/comments', method: 'GET',
                description: 'Get all comments for a specific post',
                responses: [
                    resp('Success', 200, [
                        { id: 'c_1', author: { id: 'us_3', name: 'Sam Lee', avatar: 'https://placehold.co/50x50?text=SL' }, text: 'Congrats! 🎉', likes: 3, createdAt: '2025-02-24T18:15:00Z' },
                        { id: 'c_2', author: { id: 'us_4', name: 'Maya Chen', avatar: 'https://placehold.co/50x50?text=MC' }, text: 'This looks amazing!', likes: 1, createdAt: '2025-02-24T18:20:00Z' }
                    ], { isDefault: true })
                ]
            },
            {
                name: 'Like Post', path: '/posts/{postId}/like', method: 'POST',
                description: 'Toggle like on a post',
                responses: [
                    resp('Liked', 200, { liked: true, totalLikes: 43 }, { isDefault: true })
                ]
            },
            {
                name: 'Get User Profile', path: '/users/{userId}', method: 'GET',
                description: 'Get a user\'s public profile',
                responses: [
                    resp('Success', 200, { id: 'us_1', name: 'Jane Doe', bio: 'Full-stack developer & design enthusiast', avatar: 'https://placehold.co/200x200?text=JD', followers: 1250, following: 340, posts: 89, isFollowing: false, joinedAt: '2024-06-15T00:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Follow User', path: '/users/{userId}/follow', method: 'POST',
                description: 'Follow or unfollow a user',
                responses: [
                    resp('Followed', 200, { following: true, followerCount: 1251 }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 5. BLOG / CMS ────────────────────────
    {
        id: 'blog',
        name: 'Blog / CMS API',
        description: 'Articles, categories, tags, and comments for a content platform',
        icon: '📝',
        mocks: [
            {
                name: 'List Articles', path: '/articles', method: 'GET',
                description: 'Get published articles. Supports ?category=tech&page=1&limit=10',
                responses: [
                    resp('Success', 200, {
                        data: [
                            { id: 'art_1', title: 'Getting Started with MockBird', slug: 'getting-started-mockbird', excerpt: 'Learn how to create mock APIs in minutes...', author: { name: 'John Doe', avatar: 'https://placehold.co/40x40?text=JD' }, category: 'Tutorial', tags: ['api', 'mockbird', 'tutorial'], readTime: '5 min', publishedAt: '2025-02-20T10:00:00Z' },
                            { id: 'art_2', title: 'Best Practices for API Design', slug: 'api-design-best-practices', excerpt: 'A comprehensive guide to designing RESTful APIs...', author: { name: 'Jane Smith', avatar: 'https://placehold.co/40x40?text=JS' }, category: 'Guide', tags: ['api', 'rest', 'design'], readTime: '12 min', publishedAt: '2025-02-18T14:00:00Z' }
                        ],
                        pagination: { page: 1, limit: 10, total: 24, pages: 3 }
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Get Article', path: '/articles/{slug}', method: 'GET',
                description: 'Get full article content by slug',
                responses: [
                    resp('Found', 200, { id: 'art_1', title: 'Getting Started with MockBird', slug: 'getting-started-mockbird', content: '# Getting Started\n\nMockBird lets you create mock APIs instantly. Here\'s how to get started...\n\n## Step 1: Create a Project\n\nNavigate to your dashboard and click "New Project".\n\n## Step 2: Add Endpoints\n\nDefine your mock endpoints with paths, methods, and responses.', author: { name: 'John Doe', avatar: 'https://placehold.co/40x40?text=JD', bio: 'Tech writer' }, category: 'Tutorial', tags: ['api', 'mockbird'], readTime: '5 min', views: 1523, publishedAt: '2025-02-20T10:00:00Z' }, { isDefault: true }),
                    resp('Not Found', 404, { error: 'ARTICLE_NOT_FOUND', message: 'No article found with this slug' }, { conditions: [{ type: 'path', field: 'slug', operator: 'equals', value: 'nonexistent' }] })
                ]
            },
            {
                name: 'Create Article', path: '/articles', method: 'POST',
                description: 'Create a new article (draft by default).\n\nExpected JSON Body:\n{\n  "title": "My New Article",\n  "content": "Full markdown content here...",\n  "category": "Tutorial",\n  "tags": ["api", "guide"],\n  "status": "draft"\n}', expectedBody: "{\n  \"title\": \"My New Article\",\n  \"content\": \"Full markdown content here...\",\n  \"category\": \"Tutorial\",\n  \"tags\": [\"api\", \"guide\"],\n  \"status\": \"draft\"\n}",
                responses: [
                    resp('Created', 201, { id: 'art_new', title: 'My New Article', slug: 'my-new-article', status: 'draft', createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'List Categories', path: '/categories', method: 'GET',
                description: 'Get all available categories',
                responses: [
                    resp('Success', 200, [
                        { id: 1, name: 'Tutorial', slug: 'tutorial', articleCount: 12 },
                        { id: 2, name: 'Guide', slug: 'guide', articleCount: 8 },
                        { id: 3, name: 'News', slug: 'news', articleCount: 15 },
                        { id: 4, name: 'Opinion', slug: 'opinion', articleCount: 6 }
                    ], { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 6. PAYMENTS ───────────────────────────
    {
        id: 'payments',
        name: 'Payments API',
        description: 'Stripe-like charges, refunds, subscriptions, and invoices',
        icon: '💳',
        mocks: [
            {
                name: 'Create Charge', path: '/charges', method: 'POST',
                description: 'Create a new payment charge.\n\nExpected JSON Body:\n{\n  "amount": 4999,\n  "currency": "usd",\n  "source": "tok_visa",\n  "description": "Order #1234"\n}', expectedBody: "{\n  \"amount\": 4999,\n  \"currency\": \"usd\",\n  \"source\": \"tok_visa\",\n  \"description\": \"Order #1234\"\n}",
                responses: [
                    resp('Charged', 201, { id: 'ch_1abc', amount: 4999, currency: 'usd', status: 'succeeded', source: { brand: 'Visa', last4: '4242' }, description: 'Order #1234', receiptUrl: 'https://example.com/receipt/ch_1abc', createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true }),
                    resp('Card Declined', 402, { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined. Try a different payment method.' } }, { conditions: [{ type: 'body', field: 'source', operator: 'equals', value: 'tok_declined' }] })
                ]
            },
            {
                name: 'Get Charge', path: '/charges/{id}', method: 'GET',
                description: 'Retrieve a specific charge by ID',
                responses: [
                    resp('Found', 200, { id: 'ch_1abc', amount: 4999, currency: 'usd', status: 'succeeded', refunded: false, source: { brand: 'Visa', last4: '4242' }, metadata: { orderId: '1234' }, createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Create Refund', path: '/refunds', method: 'POST',
                description: 'Issue a refund for a charge.\n\nExpected JSON Body:\n{\n  "chargeId": "ch_1abc",\n  "amount": 4999,\n  "reason": "requested_by_customer"\n}', expectedBody: "{\n  \"chargeId\": \"ch_1abc\",\n  \"amount\": 4999,\n  \"reason\": \"requested_by_customer\"\n}",
                responses: [
                    resp('Refunded', 201, { id: 'rf_1xyz', chargeId: 'ch_1abc', amount: 4999, currency: 'usd', status: 'succeeded', reason: 'requested_by_customer', createdAt: '2025-02-25T11:00:00Z' }, { isDefault: true }),
                    resp('Already Refunded', 400, { error: { type: 'invalid_request_error', message: 'Charge has already been fully refunded' } }, { conditions: [{ type: 'body', field: 'chargeId', operator: 'equals', value: 'ch_refunded' }] })
                ]
            },
            {
                name: 'List Subscriptions', path: '/subscriptions', method: 'GET',
                description: 'List all active subscriptions for the current account',
                responses: [
                    resp('Success', 200, {
                        data: [
                            { id: 'sub_1', plan: { id: 'plan_pro', name: 'Pro Plan', amount: 2999, interval: 'month' }, status: 'active', currentPeriodEnd: '2025-03-25T00:00:00Z', cancelAtPeriodEnd: false },
                            { id: 'sub_2', plan: { id: 'plan_basic', name: 'Basic Plan', amount: 999, interval: 'month' }, status: 'canceled', currentPeriodEnd: '2025-02-28T00:00:00Z', cancelAtPeriodEnd: true }
                        ]
                    }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 7. USER MANAGEMENT ───────────────────
    {
        id: 'users',
        name: 'User Management API',
        description: 'CRUD for users with roles, permissions, and avatar upload',
        icon: '👥',
        mocks: [
            {
                name: 'List Users', path: '/users', method: 'GET',
                description: 'List all users with pagination. Supports ?role=admin&search=john',
                responses: [
                    resp('Success', 200, {
                        data: [
                            { id: 'us_1', name: 'John Doe', email: 'john@example.com', role: 'admin', status: 'active', avatar: 'https://placehold.co/80x80?text=JD', lastLoginAt: '2025-02-24T18:00:00Z' },
                            { id: 'us_2', name: 'Jane Smith', email: 'jane@example.com', role: 'editor', status: 'active', avatar: 'https://placehold.co/80x80?text=JS', lastLoginAt: '2025-02-23T10:00:00Z' },
                            { id: 'us_3', name: 'Bob Wilson', email: 'bob@example.com', role: 'viewer', status: 'invited', avatar: null, lastLoginAt: null }
                        ],
                        pagination: { page: 1, limit: 20, total: 3 }
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Create User', path: '/users', method: 'POST',
                description: 'Invite a new user.\n\nExpected JSON Body:\n{\n  "name": "New User",\n  "email": "newuser@example.com",\n  "role": "viewer"\n}', expectedBody: "{\n  \"name\": \"New User\",\n  \"email\": \"newuser@example.com\",\n  \"role\": \"viewer\"\n}",
                responses: [
                    resp('Created', 201, { id: 'us_new', name: 'New User', email: 'newuser@example.com', role: 'viewer', status: 'invited', inviteSentAt: '2025-02-25T10:00:00Z' }, { isDefault: true }),
                    resp('Duplicate Email', 409, { error: 'DUPLICATE_EMAIL', message: 'A user with this email already exists' }, { conditions: [{ type: 'body', field: 'email', operator: 'equals', value: 'john@example.com' }] })
                ]
            },
            {
                name: 'Update User', path: '/users/{id}', method: 'PUT',
                description: 'Update user details.\n\nExpected JSON Body:\n{\n  "name": "Updated Name",\n  "role": "editor"\n}', expectedBody: "{\n  \"name\": \"Updated Name\",\n  \"role\": \"editor\"\n}",
                responses: [
                    resp('Updated', 200, { id: 'us_1', name: 'Updated Name', email: 'john@example.com', role: 'editor', status: 'active', updatedAt: '2025-02-25T10:05:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Delete User', path: '/users/{id}', method: 'DELETE',
                description: 'Remove a user from the system',
                responses: [
                    resp('Deleted', 200, { message: 'User deleted successfully' }, { isDefault: true }),
                    resp('Cannot Delete Self', 403, { error: 'FORBIDDEN', message: 'You cannot delete your own account' }, { conditions: [{ type: 'path', field: 'id', operator: 'equals', value: 'self' }] })
                ]
            }
        ]
    },

    // ───────────────────────────────── 8. CHAT / MESSAGING ──────────────────
    {
        id: 'chat',
        name: 'Chat / Messaging API',
        description: 'Conversations, messages, read receipts, and typing indicators',
        icon: '💬',
        mocks: [
            {
                name: 'List Conversations', path: '/conversations', method: 'GET',
                description: 'Get all conversations for the current user',
                responses: [
                    resp('Success', 200, [
                        { id: 'conv_1', type: 'direct', participants: [{ id: 'us_1', name: 'Jane Doe', avatar: 'https://placehold.co/40x40?text=JD', online: true }], lastMessage: { text: 'Hey, have you seen the new feature?', sentAt: '2025-02-24T18:30:00Z', read: false }, unreadCount: 2 },
                        { id: 'conv_2', type: 'group', name: 'Engineering Team', participants: [{ id: 'us_2', name: 'Alex' }, { id: 'us_3', name: 'Sam' }, { id: 'us_4', name: 'Maya' }], lastMessage: { text: 'Meeting at 3pm', sentAt: '2025-02-24T14:00:00Z', read: true }, unreadCount: 0 }
                    ], { isDefault: true })
                ]
            },
            {
                name: 'Get Messages', path: '/conversations/{id}/messages', method: 'GET',
                description: 'Get messages in a conversation. Supports ?before=<messageId>&limit=50',
                responses: [
                    resp('Success', 200, {
                        messages: [
                            { id: 'msg_1', senderId: 'us_1', text: 'Hey, have you seen the new feature?', type: 'text', readBy: ['us_1'], createdAt: '2025-02-24T18:30:00Z' },
                            { id: 'msg_2', senderId: 'us_current', text: 'Not yet! Tell me more', type: 'text', readBy: ['us_current', 'us_1'], createdAt: '2025-02-24T18:31:00Z' },
                            { id: 'msg_3', senderId: 'us_1', text: 'Check this out:', type: 'text', attachment: { type: 'image', url: 'https://placehold.co/400x300?text=Screenshot', name: 'screenshot.png' }, readBy: ['us_1'], createdAt: '2025-02-24T18:32:00Z' }
                        ],
                        hasMore: true
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Send Message', path: '/conversations/{id}/messages', method: 'POST',
                description: 'Send a message in a conversation.\n\nExpected JSON Body:\n{\n  "text": "Hello!",\n  "type": "text"\n}', expectedBody: "{\n  \"text\": \"Hello!\",\n  \"type\": \"text\"\n}",
                responses: [
                    resp('Sent', 201, { id: 'msg_new', senderId: 'us_current', text: 'Hello!', type: 'text', readBy: ['us_current'], createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Mark as Read', path: '/conversations/{id}/read', method: 'POST',
                description: 'Mark all messages in a conversation as read',
                responses: [
                    resp('Marked', 200, { conversationId: 'conv_1', unreadCount: 0, lastReadAt: '2025-02-25T10:01:00Z' }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 9. WEATHER ────────────────────────────
    {
        id: 'weather',
        name: 'Weather API',
        description: 'Current conditions, forecasts, and location search',
        icon: '🌤️',
        mocks: [
            {
                name: 'Current Weather', path: '/weather/current', method: 'GET',
                description: 'Get current weather for a location. Supports ?lat=37.7749&lon=-122.4194 or ?city=San+Francisco',
                responses: [
                    resp('Success', 200, { location: { city: 'San Francisco', region: 'California', country: 'US', lat: 37.7749, lon: -122.4194 }, current: { temp: 18, feelsLike: 16, humidity: 72, windSpeed: 15, windDirection: 'NW', condition: 'Partly Cloudy', icon: '⛅', uv: 3, visibility: 16 }, unit: 'metric', updatedAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: '5-Day Forecast', path: '/weather/forecast', method: 'GET',
                description: 'Get 5-day weather forecast. Supports ?lat=37.7749&lon=-122.4194',
                responses: [
                    resp('Success', 200, {
                        location: { city: 'San Francisco', country: 'US' },
                        forecast: [
                            { date: '2025-02-25', high: 19, low: 12, condition: 'Partly Cloudy', icon: '⛅', precipitation: 10 },
                            { date: '2025-02-26', high: 17, low: 10, condition: 'Rain', icon: '🌧️', precipitation: 80 },
                            { date: '2025-02-27', high: 15, low: 9, condition: 'Thunderstorm', icon: '⛈️', precipitation: 90 },
                            { date: '2025-02-28', high: 20, low: 13, condition: 'Sunny', icon: '☀️', precipitation: 0 },
                            { date: '2025-03-01', high: 21, low: 14, condition: 'Sunny', icon: '☀️', precipitation: 5 }
                        ],
                        unit: 'metric'
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Search Locations', path: '/weather/locations', method: 'GET',
                description: 'Search for locations by name. Supports ?q=San+Fran',
                responses: [
                    resp('Results', 200, [
                        { city: 'San Francisco', region: 'California', country: 'US', lat: 37.7749, lon: -122.4194 },
                        { city: 'San Fernando', region: 'La Union', country: 'PH', lat: 16.6159, lon: 120.3209 },
                        { city: 'San Fransisco de Macorís', region: 'Duarte', country: 'DO', lat: 19.3008, lon: -70.2517 }
                    ], { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 10. NOTIFICATIONS ────────────────────
    {
        id: 'notifications',
        name: 'Notifications API',
        description: 'In-app notifications with read/unread state and preferences',
        icon: '🔔',
        mocks: [
            {
                name: 'List Notifications', path: '/notifications', method: 'GET',
                description: 'Get the user\'s notifications. Supports ?unread=true&limit=20',
                responses: [
                    resp('Success', 200, {
                        unreadCount: 3,
                        data: [
                            { id: 'n_1', type: 'mention', title: 'New Mention', message: 'Jane Doe mentioned you in a comment', read: false, actionUrl: '/posts/post_1', createdAt: '2025-02-25T09:00:00Z' },
                            { id: 'n_2', type: 'system', title: 'System Update', message: 'MockBird v2.0 is now available with new features!', read: false, actionUrl: '/changelog', createdAt: '2025-02-24T20:00:00Z' },
                            { id: 'n_3', type: 'invite', title: 'Team Invitation', message: 'You\'ve been invited to join "Engineering" team', read: false, actionUrl: '/teams/invite/inv_abc', createdAt: '2025-02-24T15:00:00Z' },
                            { id: 'n_4', type: 'like', title: 'Post Liked', message: 'Alex Smith liked your post', read: true, actionUrl: '/posts/post_2', createdAt: '2025-02-24T12:00:00Z' }
                        ]
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Mark as Read', path: '/notifications/{id}/read', method: 'POST',
                description: 'Mark a single notification as read',
                responses: [
                    resp('Marked', 200, { id: 'n_1', read: true, readAt: '2025-02-25T10:00:00Z' }, { isDefault: true })
                ]
            },
            {
                name: 'Mark All Read', path: '/notifications/read-all', method: 'POST',
                description: 'Mark all notifications as read',
                responses: [
                    resp('Done', 200, { updatedCount: 3, unreadCount: 0 }, { isDefault: true })
                ]
            },
            {
                name: 'Get Preferences', path: '/notifications/preferences', method: 'GET',
                description: 'Get notification channel preferences',
                responses: [
                    resp('Success', 200, { email: { marketing: false, product: true, security: true }, push: { mentions: true, likes: false, comments: true, system: true }, inApp: { all: true } }, { isDefault: true })
                ]
            },
            {
                name: 'Update Preferences', path: '/notifications/preferences', method: 'PUT',
                description: 'Update notification preferences.\n\nExpected JSON Body:\n{\n  "email": { "marketing": true },\n  "push": { "likes": true }\n}', expectedBody: "{\n  \"email\": { \"marketing\": true },\n  \"push\": { \"likes\": true }\n}",
                responses: [
                    resp('Updated', 200, { message: 'Preferences updated successfully' }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 11. FILE UPLOAD / STORAGE ─────────────
    {
        id: 'files',
        name: 'File Storage API',
        description: 'Upload, list, download, and delete files with metadata',
        icon: '📁',
        mocks: [
            {
                name: 'List Files', path: '/files', method: 'GET',
                description: 'List uploaded files. Supports ?folder=documents&sort=created_desc',
                responses: [
                    resp('Success', 200, {
                        data: [
                            { id: 'f_1', name: 'project-spec.pdf', mimeType: 'application/pdf', size: 245760, folder: 'documents', url: 'https://cdn.example.com/files/project-spec.pdf', uploadedBy: 'us_1', createdAt: '2025-02-24T10:00:00Z' },
                            { id: 'f_2', name: 'logo.png', mimeType: 'image/png', size: 51200, folder: 'images', url: 'https://cdn.example.com/files/logo.png', thumbnailUrl: 'https://cdn.example.com/files/logo_thumb.png', uploadedBy: 'us_1', createdAt: '2025-02-23T14:00:00Z' },
                            { id: 'f_3', name: 'data-export.csv', mimeType: 'text/csv', size: 1048576, folder: 'exports', url: 'https://cdn.example.com/files/data-export.csv', uploadedBy: 'us_2', createdAt: '2025-02-22T09:00:00Z' }
                        ],
                        usage: { used: 1345536, limit: 104857600, percentage: 1.28 }
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Upload File', path: '/files/upload', method: 'POST',
                description: 'Upload a file (multipart/form-data).\n\nExpected form fields:\n- file: <binary>\n- folder: "documents"\n- description: "Optional description"', expectedBody: "- file: <binary>\n- folder: \"documents\"\n- description: \"Optional description\"",
                responses: [
                    resp('Uploaded', 201, { id: 'f_new', name: 'uploaded-file.pdf', mimeType: 'application/pdf', size: 128000, url: 'https://cdn.example.com/files/uploaded-file.pdf', folder: 'documents', createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true }),
                    resp('Too Large', 413, { error: 'FILE_TOO_LARGE', message: 'File exceeds the maximum size of 10MB' }, { weight: 0 })
                ]
            },
            {
                name: 'Delete File', path: '/files/{id}', method: 'DELETE',
                description: 'Delete a specific file by ID',
                responses: [
                    resp('Deleted', 200, { message: 'File deleted successfully' }, { isDefault: true })
                ]
            },
            {
                name: 'Get Signed URL', path: '/files/{id}/signed-url', method: 'GET',
                description: 'Get a temporary signed URL for downloading a private file',
                responses: [
                    resp('Success', 200, { url: 'https://cdn.example.com/files/project-spec.pdf?token=abc123&expires=1740500000', expiresAt: '2025-02-25T11:00:00Z' }, { isDefault: true })
                ]
            }
        ]
    },

    // ───────────────────────────────── 12. BOOKING / RESERVATIONS ────────────
    {
        id: 'booking',
        name: 'Booking & Reservations API',
        description: 'Availability, bookings, and scheduling for services or rooms',
        icon: '📅',
        mocks: [
            {
                name: 'Check Availability', path: '/availability', method: 'GET',
                description: 'Check available slots. Supports ?date=2025-03-01&serviceId=svc_1',
                responses: [
                    resp('Available', 200, {
                        date: '2025-03-01',
                        slots: [
                            { id: 'slot_1', startTime: '09:00', endTime: '10:00', available: true, price: 50.00 },
                            { id: 'slot_2', startTime: '10:00', endTime: '11:00', available: false, price: 50.00 },
                            { id: 'slot_3', startTime: '11:00', endTime: '12:00', available: true, price: 50.00 },
                            { id: 'slot_4', startTime: '14:00', endTime: '15:00', available: true, price: 75.00 },
                            { id: 'slot_5', startTime: '15:00', endTime: '16:00', available: true, price: 75.00 }
                        ]
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Create Booking', path: '/bookings', method: 'POST',
                description: 'Create a new booking.\n\nExpected JSON Body:\n{\n  "slotId": "slot_1",\n  "serviceId": "svc_1",\n  "date": "2025-03-01",\n  "customerName": "John Doe",\n  "customerEmail": "john@example.com",\n  "notes": "First-time visit"\n}', expectedBody: "{\n  \"slotId\": \"slot_1\",\n  \"serviceId\": \"svc_1\",\n  \"date\": \"2025-03-01\",\n  \"customerName\": \"John Doe\",\n  \"customerEmail\": \"john@example.com\",\n  \"notes\": \"First-time visit\"\n}",
                responses: [
                    resp('Booked', 201, { id: 'bk_abc', slotId: 'slot_1', date: '2025-03-01', startTime: '09:00', endTime: '10:00', status: 'confirmed', confirmationCode: 'CONF-7X8Y', customerName: 'John Doe', createdAt: '2025-02-25T10:00:00Z' }, { isDefault: true }),
                    resp('Slot Taken', 409, { error: 'SLOT_UNAVAILABLE', message: 'This time slot has already been booked' }, { conditions: [{ type: 'body', field: 'slotId', operator: 'equals', value: 'slot_2' }] })
                ]
            },
            {
                name: 'List Bookings', path: '/bookings', method: 'GET',
                description: 'List all bookings. Supports ?status=confirmed&from=2025-03-01',
                responses: [
                    resp('Success', 200, {
                        data: [
                            { id: 'bk_1', date: '2025-03-01', startTime: '09:00', endTime: '10:00', service: 'Consultation', status: 'confirmed', confirmationCode: 'CONF-7X8Y' },
                            { id: 'bk_2', date: '2025-03-05', startTime: '14:00', endTime: '15:00', service: 'Follow-up', status: 'pending', confirmationCode: 'CONF-9A0B' }
                        ]
                    }, { isDefault: true })
                ]
            },
            {
                name: 'Cancel Booking', path: '/bookings/{id}/cancel', method: 'POST',
                description: 'Cancel a booking.\n\nExpected JSON Body:\n{\n  "reason": "Schedule conflict"\n}', expectedBody: "{\n  \"reason\": \"Schedule conflict\"\n}",
                responses: [
                    resp('Cancelled', 200, { id: 'bk_1', status: 'cancelled', reason: 'Schedule conflict', refundAmount: 50.00, cancelledAt: '2025-02-25T12:00:00Z' }, { isDefault: true })
                ]
            }
        ]
    }
];

// ── ROUTES ─────────────────────────────────────────────────────────────────

// GET /templates
router.get('/', (req, res) => {
    const list = TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        endpointCount: t.mocks.length
    }));
    res.status(200).json({ data: list });
});

// GET /templates/:id — full preview
router.get('/:id', (req, res) => {
    const { id } = req.params;
    const template = TEMPLATES.find(t => t.id === id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.status(200).json({ data: template });
});

// POST /templates/:id/apply
router.post('/:id/apply', async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, projectName } = req.body;

        if (!projectId && !projectName) {
            return res.status(400).json({ error: 'Either projectId or projectName must be provided' });
        }

        const template = TEMPLATES.find(t => t.id === id);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        const auth = getAuth(req);
        let targetProjectId = projectId;
        const now = new Date().toISOString();

        if (projectId) {
            const { scopeWhere, scopeValues } = getScope(auth);
            const projectCheck = await turso.execute(
                `SELECT project_id FROM projects WHERE project_id = ? AND (${scopeWhere})`,
                [projectId, ...scopeValues]
            );
            if (projectCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Project not found or you do not have permission' });
            }
        } else if (projectName) {
            targetProjectId = uuidv4();
            const slug = await uniqueSlug(generateSlug(projectName));
            await turso.execute(
                `INSERT INTO projects (project_id, name, description, slug, user_id, org_id, is_public, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [targetProjectId, projectName, `Created from '${template.name}' template`, slug, auth.userId, auth.orgId || null, 0, now, now]
            );
        }

        const createdMocks = [];

        for (const mockData of template.mocks) {
            const mockId = uuidv4();
            await turso.execute(
                `INSERT INTO mocks (mock_id, project_id, name, path, method, description, expected_body, expected_headers, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    mockId,
                    targetProjectId,
                    mockData.name,
                    mockData.path,
                    mockData.method,
                    mockData.description || '',
                    mockData.expectedBody || '',
                    mockData.expectedHeaders || '{}',
                    now,
                    now
                ]
            );

            for (const respData of mockData.responses) {
                const responseId = uuidv4();
                const conditionsStr = respData.conditions ? JSON.stringify(respData.conditions) : '[]';
                await turso.execute(
                    `INSERT INTO mock_responses (response_id, mock_id, name, status_code, headers, body, is_default, weight, conditions, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [responseId, mockId, respData.name, respData.statusCode, respData.headers || '{}', respData.body || '', respData.isDefault ? 1 : 0, respData.weight ?? 100, conditionsStr, now]
                );
            }

            createdMocks.push({ id: mockId, name: mockData.name, path: mockData.path, method: mockData.method });
        }

        // If we created a new project, fetch it to return to the client
        let project = null;
        if (projectName) {
            const projResult = await turso.execute('SELECT * FROM projects WHERE project_id = ?', [targetProjectId]);
            project = projResult.rows[0] || null;
        }

        res.status(201).json({
            message: `Template '${template.name}' applied successfully`,
            projectId: targetProjectId,
            project,
            appliedMocks: createdMocks.length,
            mocks: createdMocks
        });
    } catch (error) {
        console.error('Apply template error:', error);
        res.status(500).json({ error: 'Failed to apply template' });
    }
});

module.exports = router;
