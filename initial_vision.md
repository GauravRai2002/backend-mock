Initial Roadmap
API Response Mocker & Tester - Complete Technical Documentation
Table of Contents
	•	Product Overview
	•	Technical Architecture
	•	Database Schema
	•	API Endpoints
	•	Frontend Components
	•	Authentication & Security
	•	Payment Integration
	•	Deployment & DevOps
	•	Development Roadmap
	•	Chat Context

1. Product Overview
Core Features
Free Tier Features
	•	Create up to 3 mock endpoints
	•	1,000 requests/month
	•	Basic response types (JSON, XML, Plain Text)
	•	Response delays (0-10 seconds)
	•	7-day request logs
	•	Public/Private endpoints
	•	CORS enabled
	•	Basic response templates
Pro Tier Features ($9/month)
	•	50 mock endpoints
	•	100,000 requests/month
	•	Custom response headers
	•	Conditional responses based on request data
	•	30-day request logs
	•	Custom subdomains
	•	Import/Export mocks
	•	JavaScript response transformations
	•	Webhook forwarding
Team Tier Features ($29/month)
	•	Unlimited endpoints
	•	1,000,000 requests/month
	•	Team collaboration
	•	SSO/SAML integration
	•	90-day request logs
	•	API access
	•	Priority support
	•	SLA guarantee

2. Technical Architecture
Tech Stack
Frontend:
- Framework: Next.js 14 (App Router)
- UI Library: Tailwind CSS + shadcn/ui
- State Management: Zustand
- Code Editor: Monaco Editor
- API Client: Axios with React Query
- Form Handling: React Hook Form + Zod
- Authentication: NextAuth.js

Backend:
- Runtime: Node.js 20.x
- Framework: Express.js / Fastify
- Database: PostgreSQL 15
- Cache: Redis 7
- Queue: BullMQ
- File Storage: AWS S3 / Cloudflare R2

Infrastructure:
- Hosting: Vercel (Frontend) + Railway/Fly.io (Backend)
- CDN: Cloudflare
- Monitoring: Sentry + Datadog
- Analytics: Plausible / Umami

System Architecture
graph TD
    A[CloudFlare CDN] --> B[Next.js Frontend]
    B --> C[API Gateway]
    C --> D[Auth Service]
    C --> E[Mock Service]
    C --> F[Analytics Service]
    E --> G[PostgreSQL]
    E --> H[Redis Cache]
    F --> I[ClickHouse/TimescaleDB]
    E --> J[Mock Endpoint Router]
    J --> K[Response Handler]


3. Database Schema
PostgreSQL Tables
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    avatar_url VARCHAR(500),
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    owner_id UUID REFERENCES users(id),
    subscription_tier VARCHAR(50) DEFAULT 'team',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE team_members (
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);

-- Projects (Mock collections)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    is_public BOOLEAN DEFAULT false,
    custom_domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mock endpoints
CREATE TABLE mocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    method VARCHAR(10) DEFAULT 'GET',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    response_type VARCHAR(50) DEFAULT 'json',
    response_delay_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, path, method)
);

-- Mock responses
CREATE TABLE mock_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_id UUID REFERENCES mocks(id) ON DELETE CASCADE,
    name VARCHAR(255),
    status_code INTEGER DEFAULT 200,
    headers JSONB DEFAULT '{}',
    body TEXT,
    conditions JSONB DEFAULT '[]',
    weight INTEGER DEFAULT 100, -- for random responses
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Request logs
CREATE TABLE request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_id UUID REFERENCES mocks(id) ON DELETE CASCADE,
    request_path VARCHAR(1000),
    request_method VARCHAR(10),
    request_headers JSONB,
    request_body TEXT,
    request_query JSONB,
    response_id UUID REFERENCES mock_responses(id),
    response_status INTEGER,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    name VARCHAR(255),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Usage tracking
CREATE TABLE usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    month DATE NOT NULL,
    endpoint_count INTEGER DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    bandwidth_bytes BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id, month)
);

Redis Structure
// Cache keys structure
{
  // Mock endpoint cache
  "mock:{projectId}:{path}:{method}": {
    responses: [...],
    config: {...},
    ttl: 3600
  },
  
  // Rate limiting
  "rate:{userId}:{endpoint}": count,
  
  // Session storage
  "session:{sessionId}": userData,
  
  // Real-time analytics
  "analytics:{mockId}:{date}": {
    requests: count,
    errors: count,
    avgResponseTime: ms
  }
}


4. API Endpoints
Authentication Endpoints
// POST /api/auth/register
{
  email: string,
  password: string,
  name: string
}

// POST /api/auth/login
{
  email: string,
  password: string
}

// POST /api/auth/logout
// GET /api/auth/me
// POST /api/auth/refresh
// POST /api/auth/forgot-password
// POST /api/auth/reset-password

Project Management
// GET /api/projects
// POST /api/projects
{
  name: string,
  description?: string,
  isPublic: boolean
}

// GET /api/projects/:id
// PUT /api/projects/:id
// DELETE /api/projects/:id

// POST /api/projects/:id/duplicate
// POST /api/projects/:id/export
// POST /api/projects/import

Mock Endpoints
// GET /api/projects/:projectId/mocks
// POST /api/projects/:projectId/mocks
{
  name: string,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  description?: string,
  responseType: 'json' | 'xml' | 'text' | 'html',
  responseDelay?: number
}

// GET /api/mocks/:id
// PUT /api/mocks/:id
// DELETE /api/mocks/:id

// POST /api/mocks/:id/responses
{
  name?: string,
  statusCode: number,
  headers: Record<string, string>,
  body: string,
  conditions?: Array<{
    type: 'header' | 'query' | 'body' | 'path',
    field: string,
    operator: 'equals' | 'contains' | 'regex',
    value: string
  }>,
  weight?: number,
  isDefault?: boolean
}

// GET /api/mocks/:id/responses
// PUT /api/mocks/:id/responses/:responseId
// DELETE /api/mocks/:id/responses/:responseId

Mock Execution
// This is the actual mock endpoint that users hit
// {method} /m/:projectSlug/*path
// Examples:
// GET /m/my-project/api/users
// POST /m/my-project/api/users
// GET /m/abc123/products?category=electronics

Analytics & Logs
// GET /api/mocks/:id/logs
{
  page?: number,
  limit?: number,
  startDate?: string,
  endDate?: string
}

// GET /api/mocks/:id/analytics
{
  period: 'hour' | 'day' | 'week' | 'month'
}

// GET /api/projects/:id/analytics
// GET /api/usage

Billing
// POST /api/billing/create-checkout
{
  tier: 'pro' | 'team',
  period: 'monthly' | 'yearly'
}

// POST /api/billing/cancel
// GET /api/billing/invoices
// POST /api/billing/update-payment


5. Frontend Components
Component Structure
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── forgot-password/
│   ├── (dashboard)/
│   │   ├── projects/
│   │   ├── mocks/
│   │   ├── analytics/
│   │   ├── settings/
│   │   └── billing/
│   └── m/[...path]/      # Mock endpoint handler
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/
│   │   ├── ProjectCard.tsx
│   │   ├── MockList.tsx
│   │   ├── ResponseEditor.tsx
│   │   ├── RequestLogger.tsx
│   │   └── UsageChart.tsx
│   ├── editor/
│   │   ├── JsonEditor.tsx
│   │   ├── HeadersEditor.tsx
│   │   ├── ConditionsBuilder.tsx
│   │   └── ResponsePreview.tsx
│   └── common/
│       ├── Layout.tsx
│       ├── Navigation.tsx
│       └── Footer.tsx
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── utils.ts
│   └── validators.ts
└── hooks/
    ├── useAuth.ts
    ├── useProjects.ts
    ├── useMocks.ts
    └── useAnalytics.ts

