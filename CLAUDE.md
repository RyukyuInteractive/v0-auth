# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@inta/auth` — shared authentication library for Next.js + Supabase apps. Distributed as a git submodule consumed via `transpilePackages` (no build step). Uses factory pattern with dependency injection so apps provide their own role definitions and routing config.

## Commands

```bash
pnpm install        # install dependencies
pnpm type-check     # tsc --noEmit (the only validation — no tests, no linter)
```

## Architecture

### Factory Pattern

Every module exports a factory function that accepts app-specific config and returns bound implementations:

- `createAuthMiddleware(config)` → Next.js middleware handler
- `createCallbackHandler(roleConfig, resolveLocalRole, config)` → OAuth GET handler
- `createAuthGuards(roleConfig, config)` → cached auth guard functions
- `createPermissionResolver(roleConfig)` → role/permission resolver
- `createPermissionsHandler(builder)` → permissions.json endpoint handler
- `createTenantSyncHandler(config)` → tenant sync POST handler

### Environment Boundaries

Files enforce their execution environment via directives:
- `"use client"` — `client.ts`, `hooks/use-keycloak-login.ts` (browser only)
- `"server-only"` import — `server.ts`, `admin.ts`, `guards.ts`, `callback.ts`, `permissions-handler.ts`, `repositories.ts`, `api.ts`

### Export Paths

Each path in `package.json` `"exports"` maps to a single TypeScript source file under `src/`. The root export (`@inta/auth`) re-exports only types from `types.ts`.

### Repository Functions (`src/repositories.ts`)

All repository functions take `SupabaseClient` as the first argument (dependency injection pattern). RLS バイパスが必要な操作が多いため、通常は admin client (`createAdminClient()`) を渡す。

- `getProfile(supabase, userId)` / `updateProfile(...)` / `upsertProfile(...)`
- `getUserMemberships(supabase, userId)` — returns memberships with tenant names resolved from `tenant_cache`
- `syncMemberships(supabase, userId, memberships)`
- `getTenantCache(supabase)` — returns `{ companies, organizations }` grouped
- `getTenantById(supabase, tenantId)` / `syncTenantCache(supabase, tenants)`
- `insertAuditLog(supabase, userId, record)` / `getAuditLogs(supabase, filters?)`

### Role Model

Three local roles: `"guest" | "user" | "admin"`. Apps map Account Center `app_roles` to these via `RoleConfig.roleKeyToLocal`. The callback handler fetches userinfo from Account Center, resolves the local role, and syncs it to the `profiles` table.

### Key Flows

**Middleware** (`middleware.ts`): Refreshes Supabase session cookies → optionally checks role from `profiles` table → redirects based on role and route.

**OAuth Callback** (`callback.ts`): Exchanges code for session → fetches Account Center userinfo → resolves role → upserts/updates profile → optionally syncs memberships → redirects.

**Guards** (`guards.ts`): Server Component utilities using React `cache()` for request-level dedup. Provides `requireAuth()`, `requireAdmin()`, `requireUser()`, `getProfile()`, etc.

### Migration Templates (`migrations/`)

SQL templates for common tables apps need:
- `00001_profiles.sql` — ENUM types, `handle_new_user` trigger, `is_admin()` / `is_active_user()` helpers, RLS
- `00002_user_memberships.sql` — tenant scoping helpers (`get_user_company_ids()` / `get_user_organization_ids()`), RLS
- `00003_tenant_cache.sql` — company/organization cache, RLS
- `00004_audit_logs.sql` — unified audit log schema, RLS

### Consuming App Integration

Apps create `lib/auth-config.ts` with `RoleConfig`, `MiddlewareConfig`, `CallbackConfig`, `GuardsConfig`, then wire them into:
1. `middleware.ts` — `createAuthMiddleware(middlewareConfig)`
2. `app/auth/callback/route.ts` — `createCallbackHandler(...)`
3. `lib/auth.ts` — destructure from `createAuthGuards(...)`
4. Client components — `useKeycloakLogin()` from `@inta/auth/hooks`

## Conventions

- TypeScript strict mode. All types defined in `src/types.ts`.
- No build output — apps transpile this package directly via Next.js `transpilePackages: ["@inta/auth"]`.
- Japanese comments in source code and README.
- Package manager: pnpm.
