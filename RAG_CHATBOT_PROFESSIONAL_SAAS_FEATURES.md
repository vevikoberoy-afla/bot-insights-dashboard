# RAG Chatbot Widget — Professional SaaS Enhancement Plan

## Executive Summary

This document outlines **must-have professional SaaS features** that transform the current chatbot widget into an enterprise-ready platform. Features are designed with a **channel-agnostic architecture** to seamlessly support future expansion to Instagram DMs, WhatsApp Business, SMS, email, and other messaging platforms.

---

## 🏗️ Architecture Philosophy: Channel-Agnostic Design

**Core Principle:** Every message interaction flows through a unified `MessagePipeline` regardless of source (web widget, WhatsApp, Instagram, email). This enables zero-code channel additions.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web Widget  │     │  WhatsApp   │     │  Instagram  │
│  (Current)   │     │  (Future)   │     │  (Future)   │
└──────┬───────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────┐
│              Unified Message Pipeline                │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Channel  │→│  Rate    │→│  3-Stage RAG      │  │
│  │ Adapter  │  │  Limiter │  │  Pipeline         │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Webhook │←│  Event   │←│  Response          │  │
│  │ Sender  │  │  Logger  │  │  Formatter        │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Feature Categories

| Priority | Category | Features |
|----------|----------|----------|
| 🔴 **P0** | Must-Have | Core SaaS infrastructure, security, billing |
| 🟡 **P1** | Should-Have | Analytics, team management, white-labeling |
| 🟢 **P2** | Nice-to-Have | Advanced integrations, automation, AI features |

---

## 🔴 P0 — MUST-HAVE FEATURES (Phase 1: Weeks 1-4)

### 1. Authentication & Authorization System

**Why:** Current admin secret approach is insecure for production. Industry standard requires proper auth.

**Implementation:**

```typescript
// New table: users
interface User {
  id: string;
  email: string;
  password_hash: string;
  role: 'super_admin' | 'admin' | 'manager' | 'viewer';
  organization_id: string;
  created_at: Date;
  last_login: Date;
  email_verified: boolean;
  mfa_enabled: boolean;
  mfa_secret?: string;
}

// New table: organizations
interface Organization {
  id: string;
  name: string;
  slug: string;           // unique, used in URLs
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  settings: OrganizationSettings;
  created_at: Date;
}

// New table: api_keys
interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_hash: string;
  prefix: string;         // first 8 chars shown to user
  scopes: string[];       // ['chat:write', 'chunks:read', ...]
  last_used_at: Date;
  expires_at?: Date;
}
```

**Files to Create:**
- `src/lib/auth.ts` — JWT + session management
- `src/lib/auth-middleware.ts` — Route protection
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/refresh/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/verify-email/route.ts`
- `src/app/auth/login/page.tsx`
- `src/app/auth/register/page.tsx`
- `src/app/auth/forgot-password/page.tsx`

**Key Features:**
- Email/password authentication with bcrypt
- JWT access tokens (15 min) + refresh tokens (7 days)
- Magic link authentication (passwordless option)
- Multi-factor authentication (TOTP)
- Session management (view active sessions, revoke)
- Password reset flow with email verification
- Account lockout after 5 failed attempts

**Library Choice:** [Lucia Auth](https://lucia-auth.com/) — lightweight, works with Supabase

---

### 2. Subscription & Billing System

**Why:** Revenue generation is essential. SaaS without billing isn't a business.

**Plan Structure:**

| Feature | Free | Starter ($29/mo) | Professional ($79/mo) | Enterprise ($299/mo) |
|---------|------|------------------|----------------------|---------------------|
| Chatbots | 1 | 3 | 10 | Unlimited |
| Messages/month | 500 | 5,000 | 25,000 | Unlimited |
| Pages crawled | 50 | 500 | 2,000 | 10,000 |
| Team members | 1 | 2 | 5 | Unlimited |
| Custom branding | ❌ | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ | ✅ |
| Webhooks | ❌ | ❌ | 5 | Unlimited |
| Channels | Web only | Web only | Web + 1 | All channels |
| Priority support | ❌ | ❌ | ❌ | ✅ |
| SSO/SAML | ❌ | ❌ | ❌ | ✅ |
| Data export | ❌ | CSV | CSV + API | Full export |
| SLA | ❌ | ❌ | 99.9% | 99.99% |

**Implementation:**

```typescript
// New table: subscriptions
interface Subscription {
  id: string;
  organization_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan: PlanTier;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  trial_end?: Date;
}