Key Component Implementations
Response Editor Component
// components/editor/ResponseEditor.tsx
import { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

interface ResponseEditorProps {
  mockId: string;
  onSave: (response: MockResponse) => void;
}

export function ResponseEditor({ mockId, onSave }: ResponseEditorProps) {
  const [response, setResponse] = useState<MockResponse>({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{\n  "message": "Hello World"\n}',
    conditions: []
  });

  return (
    <Card className="p-6">
      <Tabs defaultValue="body">
        <TabsList>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="body">
          <MonacoEditor
            height="400px"
            language="json"
            value={response.body}
            onChange={(value) => setResponse({ ...response, body: value || '' })}
            options={{
              minimap: { enabled: false },
              fontSize: 14
            }}
          />
        </TabsContent>
        
        <TabsContent value="headers">
          <HeadersEditor 
            headers={response.headers}
            onChange={(headers) => setResponse({ ...response, headers })}
          />
        </TabsContent>
        
        <TabsContent value="conditions">
          <ConditionsBuilder
            conditions={response.conditions}
            onChange={(conditions) => setResponse({ ...response, conditions })}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
6. Authentication & Security
Authentication Implementation
NextAuth.js Configuration
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });
        
        if (!user || !await bcrypt.compare(credentials.password, user.passwordHash)) {
          return null;
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier
        };
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.subscriptionTier = user.subscriptionTier;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.subscriptionTier = token.subscriptionTier;
        session.user.id = token.userId;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

API Key Authentication
// lib/auth/apiKey.ts
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export async function generateApiKey(userId: string, name: string) {
  const key = `mk_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    }
  });
  
  return key; // Return unhashed key only once
}

export async function validateApiKey(key: string) {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true }
  });
  
  if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    return null;
  }
  
  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });
  
  return apiKey.user;
}

Security Middleware
// middleware/security.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { validateApiKey } from '@/lib/auth/apiKey';
import { rateLimit } from '@/lib/rateLimit';

export async function securityMiddleware(req: NextRequest) {
  // CORS headers for mock endpoints
  if (req.nextUrl.pathname.startsWith('/m/')) {
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', '*');
    
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: response.headers });
    }
    
    return response;
  }
  
  // API authentication
  if (req.nextUrl.pathname.startsWith('/api/')) {
    // Check for API key
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      const user = await validateApiKey(apiKey);
      if (!user) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
      // Add user to request
      req.headers.set('x-user-id', user.id);
      req.headers.set('x-subscription-tier', user.subscriptionTier);
    } else {
      // Check for session token
      const token = await getToken({ req });
      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      req.headers.set('x-user-id', token.userId);
      req.headers.set('x-subscription-tier', token.subscriptionTier);
    }
  }
  
  return NextResponse.next();
}

Rate Limiting
// lib/rateLimit.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS
// lib/rateLimit.ts (continued)
  token: process.env.UPSTASH_REDIS_TOKEN!
});

interface RateLimitConfig {
  free: { requests: number; window: number };
  pro: { requests: number; window: number };
  team: { requests: number; window: number };
}

const RATE_LIMITS: RateLimitConfig = {
  free: { requests: 1000, window: 30 * 24 * 60 * 60 }, // 1000 per month
  pro: { requests: 100000, window: 30 * 24 * 60 * 60 }, // 100k per month
  team: { requests: 1000000, window: 30 * 24 * 60 * 60 } // 1M per month
};

export async function checkRateLimit(userId: string, tier: string = 'free') {
  const key = `rate_limit:${userId}:${new Date().getMonth()}`;
  const limit = RATE_LIMITS[tier as keyof RateLimitConfig];
  
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, limit.window);
  }
  
  if (current > limit.requests) {
    return {
      allowed: false,
      limit: limit.requests,
      remaining: 0,
      reset: await redis.ttl(key)
    };
  }
  
  return {
    allowed: true,
    limit: limit.requests,
    remaining: limit.requests - current,
    reset: await redis.ttl(key)
  };
}

// Per-endpoint rate limiting for DDoS protection
export async function checkEndpointRateLimit(
  identifier: string, 
  endpoint: string,
  limit: number = 100,
  window: number = 60
) {
  const key = `endpoint_rate:${identifier}:${endpoint}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, window);
  }
  
  return current <= limit;
}

Input Validation & Sanitization
// lib/validators.ts
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Mock creation schema
export const createMockSchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string()
    .min(1)
    .max(500)
    .regex(/^\/[a-zA-Z0-9\-\/_{}:]*$/, 'Invalid path format'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  description: z.string().max(1000).optional(),
  responseType: z.enum(['json', 'xml', 'text', 'html']),
  responseDelay: z.number().min(0).max(10000).default(0)
});

// Response schema
export const mockResponseSchema = z.object({
  name: z.string().max(255).optional(),
  statusCode: z.number().min(100).max(599),
  headers: z.record(z.string()),
  body: z.string().max(1048576), // 1MB limit
  conditions: z.array(z.object({
    type: z.enum(['header', 'query', 'body', 'path']),
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'regex', 'exists']),
    value: z.string()
  })).optional(),
  weight: z.number().min(0).max(100).optional(),
  isDefault: z.boolean().optional()
});

// Sanitize HTML responses
export function sanitizeHtmlResponse(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                   'ul', 'ol', 'li', 'a', 'img', 'table', 'tr', 'td', 'th'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'style']
  });
}

// SQL injection prevention for dynamic queries
export function sanitizeSqlIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}


7. Payment Integration
Stripe Integration
// lib/stripe/config.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

export const PRODUCTS = {
  pro_monthly: {
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
    name: 'Pro Monthly',
    price: 900, // $9.00
    features: ['50 endpoints', '100k requests/month', '30-day logs']
  },
  pro_yearly: {
    priceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
    name: 'Pro Yearly',
    price: 9000, // $90.00
    features: ['50 endpoints', '100k requests/month', '30-day logs', '2 months free']
  },
  team_monthly: {
    priceId: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!,
    name: 'Team Monthly',
    price: 2900, // $29.00
    features: ['Unlimited endpoints', '1M requests/month', '90-day logs', 'Team collaboration']
  },
  team_yearly: {
    priceId: process.env.STRIPE_TEAM_YEARLY_PRICE_ID!,
    name: 'Team Yearly',
    price: 29000, // $290.00
    features: ['Unlimited endpoints', '1M requests/month', '90-day logs', 'Team collaboration', '2 months free']
  }
};

Checkout & Subscription Management
// app/api/billing/create-checkout/route.ts
import { stripe, PRODUCTS } from '@/lib/stripe/config';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { productKey, successUrl, cancelUrl } = await req.json();
  const product = PRODUCTS[productKey as keyof typeof PRODUCTS];
  
  if (!product) {
    return new Response('Invalid product', { status: 400 });
  }

  try {
    // Get or create Stripe customer
    let customerId = session.user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: {
          userId: session.user.id
        }
      });
      customerId = customer.id;
      
      // Save customer ID to database
      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId }
      });
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: product.priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl || `${process.env.NEXT_PUBLIC_URL}/dashboard?success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_URL}/pricing`,
      metadata: {
        userId: session.user.id,
        productKey
      }
    });

    return Response.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return new Response('Failed to create checkout session', { status: 500 });
  }
}

Webhook Handler
// app/api/billing/webhook/route.ts
import { stripe } from '@/lib/stripe/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(subscription);
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCancelled(subscription);
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
  }

  return new Response('Webhook processed', { status: 200 });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  const tier = getTierFromPriceId(subscription.items.data[0].price.id);

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      stripeSubscriptionId: subscription.id,
      subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000)
    }
  });

  // Send welcome email
  await sendEmail({
    to: session.customer_email!,
    subject: 'Welcome to MockAPI Pro!',
    template: 'subscription-welcome',
    data: { tier }
  });
}

function getTierFromPriceId(priceId: string): string {
  for (const [key, product] of Object.entries(PRODUCTS)) {
    if (product.priceId === priceId) {
      return key.includes('team') ? 'team' : 'pro';
    }
  }
  return 'free';
}

Usage Tracking & Billing Enforcement
// lib/usage.ts
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';

export async function trackUsage(userId: string, type: 'endpoint' | 'request' | 'bandwidth', amount: number = 1) {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  
  await prisma.usageStats.upsert({
    where: {
      userId_month: {
        userId,
        month
      }
    },
    update: {
      [type === 'endpoint' ? 'endpointCount' : 
       type === 'request' ? 'requestCount' : 'bandwidthBytes']: {
        increment: amount
      },
      updatedAt: now
    },
    create: {
      userId,
      month,
      [type === 'endpoint' ? 'endpointCount' : 
       type === 'request' ? 'requestCount' : 'bandwidthBytes']: amount
    }
  });
}

export async function checkUsageLimits(userId: string, tier: string): Promise<{
  canCreateEndpoint: boolean;
  canMakeRequest: boolean;
  limits: any;
}> {
  const usage = await getCurrentUsage(userId);
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
  
  const rateLimit = await checkRateLimit(userId, tier);
  
  return {
    canCreateEndpoint: usage.endpointCount < limits.endpoints,
    canMakeRequest: rateLimit.allowed,
    limits: {
      endpoints: { used: usage.endpointCount, limit: limits.endpoints },
      requests: { used: limits.requests - rateLimit.remaining, limit: limits.requests },
      bandwidth: { used: usage.bandwidthBytes, limit: limits.bandwidth }
    }
  };
}

const TIER_LIMITS = {
  free: { endpoints: 3, requests: 1000, bandwidth: 100 * 1024 * 1024 }, // 100MB
  pro: { endpoints: 50, requests: 100000, bandwidth: 10 * 1024 * 1024 * 1024 }, // 10GB
  team: { endpoints: -1, requests: 1000000, bandwidth: 100 * 1024 * 1024 * 1024 } // 100GB
};


