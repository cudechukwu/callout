# Five-Star MMA: Engineering Stack Selection

**Purpose:** Specific technology choices (separate from product design)  
**Date:** Week 0 Lock  
**Maintenance:** Update as dependencies change  

---

## Frontend

| Layer | Technology | Version | Rationale |
|-------|---|---|---|
| Framework | Next.js | 16.3 LTS | Stable, vercel hosting, SSR for social cards |
| Language | TypeScript | 5.6+ | Type safety for shared types |
| UI Library | React | 19.3+ | Latest stable |
| Styling | Tailwind CSS | 4.0+ | Rapid iteration, design consistency |
| Animation | Framer Motion | 11.0+ | Micro-interactions (optional, add if performance allows) |
| State | React hooks + Context | — | No Redux; keep it simple |
| Forms | React Hook Form | 7.51+ | Lightweight, validation |

**Why this stack:**
- Fast iteration
- Excellent TypeScript support
- Built-in API routes (backend separation optional)
- Vercel deployment native
- Tailwind for rapid design iteration

---

## Backend

| Layer | Technology | Version | Rationale |
|-------|---|---|---|
| Runtime | Node.js | 20.x LTS | Stable, widely supported |
| API | Next.js API Routes | 16+ | Colocated with frontend, simple |
| Language | TypeScript | 5.6+ | Shared types with frontend |

**Why:**
- Keep backend minimal (game is client-light)
- API routes sufficient for MVP
- Database is the primary backend responsibility

---

## Database & ORM

| Layer | Technology | Version | Rationale |
|-------|---|---|---|
| Database | PostgreSQL | 15+ | Stable, JSONB support, excellent at transactions |
| Hosting | Supabase (managed) | Latest | No infrastructure management, built-in auth (if we use it later) |
| ORM | Prisma | 5.8+ | Type-safe, schema-first, excellent migrations |

**Why Supabase over self-hosted:**
- No ops burden
- Row-level security (future)
- Backup/recovery built-in
- Reasonable pricing at scale

**SQL specifics:**
- TIMESTAMPTZ for all timestamps
- Use explicit indexes (CREATE INDEX separately, not inline)
- Enums for result_method, attribute_name
- JSONB for snapshots
- BIGINT for seeds

---

## Authentication

| Layer | Technology | Rationale |
|---|---|---|
| OAuth provider | Auth.js (nextauth) | No password management, clean OAuth flow |
| Methods | Google, Apple | Frictionless signup |
| Session | HTTP-only cookies | Secure by default |

**Why Auth.js over Supabase Auth:**
- More flexible (can swap providers)
- Industry standard
- Good TypeScript support
- Simple to test

**Initial scope:**
- No email magic links (add in v1.1 if needed)
- No custom password (not for MVP)

---

## Random Number Generation

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Seeded RNG | seedrandom | 3.0+ | Well-tested, deterministic, small |

**Usage:**
```typescript
import seedrandom from 'seedrandom';

const rng = seedrandom(seed.toString());
const randomValue = rng(); // 0.0–1.0
```

**Why not hardcode:**
- Defined as interface RNG { next(): number }
- Can swap implementations later
- Abstraction layer prevents coupling

---

## Image Generation (For Social Cards)

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Server-side rendering | sharp | 0.33+ | Fast, lightweight |
| SVG-to-PNG | satori | 0.10+ | Render React to image (optional, if needed) |
| Storage | Vercel Blob | Latest | Cheap, integrated with Vercel |

**Implementation approach:**
- Generate fighter card as HTML
- Screenshot with sharp/puppeteer (if needed)
- OR use satori (React → PNG)
- Cache in Vercel Blob

**Avoid:** Hosting large image libraries; generate on-the-fly.

---

## Analytics & Monitoring

| Tool | Purpose | Setup | Status |
|---|---|---|---|
| PostHog | Product analytics | npm install posthog-js | **MANDATORY** |
| Sentry | Error tracking | npm install @sentry/nextjs | **MANDATORY** |

**PostHog config:**
```typescript
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
  api_host: 'https://us.posthog.com',
});
```

**Sentry config:**
```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

**Why both:**
- PostHog: User behavior, funnels, retention
- Sentry: Crash reporting, exceptions

**Cannot be removed later.** These are non-optional for measuring MVP success.

---

## Email (Future, Not MVP)

| Component | Service | When | Rationale |
|---|---|---|---|
| Transactional email | Resend | v1.1+ | Password resets, notifications |

**Skip for MVP.** Add only when needed.

---

## Hosting & Deployment

| Component | Platform | Rationale |
|---|---|---|
| Frontend + API | Vercel | Native Next.js support, auto-preview deploys |
| Database | Supabase | Managed PostgreSQL |
| Blob storage | Vercel Blob | Image cache, integrated |
| Environment secrets | Vercel dashboard | No local .env on prod |

**Deployment flow:**
```
Git push → GitHub webhook → Vercel auto-deploy
  ↓ (production)
  Main branch → Vercel Production
  ↓ (preview)
  PR branch → Vercel Preview
```

**Database migrations:**
```
npx prisma migrate dev (local development)
npx prisma migrate deploy (production, via Vercel build step)
```

---

## Development Environment

### Local Setup

```bash
# Node version
nvm use 20