// New table: usage_records
interface UsageRecord {
  id: string;
  organization_id: string;
  metric: 'messages' | 'crawl_pages' | 'api_calls' | 'storage_mb';
  quantity: number;
  period_start: Date;
  period_end: Date;
}

// New table: invoices
interface Invoice {
  id: string;
  organization_id: string;
  stripe_invoice_id: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  pdf_url?: string;
  created_at: Date;
}
```

**Files to Create:**
- `src/lib/stripe.ts` — Stripe SDK wrapper
- `src/lib/usage-tracker.ts` — Track message/API usage
- `src/lib/plan-limits.ts` — Enforce plan limits
- `src/app/api/billing/checkout/route.ts` — Create checkout session
- `src/app/api/billing/portal/route.ts` — Customer portal
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook handler
- `src/app/admin/billing/page.tsx` — Billing dashboard

**Key Features:**
- Stripe Checkout integration (hosted or embedded)
- Customer portal for self-service plan changes
- Usage-based billing for messages (overage pricing)
- Free trial (14 days, no credit card required)
- Automatic downgrade on payment failure (grace period: 7 days)
- Invoice history with PDF download
- Usage alerts at 80% and 100% of limits
- Proration on plan upgrades/downgrades

---

### 3. Database Schema Enhancements

**New SQL Migrations:**

```sql
-- supabase/migrations/004_organizations_and_users.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (multi-tenant root)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email_verified BOOLEAN DEFAULT FALSE,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret TEXT,
  last_login_at TIMESTAMPTZ,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- 'messages', 'crawl_pages', 'api_calls', 'storage_mb'
  quantity NUMERIC NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, metric, period_start)
);

-- Webhooks configuration (for future integrations)
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  context_id UUID REFERENCES contexts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'web', 'whatsapp', 'instagram', 'email', 'sms'
  config JSONB NOT NULL, -- channel-specific configuration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel connections (future-proofing)
CREATE TABLE channel_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  context_id UUID REFERENCES contexts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  display_name TEXT,
  credentials JSONB NOT NULL, -- encrypted
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'disconnected', -- 'connected', 'disconnected', 'error'
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX idx_usage_records_org_metric ON usage_records(organization_id, metric, period_start);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_channel_connections_org ON channel_connections(organization_id, context_id);
CREATE INDEX idx_webhook_configs_org ON webhook_configs(organization_id, context_id);

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (example for organizations)
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update own organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM users 
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );
```

---

### 4. Audit Logging System

**Why:** Security compliance (SOC 2, GDPR), debugging, and accountability.

**Implementation:**

```typescript
// src/lib/audit-logger.ts
export type AuditAction = 
  | 'user.login' | 'user.logout' | 'user.register' | 'user.password_reset'
  | 'client.create' | 'client.update' | 'client.delete'
  | 'context.create' | 'context.update' | 'context.delete'
  | 'chunk.create' | 'chunk.delete' | 'chunk.bulk_delete'
  | 'qa.create' | 'qa.update' | 'qa.delete'
  | 'upload.pdf' | 'upload.docx'
  | 'datasource.connect' | 'datasource.test' | 'datasource.delete'
  | 'webhook.create' | 'webhook.update' | 'webhook.delete'
  | 'channel.connect' | 'channel.disconnect'
  | 'settings.update' | 'billing.update'
  | 'api_key.create' | 'api_key.delete';