8. Deployment & DevOps
Docker Configuration
# Dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]




9. Development Roadmap
Phase 1: MVP Development (Weeks 1-4)
Week 1: Foundation & Setup
**Day 1-2: Project Setup**
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Tailwind CSS and shadcn/ui
- [ ] Configure ESLint, Prettier, and Husky
- [ ] Set up PostgreSQL and Redis (local/cloud)
- [ ] Initialize Prisma and create initial schema
- [ ] Set up GitHub repository and CI/CD pipeline

**Day 3-4: Authentication**
- [ ] Implement NextAuth.js with credentials provider
- [ ] Create login/register pages
- [ ] Set up password hashing with bcrypt
- [ ] Implement session management
- [ ] Create protected route middleware

**Day 5-7: Core Database Models**
- [ ] Create and test all Prisma models
- [ ] Set up database migrations
- [ ] Implement basic CRUD operations
- [ ] Create seed data for testing
- [ ] Set up database backup strategy

Week 2: Core Mock Functionality
**Day 8-10: Mock Creation**
- [ ] Build mock creation UI
- [ ] Implement JSON editor with Monaco
- [ ] Create mock endpoint router
- [ ] Build response handler logic
- [ ] Test basic mock endpoints

**Day 11-12: Response Management**
- [ ] Multiple response support
- [ ] Response conditions builder
- [ ] Headers editor
- [ ] Status code selector
- [ ] Response preview

