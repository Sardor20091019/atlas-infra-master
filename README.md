# Atlas Infra

An interactive, full-stack atlas of real-world infrastructure architectures.

Explore layered reference topologies, step through architectural evolution from 1k to 10M users, trace request paths hop-by-hop, author diagrams visually or in live-validated YAML, and collaborate across personal and company workspaces.

## Monorepo Architecture

```
atlas-infra/
├── apps/
│   ├── web/              # Vite + React + TypeScript (@xyflow/react, elkjs, zustand)
│   └── api/              # NestJS + Kysely + PostgreSQL backend (Auth, RBAC, CRUD)
├── packages/
│   └── shared/           # DSL types, Zod schemas, parser/validator, stage engine,
│                         # reference architectures, access-control policy & DTOs
├── docker-compose.yml    # Local PostgreSQL 16 service
└── pnpm-workspace.yaml
```

## Prerequisites

- **Node.js** `>= 22`
- **pnpm** `>= 10`
- **PostgreSQL 16+** (via Docker Compose or local PostgreSQL installation)
- **Google Cloud OAuth 2.0 credentials** (for Google sign-in; guest exploration & local draft editing work even without Google OAuth configured)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` at the repository root:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Default / Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://atlas:atlas@localhost:5432/atlas_infra` |
| `PORT` | NestJS API port | `4001` |
| `FRONTEND_URL` | Frontend origin for OAuth redirects | `http://localhost:5173` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `http://localhost:5173` |
| `JWT_ACCESS_SECRET` | HS256 secret for 15m access cookies | Long random string |
| `JWT_REFRESH_SECRET` | HS256 secret for 7d refresh cookies | Long random string |
| `OAUTH_STATE_SECRET` | HS256 secret for OAuth CSRF state cookie | Long random string |
| `COOKIE_SAME_SITE` | `lax` (same-site dev) or `none` (cross-origin HTTPS) | `lax` |
| `COOKIE_SECURE` | `false` for local HTTP, `true` for HTTPS | `false` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-...` |
| `GOOGLE_CALLBACK_URL` | Authorized redirect URI in Google Cloud Console | `http://localhost:5173/api/auth/google/callback` |

> **Google Cloud Console setup**: Create an OAuth 2.0 Web Application client and add `http://localhost:5173/api/auth/google/callback` (which Vite proxies to `/api/auth/google/callback` on the NestJS server) as an Authorized Redirect URI.

### 3. Start PostgreSQL, Run Migrations & Seed Reference Architectures

Start Postgres via Docker Compose (or use your own Postgres instance):

```bash
docker compose up -d postgres
```

Run Kysely database migrations and seed the built-in reference architectures (`web-evolution`, `simple-web-app`, `k8s-prod-cluster`, `three-tier-network`):

```bash
pnpm db:migrate
pnpm db:seed
```

### 4. Run Development Servers, Tests & Build

```bash
# Build shared package and run web + api dev servers concurrently
pnpm dev

# Run all tests (DSL parser/edit/stages, access-control, API integration, web store)
pnpm test

# Typecheck, lint, and build all workspace packages
pnpm typecheck
pnpm lint
pnpm build
```

- Frontend (`apps/web`): `http://localhost:5173` (proxies `/api/*` to `http://localhost:4001`)
- Backend (`apps/api`): `http://localhost:4001/api`

## Deploy on Vercel

This repository is pre-configured for **one-project full-stack Vercel deployment** via [vercel.json](./vercel.json) and [api/index.ts](./api/index.ts) (serving `apps/web/dist` and routing `/api/*` to the NestJS serverless handler on the same origin so `HttpOnly` cookies work without CORS issues).

1. **Import the GitHub repo** in Vercel (keep the Root Directory as `.` — Vercel reads `vercel.json` automatically).
2. **Add Environment Variables** in Vercel Project Settings:
   - `DATABASE_URL` — your Neon PostgreSQL connection string
   - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL` — `https://<your-vercel-domain>/api/auth/google/callback`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OAUTH_STATE_SECRET` — long random strings
   - Optional: `FRONTEND_URL=https://<your-vercel-domain>` (auto-detected from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` if omitted)
3. **Register the Redirect URI** in Google Cloud Console:
   - `https://<your-vercel-domain>/api/auth/google/callback`
4. **Migrate & seed** your production Postgres once (already done if pointing to the same Neon DB):
   ```bash
   pnpm db:migrate && pnpm db:seed
   ```

## API Endpoints Overview

- **Auth (`/api/auth`)**:
  - `GET /api/auth/google` — Redirect to Google OAuth 2.0 consent screen with HMAC state cookie
  - `GET /api/auth/google/callback` — Exchange code, upsert user, set `HttpOnly` access & refresh cookies
  - `GET /api/auth/me` — Current authenticated user (`401` if unauthenticated)
  - `POST /api/auth/refresh` — Refresh access cookie from `HttpOnly` refresh cookie
  - `PATCH /api/auth/active-company` — Switch active company workspace scope
  - `POST /api/auth/logout` — Clear session cookies
- **Companies (`/api/companies`)**:
  - `POST /api/companies` — Create company (creator becomes `owner`)
  - `GET /api/companies` — List companies the user belongs to with role & member count
  - `GET /api/companies/:id` & `PATCH /api/companies/:id` — View/edit company (`owner` or `admin` only)
  - `DELETE /api/companies/:id` — Delete company (`owner` only)
  - `GET/POST/PATCH/DELETE /api/companies/:id/members` — Manage members (`owner` or `admin` only; protects last `owner`)
- **Architectures (`/api/architectures`)**:
  - `GET /api/architectures` — List public/reference + user-owned + member-company architectures
  - `GET /api/architectures/:idOrSlug` — Read architecture with computed permissions
  - `POST /api/architectures` — Create personal or company architecture (server-validated YAML/DSL)
  - `PATCH /api/architectures/:id` — Update architecture (`owner`, system `admin`, or company `owner`/`admin`/`editor`)
  - `DELETE /api/architectures/:id` — Delete architecture (`owner`, system `admin`, or company `owner`/`admin`)

## License

MIT