export async function logAudit(params: {
  organizationId: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<void>;
```

**Logged Events:**
- All authentication events (login, logout, failed attempts)
- CRUD operations on all resources
- Billing changes
- Settings modifications
- API key creation/deletion
- Channel connections
- Bulk operations

**Audit Dashboard:** `/admin/audit` — filterable, searchable, exportable

---

### 5. Error Handling & Monitoring

**Why:** You can't fix what you can't see.

**Implementation:**

```typescript
// src/lib/error-handler.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public details?: Record<string, any>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Error codes for consistency
export const ErrorCodes = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_003',
  AUTH_ACCOUNT_LOCKED: 'AUTH_004',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_001',
  
  // Resources
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_ALREADY_EXISTS: 'RES_002',
  
  // Plan Limits
  LIMIT_MESSAGES_EXCEEDED: 'LIM_001',
  LIMIT_CHATBOTS_EXCEEDED: 'LIM_002',
  LIMIT_PAGES_EXCEEDED: 'LIM_003',
  
  // External Services
  CRAWL_FAILED: 'EXT_001',
  EMBEDDING_FAILED: 'EXT_002',
  LLM_FAILED: 'EXT_003',
  STRIPE_ERROR: 'EXT_004',
  
  // Validation
  VALIDATION_ERROR: 'VAL_001',
  INVALID_INPUT: 'VAL_002',
} as const;
```

**Files to Create:**
- `src/lib/error-handler.ts` — Centralized error handling
- `src/lib/logger.ts` — Structured logging (JSON format)
- `src/lib/health-check.ts` — Health endpoint for monitoring

**Health Check Endpoint:** `/api/health`

```typescript
// Returns: { status: 'healthy' | 'degraded' | 'unhealthy', checks: {...} }
{
  "status": "healthy",
  "timestamp": "2026-08-01T10:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "healthy", "latency": 45 },
    "redis": { "status": "healthy", "latency": 12 },
    "groq": { "status": "healthy", "latency": 230 },
    "gemini": { "status": "healthy", "latency": 180 },
    "firecrawl": { "status": "healthy", "latency": 150 }
  }
}
```

---

### 6. Security Enhancements

**Content Security Policy (CSP):**

```typescript
// next.config.js additions
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.groq.com https://generativelanguage.googleapis.com;
      frame-ancestors 'none';
    `.replace(/\s+/g, ' ').trim()
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
];
```

**Additional Security:**
- CSRF protection on all mutation endpoints
- Input sanitization (XSS prevention)
- SQL injection prevention (parameterized queries — Supabase handles this)
- Encrypted credentials at rest (for channel connections)
- Request signing for API keys
- IP allowlisting for API keys (optional)
- Webhook signature verification

---

## 🟡 P1 — SHOULD-HAVE FEATURES (Phase 2: Weeks 5-8)

### 7. Team Management & Permissions

**Role-Based Access Control (RBAC):**

```typescript
// Role hierarchy
const ROLES = {
  owner: {
    level: 100,
    permissions: ['*'] // all permissions
  },
  admin: {
    level: 80,
    permissions: [
      'organization:read', 'organization:update',
      'users:*',
      'clients:*',
      'contexts:*',
      'billing:read',
      'audit:read',
      'settings:*'
    ]
  },
  manager: {
    level: 60,
    permissions: [
      'clients:read', 'clients:create', 'clients:update',
      'contexts:read', 'contexts:update',
      'chunks:*',
      'qa:*',
      'messages:read',
      'datasources:*'
    ]
  },
  viewer: {
    level: 40,
    permissions: [
      'clients:read',
      'contexts:read',
      'chunks:read',
      'qa:read',
      'messages:read'
    ]
  }
} as const;
```

**Team Features:**
- Invite members by email
- Accept/decline invitations
- Remove team members
- Change member roles
- View team activity
- Team-level notifications

**Files to Create:**
- `src/app/api/team/route.ts` — Team CRUD
- `src/app/api/team/invite/route.ts` — Invitation system
- `src/app/admin/team/page.tsx` — Team management UI

---

### 8. Advanced Analytics Dashboard

**Metrics to Track:**

```typescript
// New table: analytics_events
interface AnalyticsEvent {
  id: string;
  organization_id: string;
  context_id: string;
  session_id: string;
  event_type: 'message_sent' | 'message_received' | 'source_clicked' | 
              'conversation_started' | 'conversation_ended' | 'handoff_requested';
  metadata: Record<string, any>;
  created_at: Date;
}

// New table: daily_stats (materialized view or cron job)
interface DailyStats {
  id: string;
  organization_id: string;
  context_id: string;
  date: Date;
  total_conversations: number;
  total_messages: number;
  unique_visitors: number;
  avg_messages_per_conversation: number;
  avg_response_time_ms: number;
  top_questions: string[];
  top_sources: string[];
  satisfaction_score?: number;
}
```

**Dashboard Widgets:**
- Messages over time (line chart)
- Conversations by hour (heatmap)
- Top 10 questions (table)
- Most referenced sources (bar chart)
- Response time distribution (histogram)
- Visitor geography (map)
- Conversion funnel (conversation → action)
- CSAT score trend (if feedback enabled)