**Day 13-14: Mock Execution Engine**
- [ ] Dynamic route handling (/m/:project/*)
- [ ] Request parsing and validation
- [ ] Condition evaluation logic
- [ ] Response selection algorithm
- [ ] CORS handling

Week 3: Advanced Features
**Day 15-16: Request Logging**
- [ ] Implement request capture
- [ ] Build request log viewer
- [ ] Add filtering and search
- [ ] Export functionality
- [ ] Log retention policies

**Day 17-18: Dashboard & Analytics**
- [ ] Create project dashboard
- [ ] Usage statistics display
- [ ] Basic analytics charts
- [ ] Performance metrics
- [ ] Error tracking

**Day 19-21: User Experience**
- [ ] Response templates library
- [ ] Import/Export functionality
- [ ] Keyboard shortcuts
- [ ] Quick actions menu
- [ ] Onboarding flow

Week 4: Payment & Launch Prep
**Day 22-23: Stripe Integration**
- [ ] Set up Stripe account and products
- [ ] Implement checkout flow
- [ ] Webhook handlers
- [ ] Subscription management UI
- [ ] Usage limit enforcement

**Day 24-25: Testing & Bug Fixes**
- [ ] End-to-end testing
- [ ] Load testing mock endpoints
- [ ] Security audit
- [ ] Performance optimization
- [ ] Bug fixes from testing

**Day 26-28: Deployment**
- [ ] Set up production environment
- [ ] Configure domain and SSL
- [ ] Deploy to Vercel/Railway
- [ ] Set up monitoring (Sentry)
- [ ] Create documentation site

Phase 2: Growth Features (Weeks 5-8)
Week 5-6: Enhanced Features
**API & Integrations**
- [ ] REST API for all operations
- [ ] API key management
- [ ] OpenAPI/Swagger import
- [ ] Postman collection import
- [ ] GraphQL mock support
- [ ] Webhook forwarding

**Collaboration Features**
- [ ] Team workspaces
- [ ] Sharing and permissions
- [ ] Comments on mocks
- [ ] Version history
- [ ] Change notifications

Week 7-8: Advanced Capabilities
**Dynamic Responses**
- [ ] JavaScript execution in responses
- [ ] Faker.js integration
- [ ] Dynamic timestamps
- [ ] Request data interpolation
- [ ] Custom response scripts

**Developer Experience**
- [ ] CLI tool development
- [ ] VS Code extension
- [ ] Browser extension
- [ ] Mock marketplace
- [ ] Community templates

Phase 3: Scale & Optimize (Weeks 9-12)
Week 9-10: Performance & Reliability
**Infrastructure**
- [ ] Multi-region deployment
- [ ] CDN integration
- [ ] Database read replicas
- [ ] Redis clustering
- [ ] Auto-scaling setup

**Performance**
- [ ] Response caching strategy
- [ ] Query optimization
- [ ] Lazy loading implementation
- [ ] Image optimization
- [ ] Bundle size reduction

Week 11-12: Enterprise Features
**Security & Compliance**
- [ ] SSO implementation (SAML/OIDC)
- [ ] Audit logs
- [ ] Data encryption at rest
- [ ] GDPR compliance tools
- [ ] SOC 2 preparation

**Enterprise Tools**
- [ ] Advanced analytics dashboard
- [ ] Custom domain support
- [ ] SLA monitoring
- [ ] Priority support system
- [ ] White-label options

Technical Milestones & Success Metrics
MVP Success Criteria
Performance:
  - Mock endpoint response time: < 50ms (p95)
  - Dashboard load time: < 2s
  - API response time: < 200ms (p95)
  
Reliability:
  - Uptime: 99.9%
  - Error rate: < 0.1%
  - Data loss: 0%

User Experience:
  - Time to first mock: < 2 minutes
  - Documentation coverage: 100%
  - Mobile responsive: Yes

Growth Metrics to Track
Week 1-4 (MVP):
  - Sign-ups: 100 users
  - Active mocks: 500
  - Daily requests: 10,000

Month 2-3:
  - Sign-ups: 1,000 users
  - Paid conversions: 5%
  - Daily requests: 100,000
  - MRR: $500

Month 4-6:
  - Sign-ups: 5,000 users
  - Paid conversions: 8%
  - Daily requests: 1,000,000
  - MRR: $3,000

Development Best Practices
Code Quality Standards
// Pre-commit hooks (.husky/pre-commit)
#!/bin/sh
npm run lint
npm run type-check
npm run test:unit

// Code review checklist
- [ ] TypeScript types properly defined
- [ ] Error handling implemented
- [ ] Unit tests written
- [ ] Documentation updated
- [ ] Performance impact considered
- [ ] Security implications reviewed

Monitoring & Logging
// lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';
import { Analytics } from '@vercel/analytics/react';

// Error tracking
export function logError(error: Error, context?: any) {
  console.error(error);
  Sentry.captureException(error, { extra: context });
}

// Performance monitoring
export function trackPerformance(metric: string, value: number) {
  if (typeof window !== 'undefined') {
    window.gtag?.('event', 'timing_complete', {
      name: metric,
      value: Math.round(value)
    });
  }
}

// Feature usage tracking
export function trackFeatureUsage(feature: string, properties?: any) {
  Analytics.track(feature, properties);
}

Launch Checklist
Pre-Launch (Week 4)
	•	 Legal documents (Terms, Privacy Policy)
	•	 Payment processing tested
	•	 Email templates created
	•	 Support system setup
	•	 Monitoring alerts configured
	•	 Backup system verified
	•	 Security scan completed
	•	 Load testing passed
Launch Day
	•	 ProductHunt submission prepared
	•	 HackerNews post drafted
	•	 Twitter announcement ready
	•	 Dev.to article written
	•	 Reddit posts planned
	•	 Email to beta testers
	•	 Support team briefed
	•	 Monitoring dashboard open
Post-Launch (Week 5+)
	•	 Gather user feedback
	•	 Fix critical bugs
	•	 Optimize based on metrics
	•	 Plan next features
	•	 Start content marketing
	•	 Build community
	•	 Iterate on pricing
	•	 Scale infrastructure
Risk Mitigation
Technical Risks
Database Overload:
  - Mitigation: Read replicas, caching, rate limiting
  
Mock Endpoint Abuse:
  - Mitigation: Rate limiting, usage monitoring, anomaly detection
  
Data Loss:
  - Mitigation: Daily backups, point-in-time recovery, multi-region storage

Security Breach:
  - Mitigation: Regular audits, penetration testing, bug bounty program

Business Risks
Low Conversion:
  - Mitigation: A/B testing, user interviews, pricing experiments
  
Competitor Launch:
  - Mitigation: Fast iteration, unique features, community building
  
Scaling Issues:
  - Mitigation: Architecture planning, gradual rollout, monitoring

This comprehensive roadmap provides a clear path from MVP to a scalable SaaS product. The key is to start with core functionality, validate with users, and iterate quickly based on feedback while maintaining high code quality and system reliability.










Implementation Details
Core Functionality Implementation Guide
1. Mock Endpoint Routing System
Dynamic Path Matching Architecture
The core challenge is creating a system that can handle arbitrary URL patterns while maintaining high performance. Here's how to implement this:
URL Pattern Storage Strategy:
	•	Store mock paths with parameterized segments (e.g., /users/{id}/posts/{postId})
	•	Convert these patterns into regular expressions at creation time for faster matching
	•	Build a trie (prefix tree) data structure in memory for efficient path lookups
	•	Cache the trie in Redis with automatic invalidation on mock updates
Request Routing Flow:
	•	Incoming request hits /m/[projectSlug]/[...dynamicPath]
	•	Extract project slug and remaining path segments
	•	Load project's mock configuration from cache (fallback to database)
	•	Traverse the trie to find matching patterns
	•	If multiple matches exist, prioritize exact matches over parameterized ones
	•	Extract path parameters and make them available to the response handler
Performance Optimization:
	•	Implement a two-tier caching strategy: in-memory LRU cache for hot paths, Redis for warm paths
	•	Use database indexes on (project_id, path, method) combination
	•	Lazy-load mock configurations only when needed
	•	Pre-compile path patterns into efficient matching functions
2. Response Selection Engine
Conditional Response Logic
The response selection engine needs to evaluate multiple conditions and select the appropriate response:
Condition Evaluation System:
	•	Build a rule engine that processes conditions in a specific order
	•	Support multiple condition types: headers, query parameters, request body, path parameters
	•	Implement operators: equals, contains, regex match, exists, greater than, less than
	•	Create a scoring system where each matched condition adds weight
Response Selection Algorithm:
	•	Gather all active responses for the matched mock
	•	Evaluate conditions for each response against the incoming request
	•	Filter responses where all conditions pass
	•	If multiple responses qualify:
	•	Check if any is marked as default
	•	Use weighted random selection based on configured weights
	•	Fall back to first created if no weights defined
	•	If no responses qualify, return the default response or 404
Dynamic Value Injection:
	•	Parse response body for template variables (e.g., {{request.userId}})
	•	Build a context object with request data, timestamps, random values
	•	Use a safe template engine that prevents code injection
	•	Support nested object access (e.g., {{request.body.user.name}})
3. Request Logging and Analytics
High-Performance Logging Architecture
Logging every request without impacting performance requires careful design:
Asynchronous Logging Pipeline:
	•	Incoming requests are tagged with a unique ID
	•	Essential data is extracted and pushed to a message queue (Redis pub/sub or BullMQ)
	•	Response is sent immediately without waiting for logging
	•	Background workers consume the queue and write to database in batches
	•	Implement circuit breakers to prevent logging from affecting main service
Data Retention Strategy:
	•	Partition log tables by month for efficient querying and deletion
	•	Implement automatic archival based on subscription tier
	•	Store detailed logs in hot storage, summaries in warm storage
	•	Use time-series database for aggregated metrics
Real-time Analytics Processing:
	•	Maintain rolling counters in Redis for live statistics
	•	Aggregate data at multiple levels: minute, hour, day
	•	Pre-calculate common queries (total requests, error rates, response times)
	•	Use HyperLogLog for unique visitor counting with minimal memory
4. State Management and Caching
Multi-Layer Caching Strategy
Cache Hierarchy:
	•	Browser Cache: Static assets with long TTL
	•	CDN Cache: Public mock responses with cache headers
	•	Application Memory: Hot configuration data (Node.js LRU cache)
	•	Redis Cache: User sessions, mock configs, rate limits
	•	Database: Source of truth for all data
Cache Invalidation Pattern:
	•	Implement event-driven invalidation using pub/sub
	•	When mock is updated, publish invalidation event
	•	All app instances subscribe and clear relevant caches
	•	Use cache tags for granular invalidation
	•	Implement cache warming for frequently accessed mocks
Session Management:
	•	Use Redis for session storage with sliding expiration
	•	Implement session fingerprinting for security
	•	Store minimal data in sessions, lazy-load from database
	•	Support multiple active sessions per user
5. Performance Optimization Techniques
Response Time Optimization
Mock Response Delivery:
	•	Pre-serialize JSON responses to avoid parsing overhead
	•	Use streaming for large responses
	•	Implement response compression (gzip/brotli) based on Accept-Encoding
	•	Cache computed responses with ETags for conditional requests
Database Query Optimization:
	•	Use prepared statements for all queries
	•	Implement query result caching with smart invalidation
	•	Batch similar queries when possible
	•	Use database connection pooling with optimal pool sizes
	•	Implement read replicas for analytics queries
Concurrent Request Handling:
	•	Use Node.js cluster mode to utilize all CPU cores
	•	Implement request queuing with backpressure
	•	Set appropriate timeouts for all external calls
	•	Use circuit breakers for external dependencies
6. Security Implementation
Request Validation and Sanitization
Input Security:
	•	Validate all inputs against predefined schemas before processing
	•	Implement request size limits at multiple levels (nginx, application)
	•	Sanitize user-generated content based on response type
	•	Use parameterized queries exclusively
	•	Implement SQL query timeout limits
Authentication Flow:
	•	Implement JWT tokens with short expiration and refresh tokens
	•	Store sensitive session data server-side, only session ID in JWT
	•	Use secure, httpOnly, sameSite cookies for web clients
	•	Implement device fingerprinting for anomaly detection
	•	Support multiple authentication methods with proper abstraction
Rate Limiting Implementation:
	•	Implement sliding window rate limiting using Redis sorted sets
	•	Different limits for authenticated vs anonymous users
	•	Implement progressive rate limiting (gradually increasing delays)
	•	Geographic-based rate limiting for suspicious regions
	•	Bypass mechanisms for legitimate high-volume users
7. Scalability Architecture
Horizontal Scaling Strategy
Application Architecture:
	•	Design stateless application servers
	•	Use Redis for all shared state
	•	Implement service discovery for dynamic scaling
	•	Use load balancer health checks with proper endpoints
	•	Design for eventual consistency where appropriate
Database Scaling:
	•	Implement read/write splitting with multiple read replicas
	•	Use database connection pooling with circuit breakers
	•	Partition large tables by natural boundaries (user_id, date)
	•	Implement database query caching layer
	•	Plan for sharding strategy based on project growth
Mock Endpoint Scaling:
	•	Deploy mock handlers to edge locations using Cloudflare Workers or similar
	•	Cache mock configurations at edge for faster responses
	•	Implement geographic routing for lowest latency
	•	Use anycast IPs for global load distribution
8. Monitoring and Observability
Comprehensive Monitoring Stack
Application Monitoring:
	•	Instrument all critical paths with performance metrics
	•	Track business metrics alongside technical metrics
	•	Implement custom dashboards for different stakeholders
	•	Set up intelligent alerting with proper thresholds
	•	Use distributed tracing for request flow analysis
Error Tracking:
	•	Capture errors with full context (user, request, state)
	•	Group similar errors for easier debugging
	•	Implement error budgets for reliability targets
	•	Track error rates by feature and user segment
	•	Automatic error report generation for post-mortems
Usage Analytics:
	•	Track feature adoption rates
	•	Monitor user journey through the application
	•	Implement funnel analysis for conversion optimization
	•	Track API usage patterns for capacity planning
	•	Generate automated reports for business metrics
This implementation guide provides the architectural decisions and patterns needed to build a robust, scalable API mocking service. The key is to start simple with the MVP features and gradually add complexity as usage grows, always keeping performance and user experience as top priorities.

Basic workflow
How Users Actually Use the Mock API Service
The Core User Flow - Simplified
What Users Do:
Step 1: User Creates a Mock Endpoint
User thinks: "I need a fake API endpoint that returns a list of users"
User action: 
- Creates a new mock at path: /api/users
- Sets it to return JSON data they define

Step 2: User Defines the Response
User enters this JSON response:
{
  "users": [
    {"id": 1, "name": "John Doe", "email": "john@example.com"},
    {"id": 2, "name": "Jane Smith", "email": "jane@example.com"}
  ],
  "total": 2
}

Step 3: User Gets an Instant URL
System generates: https://yourdomain.com/m/johns-project/api/users

Step 4: Anyone Hits That URL
When ANYONE makes a GET request to that URL, they receive the JSON data the user defined
No backend needed, no server setup, just instant API response

Real-World Use Cases
Use Case 1: Frontend Developer Building a Dashboard
Scenario: Sarah is building a React dashboard but the backend team hasn't built the API yet.
What she does:
	•	Creates mock endpoint: /api/dashboard/stats
	•	Defines response:
{
  "revenue": 50000,
  "users": 1250,
  "growth": 12.5,
  "chart_data": [100, 150, 200, 180, 220]
}

	•	Gets URL: https://yourdomain.com/m/sarah-dev/api/dashboard/stats
	•	Uses in her React app:
fetch('https://yourdomain.com/m/sarah-dev/api/dashboard/stats')
  .then(res => res.json())
  .then(data => setDashboardData(data))

Use Case 2: API Documentation Examples
Scenario: Tom is writing API documentation and needs live examples.
What he does:
	•	Creates multiple mock endpoints:
	•	/api/v1/products - Returns product list
	•	/api/v1/products/123 - Returns single product
	•	/api/v1/orders - Returns order list
	•	Embeds live URLs in documentation:
## Get All Products
GET https://yourdomain.com/m/demo-api/api/v1/products

Try it out: [Live Example](https://yourdomain.com/m/demo-api/api/v1/products)

Use Case 3: Teaching/Tutorials
Scenario: An instructor teaching a React course needs students to fetch data.
What they do:
	•	Creates a mock Pokemon API
	•	Sets endpoint /pokemon to return:
{
  "pokemon": [
    {"id": 1, "name": "Bulbasaur", "type": "grass"},
    {"id": 2, "name": "Charmander", "type": "fire"},
    {"id": 3, "name": "Squirtle", "type": "water"}
  ]
}

	•	Shares URL with students: https://yourdomain.com/m/pokemon-class/pokemon
	•	All students can immediately start coding without any setup
Advanced Features Users Love
1. Dynamic Responses Based on Conditions
User wants different responses based on requests:
Creates rules like:
	•	"If request has header Authorization: Bearer token123 → Return success response"
	•	"If request has no auth header → Return 401 error"
	•	"If query param ?error=true → Return error response"
2. Multiple Responses with Random Selection
User sets up multiple possible responses:
	•	Response A (weight: 70%) - Success case
	•	Response B (weight: 20%) - Partial data
	•	Response C (weight: 10%) - Error case
System randomly returns one based on weights, simulating real-world unpredictability.
3. Request Method Handling
Same path, different methods:
	•	GET /api/users → Returns user list
	•	POST /api/users → Returns created user
	•	DELETE /api/users/123 → Returns success message
4. Delayed Responses
Simulate slow networks: User sets 2-second delay on endpoint to test loading states in their app.
The Complete User Journey
1. Sign Up & Create Project
User signs up → Creates project "My E-commerce API" → Gets project slug "my-ecommerce-api"

2. Create Multiple Mocks
Creates mocks:
- GET /products
- GET /products/{id}
- POST /cart/add
- GET /user/profile

3. Define Responses
For each endpoint, user:
	•	Writes JSON response
	•	Sets status code (200, 404, 500, etc.)
	•	Adds headers if needed
	•	Sets conditions (optional)
4. Share & Use
Base URL: https://yourdomain.com/m/my-ecommerce-api

Full endpoints:
- https://yourdomain.com/m/my-ecommerce-api/products
- https://yourdomain.com/m/my-ecommerce-api/products/123
- https://yourdomain.com/m/my-ecommerce-api/cart/add

5. Monitor Usage
User can see:
	•	How many times each endpoint was called
	•	What requests were made
	•	Response times
	•	Error rates
Why This Is Powerful
For Frontend Developers:
	•	Start building immediately without waiting for backend
	•	Test edge cases easily
	•	Share working demos with clients
For API Designers:
	•	Prototype APIs before building
	•	Get feedback on API design
	•	Document with live examples
For Teachers/Content Creators:
	•	Provide consistent APIs for tutorials
	•	No server maintenance
	•	Students get same experience
For QA/Testing:
	•	Create specific test scenarios
	•	Simulate errors on demand
	•	Test timeout handling
The Magic: It's All Instant
Traditional way:
	•	Set up server ❌
	•	Write backend code ❌
	•	Deploy somewhere ❌
	•	Manage infrastructure ❌
	•	Handle CORS ❌
With your service:
	•	Define what you want to return ✅
	•	Get a URL ✅
	•	Use it immediately ✅
That's the entire value proposition - turning API mocking from a complex technical task into a simple "fill in what you want to return" exercise.

Tech stack
Complete Tech Stack for API Mock Service
Core Development Stack
Frontend Technologies
Essential:
	•	HTML/CSS - Basic web structure and styling
	•	JavaScript (ES6+) - Modern JavaScript features
	•	TypeScript - Type safety and better developer experience
	•	React.js - UI framework (or Vue.js/Svelte as alternatives)
	•	Next.js 14 - Full-stack React framework with App Router
Styling & UI:
	•	Tailwind CSS - Utility-first CSS framework
	•	CSS Modules/Styled Components - Component-level styling
	•	Responsive Design - Mobile-first approach
	•	shadcn/ui - Pre-built React components
	•	Framer Motion - Animations (optional but nice)
State Management & Data Fetching:
	•	React Query (TanStack Query) - Server state management
	•	Zustand or Redux Toolkit - Client state management
	•	Axios or Fetch API - HTTP requests
	•	SWR - Alternative to React Query
Development Tools:
	•	Webpack/Vite - Build tools (handled by Next.js)
	•	ESLint - Code linting
	•	Prettier - Code formatting
	•	React Hook Form - Form handling
	•	Zod - Schema validation

Backend Technologies
Core Runtime & Framework:
	•	Node.js (v18+) - JavaScript runtime
	•	Express.js or Fastify - Web framework
	•	TypeScript - Type safety for backend too
API Development:
	•	RESTful API Design - HTTP methods, status codes, best practices
	•	JSON - Data interchange format
	•	CORS - Cross-Origin Resource Sharing
	•	API Versioning - Version management strategies
	•	Rate Limiting - Protection against abuse
	•	Request Validation - Input sanitization
Real-time Features (Optional):
	•	WebSockets - Real-time communication
	•	Server-Sent Events (SSE) - One-way real-time data
	•	Socket.io - WebSocket abstraction
Database Technologies
Primary Database:
	•	PostgreSQL - Relational database
	•	SQL - Query language
	•	Database Design - Normalization, indexes, constraints
	•	Transactions - ACID compliance
	•	Connection Pooling - Performance optimization
ORM/Query Builder:
	•	Prisma - Modern ORM for Node.js
	•	Database Migrations - Schema versioning
	•	Seeding - Test data generation
Caching Layer:
	•	Redis - In-memory data store
	•	Caching Strategies - TTL, invalidation, warming
	•	Pub/Sub - Redis messaging
	•	Session Storage - User sessions
Alternative Databases (Optional):
	•	MongoDB - For unstructured data
	•	ClickHouse/TimescaleDB - For analytics
Authentication & Security
Authentication:
	•	JWT (JSON Web Tokens) - Token-based auth
	•	OAuth 2.0 - Social login understanding
	•	NextAuth.js - Authentication library
	•	bcrypt - Password hashing
	•	2FA - Two-factor authentication (optional)
Security Practices:
	•	HTTPS/SSL/TLS - Secure communication
	•	CORS Configuration - Cross-origin security
	•	Environment Variables - Secrets management
	•	SQL Injection Prevention - Parameterized queries
	•	XSS Prevention - Input sanitization
	•	CSRF Protection - Cross-site request forgery
	•	Rate Limiting - DDoS protection
	•	Content Security Policy (CSP) - Browser security
Payment Processing
Stripe Integration:
	•	Stripe API - Payment processing
	•	Webhooks - Event handling
	•	Subscription Management - Recurring payments
	•	PCI Compliance - Basic understanding
	•	Invoice Generation - Billing features
DevOps & Deployment
Version Control:
	•	Git - Version control system
	•	GitHub/GitLab - Code repository
	•	Git Flow - Branching strategies
	•	Pull Requests - Code review process
Containerization:
	•	Docker - Container basics
	•	Docker Compose - Multi-container apps
	•	Container Registries - Docker Hub, GitHub Container Registry
CI/CD:
	•	GitHub Actions - Automation workflows
	•	Environment Management - Dev, staging, production
	•	Automated Testing - Test runners
	•	Build Pipelines - Automated builds
Cloud Platforms (Choose One):
	•	Vercel - Frontend deployment (easiest for Next.js)
	•	Railway/Render - Full-stack deployment
	•	AWS - EC2, RDS, S3, CloudFront (more complex)
	•	Google Cloud Platform - Similar to AWS
	•	DigitalOcean - Simpler VPS option
Infrastructure:
	•	Domain Management - DNS, nameservers
	•	SSL Certificates - Let's Encrypt, Cloudflare
	•	CDN - Cloudflare, Fastly
	•	Load Balancing - Traffic distribution
	•	Reverse Proxy - Nginx basics
Monitoring & Analytics
Application Monitoring:
	•	Sentry - Error tracking
	•	LogRocket/FullStory - Session replay
	•	Google Analytics - User analytics
	•	Plausible/Umami - Privacy-friendly analytics
Performance Monitoring:
	•	Web Vitals - Core performance metrics
	•	Lighthouse - Performance auditing
	•	New Relic/DataDog - APM tools (optional)
Logging:
	•	Winston/Pino - Node.js logging
	•	Log Aggregation - Centralized logs
	•	Structured Logging - JSON logs
Development Environment
Code Editor:
	•	VS Code - With extensions
	•	Debugging Tools - Chrome DevTools, React DevTools
	•	REST Client - Postman, Insomnia, or VS Code extensions
Package Management:
	•	npm/yarn/pnpm - Package managers
	•	Package.json - Dependency management
	•	Semantic Versioning - Version understanding
Testing:
	•	Jest - Unit testing
	•	React Testing Library - Component testing
	•	Cypress/Playwright - E2E testing
	•	Mock Service Worker (MSW) - API mocking for tests
Additional Skills
Code Quality:
	•	Clean Code Principles - Readable, maintainable code
	•	SOLID Principles - OOP best practices
	•	DRY/KISS - Code principles
	•	Code Reviews - Best practices
Performance:
	•	Web Performance - Loading optimization
	•	Database Optimization - Query performance
	•	Caching Strategies - Multi-level caching
	•	CDN Usage - Static asset delivery
Business Understanding:
	•	SaaS Metrics - MRR, Churn, CAC
	•	Pricing Strategies - Freemium model
	•	User Experience - Basic UX principles
	•	A/B Testing - Feature testing
Learning Priority Order
Phase 1: Foundation (Must Have)
	•	HTML/CSS/JavaScript
	•	React.js basics
	•	Node.js & Express
	•	PostgreSQL & SQL
	•	Git & GitHub
	•	Basic deployment (Vercel)
Phase 2: Full-Stack Development
	•	TypeScript
	•	Next.js
	•	Prisma ORM
	•	Redis basics
	•	JWT Authentication
	•	REST API design
Phase 3: Production Ready
	•	Docker basics
	•	CI/CD with GitHub Actions
	•	Stripe integration
	•	Security best practices
	•	Performance optimization
	•	Monitoring (Sentry)
Phase 4: Scale & Optimize
	•	Advanced caching
	•	Database optimization
	•	CDN configuration
	•	Load testing
	•	Advanced monitoring
	•	Microservices patterns
Resources for Learning
Free Resources:
	•	MDN Web Docs - Web fundamentals
	•	freeCodeCamp - Full-stack curriculum
	•	The Odin Project - Web development path
	•	YouTube - Traversy Media, Web Dev Simplified
Paid Resources:
	•	Frontend Masters - In-depth courses
	•	Pluralsight - Comprehensive paths
	•	Udemy - Specific technology courses
	•	O'Reilly Learning - Books and videos
Documentation:
	•	Next.js Docs - Official documentation
	•	React Docs - New React documentation
	•	Node.js Docs - Official guides
	•	PostgreSQL Docs - Database documentation
Communities:
	•	Stack Overflow - Q&A
	•	Reddit - r/webdev, r/node, r/reactjs
	•	Discord - Reactiflux, Nodeiflux
	•	Twitter - Follow framework authors
The key is to start with the fundamentals and gradually add more technologies as you build. You don't need to master everything before starting - learn as you build!
Timeline
Realistic Side-Project Roadmap for API Mock Service
Your Constraints & Approach
Time Available:
	•	Weekdays: 1-2 hours (after work)
	•	Weekends: 4-6 hours (one weekend day)
	•	Total: ~15 hours/week
Key Principles:
	•	Ship MVP in 6-8 weeks
	•	Use managed services (avoid DevOps complexity)
	•	Buy vs Build where possible
	•	Focus on ONE feature at a time
	•	Launch early, iterate based on feedback
Phase 1: Pre-Development (Week 0)
Weekend Setup (4-6 hours)
Saturday:
□ Buy domain name
□ Set up GitHub repository
□ Create Next.js project with TypeScript
□ Set up Vercel account and connect repo
□ Deploy "Hello World" to production
□ Set up Supabase account (Postgres + Auth)

Sunday:
□ Design basic database schema
□ Create Figma/Excalidraw mockups
□ Write down 5 core features for MVP
□ Set up project management (Notion/Linear)

Phase 2: MVP Development (Weeks 1-6)
Week 1: Authentication & Basic UI
Weekday evenings (5x 1.5 hours):
Monday: Set up Supabase Auth in Next.js
Tuesday: Create login/register pages
Wednesday: Protected routes and middleware
Thursday: Basic dashboard layout
Friday: Deploy and test auth flow

Weekend (6 hours):
- Polish auth UI with Tailwind
- Add error handling
- Create project model in database
- Basic project CRUD UI
- Test everything, fix bugs

Week 2: Core Mock Functionality
Weekday evenings:
Monday: Mock database schema
Tuesday: Create mock endpoint UI
Wednesday: JSON editor integration (Monaco)
Thursday: Save mock to database
Friday: Basic mock retrieval API

Weekend:
- Build the mock execution engine
- Handle dynamic routes (/m/[project]/*)
- Return stored JSON responses
- Add CORS headers
- Test with Postman
- Deploy to production

Week 3: Response Management
Weekday evenings:
Monday: Multiple responses per endpoint
Tuesday: Response conditions UI
Wednesday: Condition evaluation logic
Thursday: Headers and status codes
Friday: Response preview feature

Weekend:
- Polish response editor UX
- Add response templates
- Implement method handling (GET, POST, etc.)
- Basic request logging
- Performance optimization

Week 4: Request Logging & Analytics
Weekday evenings:
Monday: Request logging schema
Tuesday: Capture requests to database
Wednesday: Basic log viewer UI
Thursday: Log filtering and search
Friday: Simple analytics queries

Weekend:
- Build analytics dashboard
- Add charts (use Recharts)
- Usage statistics
- Performance metrics
- Deploy and test at scale

Week 5: Payments & Limits
Weekday evenings:
Monday: Set up Stripe account
Tuesday: Create products in Stripe
Wednesday: Implement Stripe Checkout
Thursday: Webhook handling
Friday: Update user subscription status

Weekend:
- Usage limits enforcement
- Upgrade/downgrade flows
- Payment success/failure pages
- Free tier restrictions
- Test payment flows

Week 6: Polish & Launch Prep
Weekday evenings:
Monday: Fix critical bugs
Tuesday: Improve error messages
Wednesday: Add loading states
Thursday: Mobile responsive fixes
Friday: Write documentation

Weekend:
- Create landing page
- Set up analytics
- Prepare ProductHunt assets
- Create demo video
- Soft launch to friends

Phase 3: Launch & Early Growth (Weeks 7-8)
Week 7: Public Launch
Weekday evenings:
Monday: Submit to ProductHunt (12:01 AM PST)
Tuesday: Post on HackerNews, Reddit
Wednesday: Share on Twitter/LinkedIn
Thursday: Respond to feedback
Friday: Fix urgent bugs

Weekend:
- Monitor and respond to users
- Quick bug fixes
- Gather feature requests
- Plan next iterations

Week 8: Post-Launch Improvements
Focus on top user requests
- API key authentication
- Import/Export features
- Better error handling
- Performance improvements
- User onboarding flow

Technology Choices for Speed
Use These Managed Services:
Frontend Hosting: Vercel (free tier)
Database: Supabase (Postgres + Auth + Realtime)
Payments: Stripe Checkout (no custom billing UI)
Analytics: Plausible ($9/month) or Vercel Analytics
Error Tracking: Sentry (free tier)
Email: Resend (free tier)
Domain: Cloudflare Registrar

Tech Stack for Rapid Development:
Frontend:
- Next.js 14 (App Router)
- TypeScript (basic types only)
- Tailwind CSS + shadcn/ui
- React Query

Backend:
- Next.js API Routes (no separate backend)
- Prisma with Supabase
- Zod for validation

Deployment:
- Vercel (automatic from GitHub)
- Environment variables in Vercel

Time-Saving Shortcuts
Copy & Adapt:
	•	UI Components: Use shadcn/ui exclusively
	•	Auth Flow: Copy from Supabase examples
	•	Payment Flow: Use Stripe's pre-built checkout
	•	Landing Page: Use a template (Tailwind UI)
Skip These (For Now):
	•	Custom design system
	•	Complex animations
	•	Email verification
	•	Team features
	•	API versioning
	•	Microservices
	•	Docker/Kubernetes
	•	Custom CDN setup
Use These Tools:
	•	Cursor/GitHub Copilot: AI code completion
	•	ChatGPT/Claude: Debug help and code generation
	•	Vercel CLI: Local development
	•	TablePlus: Database GUI
	•	Postman: API testing
Weekly Schedule Template
Weekday Routine (1.5 hours):
8:00 PM - 8:15 PM: Review today's task
8:15 PM - 9:15 PM: Focused coding
9:15 PM - 9:30 PM: Quick test & commit
9:30 PM: Deploy to staging

Weekend Session (6 hours):
9:00 AM - 12:00 PM: Major feature work
12:00 PM - 1:00 PM: Lunch break
1:00 PM - 3:00 PM: Testing & bug fixes
3:00 PM - 4:00 PM: Deploy & document

Motivation & Momentum Tips
Track Progress:
	•	Daily commits (even small ones)
	•	Weekly demo videos
	•	Share progress on Twitter
	•	Keep a development log
Avoid Burnout:
	•	Take one weekday off per week
	•	One full weekend off per month
	•	Don't code when too tired
	•	Focus on shipping, not perfection
Stay Focused:
	•	One feature at a time
	•	"Works" before "perfect"
	•	Launch with 5 features, not 50
	•	Get user feedback early
Post-MVP Roadmap (Months 3-6)
Month 3: User-Requested Features
	•	Custom domains/subdomains
	•	Team collaboration
	•	Advanced conditionals
	•	Import from Postman
Month 4: Growth Features
	•	API access
	•	Webhook support
	•	Response scripting
	•	Public mock gallery
Month 5: Enterprise Features
	•	SSO/SAML
	•	Audit logs
	•	SLA monitoring
	•	White-label options
Month 6: Scale & Optimize
	•	Performance improvements
	•	Cost optimization
	•	Advanced analytics
	•	Affiliate program
Success Metrics
Week 6 (Launch):
	•	100 signups
	•	10 paying customers
	•	500 mocks created
	•	$90 MRR
Month 3:
	•	1,000 signups
	•	50 paying customers
	•	5,000 mocks created
	•	$450 MRR
Month 6:
	•	5,000 signups
	•	200 paying customers
	•	25,000 mocks created
	•	$2,000 MRR
Remember:
	•	Your first version will suck - that's okay
	•	Launch anxiety is normal - push through it
	•	Users are forgiving - if you're responsive
	•	Consistency beats intensity - small daily progress
	•	Perfect is the enemy of done - ship it!
The key is maintaining momentum while avoiding burnout. This roadmap gets you to revenue in 6-8 weeks with just 15 hours/week. After launch, user feedback will guide your priorities better

Features
MVP Features:-
	•	Create Organization
	•	Add members
	•	Remove members
	•	Role based
	•	Add api endpoints
	•	Option to add headers.
	•	Options to add query params
	•	Options to add different responses for different conditions
	•	Create projects
	•	

DB Schema
Complete SQL Schema for MockBird
Drop existing tables (if needed)
-- WARNING: This will delete all data! Only use for fresh setup
DROP TABLE IF EXISTS request_logs;
DROP TABLE IF EXISTS mock_responses;
DROP TABLE IF EXISTS mocks;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS billing_events;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS organization_settings;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS usage_stats;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS organization;
DROP TABLE IF EXISTS users;

Core Tables
1. Users Table
CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    user_name TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_name ON users(user_name);

2. Organization Table
CREATE TABLE organization (
    organization_id TEXT PRIMARY KEY,
    organization_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    subscription_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'team'
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX idx_organization_slug ON organization(slug);
CREATE INDEX idx_organization_created_by ON organization(created_by);

3. Members Table
CREATE TABLE members (
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
    joined_at INTEGER NOT NULL,
    invited_by TEXT,
    
    PRIMARY KEY (user_id, organization_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(user_id)
);

CREATE INDEX idx_members_organization ON members(organization_id);
CREATE INDEX idx_members_user ON members(user_id);

Project & Mock Tables
4. Projects Table
CREATE TABLE projects (
    project_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    project_slug TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    UNIQUE(organization_id, project_slug)
);

CREATE INDEX idx_projects_organization ON projects(organization_id);
CREATE INDEX idx_projects_slug ON projects(project_slug);
CREATE INDEX idx_projects_created_by ON projects(created_by);

5. Mocks Table
CREATE TABLE mocks (
    mock_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    mock_name TEXT NOT NULL,
    path TEXT NOT NULL, -- /api/users/{id}
    method TEXT NOT NULL, -- GET, POST, PUT, DELETE, PATCH
    description TEXT,
    is_active INTEGER DEFAULT 1,
    response_type TEXT DEFAULT 'json', -- json, xml, html, text
    response_delay INTEGER DEFAULT 0, -- milliseconds
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    UNIQUE(project_id, path, method)
);

CREATE INDEX idx_mocks_project ON mocks(project_id);
CREATE INDEX idx_mocks_path_method ON mocks(project_id, path, method);

6. Mock Responses Table
CREATE TABLE mock_responses (
    response_id TEXT PRIMARY KEY,
    mock_id TEXT NOT NULL,
    response_name TEXT,
    status_code INTEGER DEFAULT 200,
    headers TEXT, -- JSON string
    body TEXT NOT NULL,
    conditions TEXT, -- JSON string for conditional logic
    weight INTEGER DEFAULT 100, -- For random selection
    is_default INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (mock_id) REFERENCES mocks(mock_id) ON DELETE CASCADE
);

CREATE INDEX idx_mock_responses_mock ON mock_responses(mock_id);
CREATE INDEX idx_mock_responses_default ON mock_responses(mock_id, is_default);

Analytics & Logging Tables
7. Request Logs Table
CREATE TABLE request_logs (
    log_id TEXT PRIMARY KEY,
    mock_id TEXT NOT NULL,
    project_id TEXT NOT NULL, -- Denormalized for performance
    organization_id TEXT NOT NULL, -- Denormalized for performance
    request_method TEXT,
    request_path TEXT,
    request_headers TEXT, -- JSON
    request_body TEXT,
    request_query TEXT, -- JSON
    response_id TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (mock_id) REFERENCES mocks(mock_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX idx_request_logs_created ON request_logs(created_at);
CREATE INDEX idx_request_logs_mock ON request_logs(mock_id, created_at);
CREATE INDEX idx_request_logs_project ON request_logs(project_id, created_at);
CREATE INDEX idx_request_logs_org ON request_logs(organization_id, created_at);

8. Usage Stats Table
CREATE TABLE usage_stats (
    stat_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    month TEXT NOT NULL, -- YYYY-MM format
    endpoint_count INTEGER DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    bandwidth_bytes INTEGER DEFAULT 0,
    unique_ips INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    UNIQUE(organization_id, month)
);

CREATE INDEX idx_usage_stats_org_month ON usage_stats(organization_id, month);

Authentication & Security Tables
9. API Keys Table
CREATE TABLE api_keys (
    key_id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL, -- First 8 chars for identification
    name TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    permissions TEXT, -- JSON array of permissions
    last_used_at INTEGER,
    expires_at INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

10. Invitations Table
CREATE TABLE invitations (
    invitation_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by TEXT NOT NULL,
    accepted_at INTEGER,
    accepted_by TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(user_id),
    FOREIGN KEY (accepted_by) REFERENCES users(user_id),
    UNIQUE(organization_id, email)
);

CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);

Billing Tables
11. Subscriptions Table
CREATE TABLE subscriptions (
    subscription_id TEXT PRIMARY KEY,
    organization_id TEXT UNIQUE NOT NULL, -- One subscription per org
    plan_type TEXT NOT NULL, -- 'free', 'pro', 'team'
    status TEXT NOT NULL, -- 'active', 'cancelled', 'past_due', 'unpaid'
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    current_period_start INTEGER,
    current_period_end INTEGER,
    cancel_at INTEGER,
    cancelled_at INTEGER,
    trial_end INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

12. Billing Events Table
CREATE TABLE billing_events (
    event_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    subscription_id TEXT,
    event_type TEXT NOT NULL, -- 'payment_succeeded', 'payment_failed', 'subscription_updated'
    amount INTEGER, -- Store in cents
    currency TEXT DEFAULT 'USD',
    description TEXT,
    stripe_event_id TEXT UNIQUE,
    metadata TEXT, -- JSON for additional data
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(subscription_id)
);

CREATE INDEX idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);
CREATE INDEX idx_billing_events_created ON billing_events(created_at);

Settings & Configuration Tables
13. Organization Settings Table
CREATE TABLE organization_settings (
    organization_id TEXT PRIMARY KEY,
    allow_public_projects INTEGER DEFAULT 1,
    default_project_visibility TEXT DEFAULT 'private',
    require_api_key INTEGER DEFAULT 0,
    allowed_email_domains TEXT, -- JSON array
    webhook_url TEXT,
    webhook_secret TEXT,
    custom_domain TEXT,
    max_members INTEGER, -- Based on subscription
    max_projects INTEGER, -- Based on subscription
    max_requests_per_month INTEGER, -- Based on subscription
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE
);

Optional Enhancement Tables
14. Response Templates Table
CREATE TABLE response_templates (
    template_id TEXT PRIMARY KEY,
    organization_id TEXT,
    name TEXT NOT NULL,
    category TEXT, -- 'user', 'product', 'error', 'auth'
    description TEXT,
    body TEXT NOT NULL,
    headers TEXT, -- JSON
    status_code INTEGER DEFAULT 200,
    is_public INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE INDEX idx_templates_org ON response_templates(organization_id);
CREATE INDEX idx_templates_public ON response_templates(is_public);
CREATE INDEX idx_templates_category ON response_templates(category);

15. Audit Logs Table
CREATE TABLE audit_logs (
    audit_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'create_project', 'delete_mock', 'invite_member', etc.
    resource_type TEXT, -- 'project', 'mock', 'member', etc.
    resource_id TEXT,
    changes TEXT, -- JSON with before/after values
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

Create Initial Indexes for Performance
-- Additional performance indexes
CREATE INDEX idx_projects_active ON projects(organization_id, is_active);
CREATE INDEX idx_mocks_active ON mocks(project_id, is_active);
CREATE INDEX idx_users_active ON users(is_active, created_at);

Save this as schema.sql and run it against your database to create all tables with proper relationships and indexes!
Handling dynamic routes
Dynamic Route Handling Strategy for MockBird
The Core Challenge
Users create arbitrary endpoints like:
	•	/m/my-project/api/users
	•	/m/my-project/products/{id}/reviews
	•	/m/my-project/auth/login
These routes don't exist in your codebase, so you need a catch-all mechanism.
Implementation Approaches
1. Catch-All Route Pattern (Recommended)
Next.js App Router Implementation
// app/m/[...slug]/route.ts
// This catches ALL routes starting with /m/

export async function GET(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  return handleMockRequest(request, params.slug, 'GET');
}

export async function POST(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  return handleMockRequest(request, params.slug, 'POST');
}

export async function PUT(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  return handleMockRequest(request, params.slug, 'PUT');
}

export async function DELETE(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  return handleMockRequest(request, params.slug, 'DELETE');
}

export async function PATCH(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  return handleMockRequest(request, params.slug, 'PATCH');
}

// Add OPTIONS for CORS
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

2. The Mock Request Handler
// lib/mockHandler.ts
async function handleMockRequest(
  request: Request,
  slugParts: string[],
  method: string
) {
  // Extract project and path
  const [projectSlug, ...pathParts] = slugParts;
  const mockPath = '/' + pathParts.join('/');
  
  // Example URL: /m/my-project/api/users/123
  // projectSlug = "my-project"
  // mockPath = "/api/users/123"
  
  try {
    // 1. Find the project
    const project = await findProjectBySlug(projectSlug);
    if (!project) {
      return new Response('Project not found', { status: 404 });
    }
    
    // 2. Find matching mock
    const mock = await findMatchingMock(project.project_id, mockPath, method);
    if (!mock) {
      return new Response('Mock endpoint not found', { status: 404 });
    }
    
    // 3. Get the response
    const mockResponse = await selectMockResponse(mock, request);
    
    // 4. Log the request
    await logRequest(mock, request, mockResponse);
    
    // 5. Return the response
    return new Response(mockResponse.body, {
      status: mockResponse.status_code,
      headers: {
        ...JSON.parse(mockResponse.headers || '{}'),
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    console.error('Mock handler error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

3. Path Matching Logic
// lib/pathMatcher.ts

interface PathMatch {
  isMatch: boolean;
  params: Record<string, string>;
}

function matchPath(pattern: string, actualPath: string): PathMatch {
  // Convert /users/{id}/posts/{postId} to regex
  // and extract parameter values
  
  const paramNames: string[] = [];
  const regexPattern = pattern.replace(
    /{([^}]+)}/g,
    (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)'; // Match any non-slash characters
    }
  );
  
  // Escape special regex characters in the static parts
  const escapedPattern = regexPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPattern}$`);
  
  const match = actualPath.match(regex);
  
  if (!match) {
    return { isMatch: false, params: {} };
  }
  
  // Extract parameters
  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1];
  });
  
  return { isMatch: true, params };
}

// Usage example:
const result = matchPath('/users/{id}/posts/{postId}', '/users/123/posts/456');
// result = { isMatch: true, params: { id: '123', postId: '456' } }

4. Database Query for Mock Matching
// lib/mockDatabase.ts

async function findMatchingMock(
  projectId: string,
  requestPath: string,
  method: string
) {
  // First try exact match
  let mock = await db.query(`
    SELECT * FROM mocks 
    WHERE project_id = ? 
      AND path = ? 
      AND method = ?
      AND is_active = 1
  `, [projectId, requestPath, method]);
  
  if (mock) return mock;
  
  // If no exact match, try pattern matching
  const allMocks = await db.query(`
    SELECT * FROM mocks 
    WHERE project_id = ? 
      AND method = ?
      AND is_active = 1
    ORDER BY LENGTH(path) DESC
  `, [projectId, method]);
  
  // Check each mock for pattern match
  for (const mock of allMocks) {
    const match = matchPath(mock.path, requestPath);
    if (match.isMatch) {
      // Store params for use in response
      mock.pathParams = match.params;
      return mock;
    }
  }
  
  return null;
}

5. Alternative: Express.js Implementation
// If using Express instead of Next.js

// Catch all routes under /m/
app.all('/m/:projectSlug/*', async (req, res) => {
  const projectSlug = req.params.projectSlug;
  const mockPath = '/' + req.params[0]; // Everything after project slug
  const method = req.method;
  
  try {
    const response = await handleMockRequest({
      projectSlug,
      mockPath,
      method,
      headers: req.headers,
      body: req.body,
      query: req.query
    });
    
    res.status(response.statusCode)
       .set(response.headers)
       .send(response.body);
  } catch (error) {
    res.status(500).send('Internal server error');
  }
});

6. Performance Optimization
// lib/mockCache.ts
import { LRUCache } from 'lru-cache';

// Cache mock configurations
const mockCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 1000 * 60 * 5 // 5 minutes
});

async function getCachedMock(projectId: string, path: string, method: string) {
  const cacheKey = `${projectId}:${path}:${method}`;
  
  let mock = mockCache.get(cacheKey);
  if (mock) return mock;
  
  mock = await findMatchingMock(projectId, path, method);
  if (mock) {
    mockCache.set(cacheKey, mock);
  }
  
  return mock;
}

// Cache project lookups
const projectCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 10 // 10 minutes
});

async function getCachedProject(slug: string) {
  let project = projectCache.get(slug);
  if (project) return project;
  
  project = await findProjectBySlug(slug);
  if (project) {
    projectCache.set(slug, project);
  }
  
  return project;
}

7. Subdomain Routing (Advanced)
// middleware.ts (Next.js)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // Check if it's a project subdomain
  if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
    // Rewrite to our catch-all route
    const url = request.nextUrl.clone();
    url.pathname = `/m/${subdomain}${url.pathname}`;
    return NextResponse.rewrite(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next (Next.js internals)
     * - static files
     */
    '/((?!api|_next|_static|_vercel|[\\w-]+\\.\\w+).*)',
  ],
};