# Install dependencies
npm install

# Environment variables
cp .env.example .env.local
# Fill in:
#   DATABASE_URL (local postgres or Supabase)
#   NEXT_PUBLIC_POSTHOG_KEY
#   SENTRY_DSN (optional, errors still work without)

# Database schema
npx prisma migrate dev

# Run dev server
npm run dev
```

### Code Quality (Optional)

```bash
npm install --save-dev eslint prettier
npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Later: Add pre-commit hooks with husky
```

**Don't over-engineer this.** TypeScript + Prettier is enough for MVP.

---

## Testing Strategy

| Layer | Tool | Scope | When |
|---|---|---|---|
| Simulation | Jest | 100k battle harness | Week 1 |
| API | Jest + Supertest | Fight creation, rating updates | Week 2 |
| Frontend | None initially | Manual testing only | v1.1+ |

**No E2E tests in MVP.** Manual testing is fine.

---

## Performance Targets

| Metric | Target | Tool |
|---|---|---|
| Landing → Build start | <2s | Vercel Analytics |
| Build completion time | <1s | PostHog event timing |
| Fight simulation | Instant (server-side) | N/A |
| Draft reveal latency | <500ms | PostHog event timing |
| First Contentful Paint | <2.5s | Vercel Analytics |

**Monitor with PostHog custom events:**
```typescript
posthog.capture('build_completed', {
  duration_ms: endTime - startTime,
  attribute_count: 8,
});
```

---

## Security

| Concern | Mitigation |
|---|---|
| API replay attacks | Idempotency keys on fight creation |
| Client spoofing | All game logic server-side (no trusted client state) |
| Rating manipulation | Rate limiting (5 fights/player/day ranked max) |
| Session hijacking | HTTP-only cookies (Auth.js default) |
| SQL injection | Prisma ORM (parameterized queries) |

**No need for:** WAF, DDoS protection, encryption (HTTPS is automatic).

---

## Dependencies: Lock Strategy

**package.json caret ranges:**

```json
{
  "next": "^16.3.0",
  "react": "^19.0.0",
  "prisma": "^5.8.0",
  "@prisma/client": "^5.8.0",
  "auth.js": "^0.27.0",
  "seedrandom": "^3.0.5",
  "sharp": "^0.33.0",
  "posthog-js": "^1.197.0",
  "@sentry/nextjs": "^8.0.0"
}
```

**Strategy:**
- Caret ranges (^) for most dependencies (allow patch + minor updates)
- Lock file (package-lock.json) in git
- Weekly `npm outdated` check (but don't auto-update)
- Major version upgrades: explicit decision

**Why caret not exact pinning:**
- Caret allows patch security fixes automatically
- Exact pinning leads to stale dependencies

---

## Dependency Audit

**Before each release:**

```bash
npm audit
npm outdated
```

**Create GitHub issues for outdated deps.**

**Action rule:**
- Security fixes: immediate
- Minor updates: monthly review
- Major updates: quarterly evaluation

---

## Cost Estimates (First Month)

| Service | Usage | Cost |
|---|---|---|
| Vercel (Pro) | ~50GB bandwidth | $20/mo |
| Supabase | ~50k rows, 1GB storage | $25/mo |
| PostHog | ~100k events | $0 (free tier) |
| Sentry | ~100 errors | $0 (free tier) |
| Total | — | ~$45/mo |

**Will grow to $100–500/mo at scale (1M+ requests/mo).**

---

## No Technologies Excluded (But Considered & Rejected)

| What | Why not |
|---|---|
| Redux | Over-engineered for this state model |
| GraphQL | REST API sufficient; adds complexity |
| Kubernetes | Vercel + Supabase handle scaling |
| Redis cache | Database + Vercel Edge sufficient for MVP |
| Websockets | Async architecture doesn't need real-time |
| React Native | Focus on web first; mobile-responsive web sufficient |
| Stripe | No payments yet (future v2) |
| Discord webhooks | Keep feedback in-app initially |

---

## Migration Path to Scale

If the product works, you'll eventually need:

```
Week 1–8 (MVP)
  → This stack

Week 9–16 (Private beta, 100s users)
  → Same stack, monitor performance

Week 17–24 (Public beta, 1000s users)
  → Consider: Redis cache layer
            → Edge function for fight simulation
            → Websocket notifications (if social features grow)

Week 25+ (Mature product, 10k+ users)
  → Consider: Dedicated game servers (for live tournaments)
            → Real-time multiplayer (Websocket/Socket.io)
            → CDN for static assets
            → Analytics warehouse (BigQuery/Snowflake)
```

**Don't plan for this yet.** It's a good problem to have.

---

## Stack Summary (One Line)

**Next.js + TypeScript + PostgreSQL + Supabase + Auth.js + PostHog + Sentry.**

Simple. Proven. Scales to 10k+ users. 

---

**Version:** 1.0  
**Last Updated:** Week 0  
**Next Review:** After Week 1 implementation

**Important:** This document describes tools, not decisions. Architectural decisions live in LOCKED_DECISIONS.md.