**Files to Create:**
- `src/lib/analytics.ts` — Event tracking
- `src/app/api/analytics/route.ts` — Analytics queries
- `src/app/admin/analytics/page.tsx` — Analytics dashboard

**Charting Library:** [Recharts](https://recharts.org/) or [Tremor](https://www.tremor.so/) — both React-native, free

---

### 9. White-Labeling & Customization

**Widget Customization Options:**

```typescript
interface WidgetConfig {
  // Appearance
  theme: 'light' | 'dark' | 'auto';
  primary_color: string;        // hex color
  background_color: string;
  text_color: string;
  font_family: string;
  border_radius: number;        // px
  bubble_size: number;          // px
  bubble_position: 'bottom-right' | 'bottom-left';
  bubble_icon_url?: string;     // custom icon
  avatar_url?: string;          // bot avatar
  
  // Behavior
  welcome_message: string;
  placeholder_text: string;
  suggestion_prompts: string[]; // up to 4
  auto_open: boolean;
  auto_open_delay: number;      // seconds
  sound_enabled: boolean;
  
  // Branding
  show_branding: boolean;       // "Powered by RAGChat" — hide on Pro+
  custom_css?: string;          // advanced customization
  
  // Features
  file_upload_enabled: boolean;
  file_upload_max_size: number; // MB
  file_upload_types: string[];  // ['pdf', 'docx', 'image']
  feedback_enabled: boolean;    // thumbs up/down
  human_handoff_enabled: boolean;
  
  // Channels
  channels: ChannelConfig[];
}
```

**Custom Domain Support:**
- `chat.clientdomain.com` → CNAME to your service
- SSL certificate auto-provisioning (Let's Encrypt)
- Custom email sender domain for notifications

---

### 10. Email Notification System

**Trigger Events:**
- New conversation started
- High-value lead detected (custom rules)
- Usage limit approaching (80%, 100%)
- Payment failed
- New team member joined
- Weekly digest (summary of activity)
- Monthly invoice

**Implementation:**

```typescript
// src/lib/email.ts
// Use: Resend (free tier: 3,000 emails/month) or Postmark

export async function sendEmail(params: {
  to: string;
  template: EmailTemplate;
  data: Record<string, any>;
}): Promise<void>;

// Email templates stored as React Email components
// src/emails/
//   welcome.tsx
//   invitation.tsx
//   usage-alert.tsx
//   payment-failed.tsx
//   weekly-digest.tsx
//   invoice.tsx
```

**Files to Create:**
- `src/lib/email.ts` — Email service
- `src/lib/email-templates/` — React Email templates
- `src/app/api/notifications/email/route.ts` — Email queue

---

### 11. Data Export & GDPR Compliance

**Export Features:**
- Export all chat logs (CSV/JSON)
- Export all context chunks (CSV/JSON)
- Export Q&A pairs (CSV/JSON)
- Full account data export (GDPR Article 20)
- Delete account and all data (GDPR Article 17)

**Data Retention:**
```typescript
interface DataRetentionPolicy {
  chat_logs: number;        // days (default: 365)
  audit_logs: number;       // days (default: 730)
  analytics_events: number; // days (default: 90)
  inactive_sessions: number; // days (default: 30)
}
```

**Files to Create:**
- `src/lib/export.ts` — Data export utilities
- `src/app/api/export/route.ts` — Export endpoints
- `src/app/admin/settings/privacy/page.tsx` — Privacy settings

---

### 12. Conversation Handoff (Human-in-the-Loop)

**Why:** Sometimes AI can't help. Smooth handoff to human support is critical.

**Implementation:**

```typescript
// New table: handoff_requests
interface HandoffRequest {
  id: string;
  context_id: string;
  session_id: string;
  status: 'pending' | 'accepted' | 'resolved' | 'expired';
  assigned_to?: string;       // user_id
  reason: string;             // 'user_requested' | 'ai_escalated' | 'sentiment_negative'
  conversation_history: Message[];
  created_at: Date;
  resolved_at?: Date;
}
```

**Handoff Triggers:**
- User types "speak to human" / "agent" / "support"
- AI detects negative sentiment (confidence threshold)
- User requests same info 3+ times
- Custom trigger keywords (configurable)

**Files to Create:**
- `src/lib/handoff.ts` — Handoff logic
- `src/app/api/handoff/route.ts` — Handoff endpoints
- `src/app/manage/[id]/handoffs/page.tsx` — Handoff dashboard

---

## 🟢 P2 — NICE-TO-HAVE FEATURES (Phase 3: Weeks 9-12)

### 13. Developer API & SDK

**REST API Documentation:**

```yaml
# OpenAPI 3.0 spec
openapi: 3.0.0
info:
  title: RAGChat API
  version: 1.0.0
  description: API for managing chatbots, contexts, and conversations
  
paths:
  /api/v1/contexts:
    get:
      summary: List all contexts
      security:
        - bearerAuth: []
        - apiKey: []
    post:
      summary: Create a new context
      
  /api/v1/contexts/{id}/chat:
    post:
      summary: Send a message and get response
      
  /api/v1/contexts/{id}/chunks:
    get:
      summary: List all chunks
    post:
      summary: Add a chunk
      
  # ... etc
```

**SDK Libraries:**
- JavaScript/TypeScript SDK
- Python SDK
- REST API with OpenAPI spec
- Postman collection

---

### 14. Webhook System (Integration Foundation)

**Why:** Webhooks enable future integrations without code changes.

```typescript
// New table: webhooks
interface Webhook {
  id: string;
  organization_id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;           // for signature verification
  is_active: boolean;
  failure_count: number;
  last_triggered_at?: Date;
  created_at: Date;
}

type WebhookEvent = 
  | 'conversation.started'
  | 'conversation.ended'
  | 'message.received'
  | 'message.sent'
  | 'handoff.requested'
  | 'handoff.resolved'
  | 'context.updated'
  | 'chunk.added'
  | 'chunk.deleted'
  | 'usage.limit_reached'
  | 'channel.connected'
  | 'channel.disconnected';

// Webhook payload
interface WebhookPayload {
  id: string;               // unique event ID
  event: WebhookEvent;
  timestamp: string;
  organization_id: string;
  context_id?: string;
  data: Record<string, any>;
  signature: string;        // HMAC-SHA256
}
```

**Webhook Features:**
- Create/edit/delete webhooks via UI
- Select which events to subscribe
- Webhook secret for signature verification
- Retry logic (3 attempts, exponential backoff)
- Webhook logs (last 100 deliveries)
- Test webhook button

---

### 15. Channel Integration Framework (Future WhatsApp/Instagram)

**Channel Adapter Interface:**

```typescript
// src/lib/channels/types.ts
export interface ChannelAdapter {
  channel: 'web' | 'whatsapp' | 'instagram' | 'email' | 'sms' | 'telegram';
  
  // Receive incoming message
  receiveMessage(payload: any): Promise<IncomingMessage>;
  
  // Send response back
  sendMessage(conversationId: string, response: OutgoingResponse): Promise<void>;
  
  // Send typing indicator
  sendTyping(conversationId: string): Promise<void>;
  
  // Validate webhook signature
  validateSignature(payload: any, signature: string): boolean;
  
  // Get channel-specific formatting
  formatResponse(response: RAGResponse): ChannelResponse;
}

// Example: WhatsApp Business API adapter (future)
export class WhatsAppAdapter implements ChannelAdapter {
  channel = 'whatsapp' as const;
  
  async receiveMessage(payload: WhatsAppWebhook): Promise<IncomingMessage> {
    return {
      id: payload.entry[0].changes[0].value.messages[0].id,
      conversationId: payload.entry[0].changes[0].value.contacts[0].wa_id,
      text: payload.entry[0].changes[0].value.messages[0].text.body,
      sender: payload.entry[0].changes[0].value.contacts[0].wa_id,
      timestamp: new Date(),
      channel: 'whatsapp'
    };
  }
  
  async sendMessage(to: string, response: OutgoingResponse): Promise<void> {
    // Call WhatsApp Business API
  }
  // ...
}

// Example: Instagram DM adapter (future)
export class InstagramAdapter implements ChannelAdapter {
  channel = 'instagram' as const;
  // Implementation using Instagram Graph API
}
```

**Channel Registration:**

```typescript
// src/lib/channels/registry.ts
const channelRegistry = new Map<string, ChannelAdapter>();

export function registerChannel(adapter: ChannelAdapter) {
  channelRegistry.set(adapter.channel, adapter);
}

export function getChannelAdapter(channel: string): ChannelAdapter {
  const adapter = channelRegistry.get(channel);
  if (!adapter) throw new AppError('CHANNEL_NOT_FOUND', `Channel ${channel} not registered`);
  return adapter;
}

// Register available channels
registerChannel(new WebWidgetAdapter());
// registerChannel(new WhatsAppAdapter());   // future
// registerChannel(new InstagramAdapter());  // future
```

---

### 16. Conversation Memory & Context

**Long-term Memory:**

```typescript
// New table: conversation_memory
interface ConversationMemory {
  id: string;
  context_id: string;
  visitor_id: string;        // hashed email/phone/fingerprint
  key: string;               // 'name', 'email', 'preferences', 'order_history'
  value: any;
  confidence: number;        // 0-1
  last_updated: Date;
  source: 'extracted' | 'explicit' | 'inferred';
}
```

**Features:**
- Remember returning visitors across sessions
- Extract user info from conversation (name, email, preferences)
- Personalize responses based on history
- Cross-channel memory (same visitor on WhatsApp + Web)

---

### 17. A/B Testing for Responses

**Why:** Optimize chatbot performance over time.

```typescript
interface ABTest {
  id: string;
  context_id: string;
  name: string;
  variants: {
    id: string;
    name: string;
    prompt_modifier: string;
    weight: number;          // traffic percentage
  }[];
  metric: 'satisfaction' | 'resolution_rate' | 'engagement';
  status: 'draft' | 'running' | 'completed';
  results?: Record<string, number>;
}
```

---

### 18. Sentiment Analysis & Escalation

```typescript
// Real-time sentiment tracking
interface SentimentScore {
  overall: number;          // -1 to 1
  confidence: number;       // 0 to 1
  keywords: string[];       // detected sentiment keywords
}

// Auto-escalation rules
interface EscalationRule {
  id: string;
  name: string;
  conditions: {
    sentiment_below?: number;
    message_count_above?: number;
    keywords?: string[];
    time_without_resolution?: number; // minutes
  };
  action: 'notify_team' | 'create_ticket' | 'handoff' | 'send_email';
}
```

---

## 🔌 Integration Roadmap

### Phase 1 (Current) — Web Widget
✅ Complete

### Phase 2 (Month 2-3) — WhatsApp Business
- WhatsApp Business API integration
- Template messages
- Media message support (images, documents)
- 24-hour messaging window handling
- Catalog integration (optional)

### Phase 3 (Month 4-5) — Instagram DMs
- Instagram Graph API integration
- Comment-to-DM automation
- Story mention responses
- Ice breaker messages

### Phase 4 (Month 6+) — Additional Channels
- SMS (Twilio)
- Email (incoming → auto-reply)
- Telegram
- Facebook Messenger
- Slack (internal support)
- Microsoft Teams

---

## 📁 New File Structure

```
src/
├── lib/
│   ├── auth.ts                    # Authentication logic
│   ├── auth-middleware.ts         # Route protection
│   ├── audit-logger.ts           # Audit logging
│   ├── analytics.ts              # Event tracking
│   ├── email.ts                  # Email service
│   ├── error-handler.ts          # Centralized errors
│   ├── export.ts                 # Data export
│   ├── handoff.ts                # Human handoff
│   ├── health-check.ts           # Health endpoints
│   ├── logger.ts                 # Structured logging
│   ├── plan-limits.ts            # Plan enforcement
│   ├── stripe.ts                 # Stripe integration
│   ├── usage-tracker.ts          # Usage tracking
│   ├── permissions.ts            # RBAC logic
│   ├── encryption.ts             # Credential encryption
│   └── channels/                 # Channel adapters
│       ├── types.ts
│       ├── registry.ts
│       ├── web-adapter.ts
│       ├── whatsapp-adapter.ts   # Future
│       └── instagram-adapter.ts  # Future
│
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── register/route.ts
│   │   │   ├── refresh/route.ts
│   │   │   ├── forgot-password/route.ts
│   │   │   └── verify-email/route.ts
│   │   ├── billing/
│   │   │   ├── checkout/route.ts
│   │   │   └── portal/route.ts
│   │   ├── team/
│   │   │   ├── route.ts
│   │   │   └── invite/route.ts
│   │   ├── analytics/route.ts
│   │   ├── webhooks/route.ts
│   │   ├── export/route.ts
│   │   ├── handoff/route.ts
│   │   └── webhooks/
│   │       └── stripe/route.ts
│   │
│   ├── admin/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard
│   │   ├── clients/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── team/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── audit/page.tsx
│   │   ├── webhooks/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── organization/page.tsx
│   │       ├── notifications/page.tsx
│   │       └── privacy/page.tsx
│   │
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   │
│   └── manage/[id]/
│       ├── page.tsx
│       ├── handoffs/page.tsx
│       └── settings/page.tsx
│
├── emails/                        # React Email templates
│   ├── welcome.tsx
│   ├── invitation.tsx
│   ├── usage-alert.tsx
│   └── weekly-digest.tsx
│
└── components/
    ├── auth/
    │   ├── LoginForm.tsx
    │   ├── RegisterForm.tsx
    │   └── ProtectedRoute.tsx
    ├── billing/
    │   ├── PricingTable.tsx
    │   └── SubscriptionBadge.tsx
    ├── analytics/
    │   ├── Charts.tsx
    │   └── MetricCard.tsx
    └── ui/
        ├── DataTable.tsx
        ├── Pagination.tsx
        ├── SearchInput.tsx
        ├── ConfirmDialog.tsx
        └── EmptyState.tsx

supabase/
├── schema.sql
├── add_qa_pairs.sql
├── add_clients_datasources.sql
└── migrations/
    ├── 004_organizations_and_users.sql
    ├── 005_audit_and_analytics.sql
    └── 006_channels_and_webhooks.sql
```

---

## 🚀 Implementation Priority Matrix

```
                     HIGH IMPACT
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │  Authentication    │   Billing          │
    │  ★★★★★            │   ★★★★★            │
    │                    │                    │
    ├────────────────────┼────────────────────┤
    │                    │                    │
    │  Team Management   │   Analytics        │
    │  ★★★★             │   ★★★★             │
    │                    │                    │
LOW ├────────────────────┼────────────────────┤ HIGH
EFFORT│                   │                    │ EFFORT
    │  Audit Logging     │   White-Labeling   │
    │  ★★★★             │   ★★★              │
    │                    │                    │
    ├────────────────────┼────────────────────┤
    │                    │                    │
    │  Error Handling    │   Channel Adapter  │
    │  ★★★★★            │   ★★★              │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                     LOW IMPACT
```

---

## 📊 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first chatbot | < 5 minutes | From signup to embed |
| Widget load time | < 200ms | Lighthouse |
| API response time (p95) | < 500ms | APM tool |
| Uptime | 99.9% | Status page |
| Customer satisfaction | > 4.5/5 | In-app survey |
| Monthly churn | < 5% | Billing data |
| Support ticket resolution | < 4 hours | Help desk |
| Self-service rate | > 80% | Handoff analytics |

---

## 🛠️ Recommended Additional Dependencies

```json
{
  "dependencies": {
    "stripe": "^14.0.0",
    "@stripe/stripe-js": "^2.0.0",
    "lucia": "^3.0.0",
    "@lucia-auth/adapter-postgresql": "^3.0.0",
    "resend": "^2.0.0",
    "@react-email/components": "^0.0.12",
    "recharts": "^2.10.0",
    "@tremor/react": "^3.12.0",
    "zod": "^3.22.0",
    "uuid": "^9.0.0",
    "date-fns": "^3.0.0",
    "papaparse": "^5.4.0",
    "archiver": "^6.0.0",
    "ioredis": "^5.3.0"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.0",
    "@types/papaparse": "^5.3.0",
    "@types/archiver": "^6.0.0"
  }
}
```

---

## 📝 Summary

This enhancement plan transforms the RAG Chatbot Widget from a functional prototype into a **professional, enterprise-ready SaaS platform** with:

1. **🔒 Security** — Proper auth, RBAC, audit logging, encryption
2. **💰 Monetization** — Stripe billing, usage tracking, plan enforcement
3. **👥 Collaboration** — Team management, roles, notifications
4. **📊 Intelligence** — Analytics, A/B testing, sentiment analysis
5. **🎨 Customization** — White-labeling, custom domains, theming
6. **🔌 Extensibility** — Channel-agnostic architecture for WhatsApp, Instagram, and beyond
7. **⚖️ Compliance** — GDPR, data retention, export capabilities

**Estimated Timeline:** 12 weeks to full implementation
**Team Required:** 2-3 developers, 1 designer (part-time)

---

*Document Version: 1.0*
*Created: 2026-08-01*
*Status: Ready for Review*