8. Error Handling & User Feedback
// lib/errorResponses.ts

function createErrorResponse(error: string, status: number) {
  return new Response(
    JSON.stringify({
      error,
      message: getErrorMessage(error),
      documentation_url: 'https://mockbird.co/docs/errors'
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}

const errorMessages = {
  PROJECT_NOT_FOUND: 'The specified project does not exist',
  MOCK_NOT_FOUND: 'No mock found for this endpoint',
  RATE_LIMIT_EXCEEDED: 'Too many requests',
  SUBSCRIPTION_LIMIT: 'Upgrade required for more requests'
};

9. Testing Dynamic Routes
// __tests__/mockHandler.test.ts

describe('Mock Handler', () => {
  it('should handle exact path matches', async () => {
    const response = await fetch('/m/test-project/api/users');
    expect(response.status).toBe(200);
  });
  
  it('should handle parameterized paths', async () => {
    const response = await fetch('/m/test-project/users/123');
    expect(response.status).toBe(200);
  });
  
  it('should return 404 for non-existent mocks', async () => {
    const response = await fetch('/m/test-project/non-existent');
    expect(response.status).toBe(404);
  });
});

Key Implementation Points
	•	Use Catch-All Routes: [...slug] in Next.js or /* in Express
	•	Parse URLs Carefully: Extract project slug and mock path
	•	Cache Aggressively: Mock configs don't change often
	•	Handle Path Parameters: Support /users/{id} patterns
	•	CORS Headers: Always include for browser compatibility
	•	Log Everything: For analytics and debugging
	•	Graceful Errors: Clear messages when mocks aren't found
This approach ensures users can create any endpoint pattern they want, and your system will correctly route and handle it without requiring any backend changes!
