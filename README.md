# @inta/auth

Next.js + Supabase アプリ向けの認証・セッション管理・ロール解決ライブラリ。

ファクトリパターンにより、アプリ固有のロール定義やルーティング設定を注入するだけで利用できる。

## セットアップ

### 1. git submodule として追加

```bash
git submodule add https://github.com/RyukyuInteractive/v0-auth.git packages/auth
```

### 2. package.json に依存追加

```json
{
  "dependencies": {
    "@inta/auth": "file:packages/auth"
  }
}
```

### 3. next.config に transpilePackages 追加

```js
const nextConfig = {
  transpilePackages: ["@inta/auth"],
}
```

ビルドステップは不要。TypeScript ソースを直接 export し、各アプリの Next.js がトランスパイルする。

## Export パス一覧

| パス | 内容 | 環境 |
|---|---|---|
| `@inta/auth` | 型の re-export | 共通 |
| `@inta/auth/client` | `createClient` — ブラウザ用 Supabase | Client |
| `@inta/auth/server` | `createClient` — サーバー用 Supabase | Server |
| `@inta/auth/admin` | `createAdminClient` — Service Role Supabase | Server |
| `@inta/auth/middleware` | `createAuthMiddleware` — セッション更新 + RBAC | Middleware |
| `@inta/auth/callback` | `createCallbackHandler` — OAuth コールバック | Server |
| `@inta/auth/resolve` | `createPermissionResolver` — ロール解決 | 共通 |
| `@inta/auth/permissions` | `buildPermissionsJson` — permissions.json 組み立て | Server |
| `@inta/auth/permissions-handler` | `createPermissionsHandler` — API エンドポイント | Server |
| `@inta/auth/guards` | `createAuthGuards` — サーバーサイド認証ガード | Server |
| `@inta/auth/hooks` | `useKeycloakLogin` — OAuth 開始フック | Client |
| `@inta/auth/repositories` | profiles / memberships / tenant_cache / audit_logs クエリ関数 | Server |
| `@inta/auth/api` | `createTenantSyncHandler` — テナント同期 API | Server |

## 使い方

### アプリ固有設定の定義

各アプリで `lib/auth-config.ts` を作成し、ロール定義とルーティング設定を記述する:

```typescript
// lib/auth-config.ts
import type { RoleConfig, MiddlewareConfig, CallbackConfig, GuardsConfig } from "@inta/auth"

export const roleConfig: RoleConfig = {
  roleKeys: { ADMIN: "myapp.admin", USER: "myapp.user" },
  roleKeyToLocal: { "myapp.admin": "admin", "myapp.user": "user" },
  rolePermissions: {
    "myapp.admin": ["myapp.read", "myapp.manage", /* ... */],
    "myapp.user": ["myapp.read"],
  },
  permissions: { READ: "myapp.read", MANAGE: "myapp.manage" },
}

export const middlewareConfig: MiddlewareConfig = {
  enableRoleCheck: true,
  publicRoutes: ["/login", "/no-access", "/auth/callback"],
  loginPath: "/login",
  noAccessPath: "/no-access",
  adminRoutePrefix: "/admin",
  userFallbackPath: "/dashboard",
  defaultDashboardPath: "/dashboard",
}

export const callbackConfig: CallbackConfig = {
  syncRole: true,
  useUpsert: false,
  syncMemberships: false,
  loginPath: "/login",
  noAccessPath: "/no-access",
  defaultDashboardPath: "/dashboard",
  adminDashboardPath: "/admin",
}

export const guardsConfig: GuardsConfig = {
  loginPath: "/login",
  noAccessPath: "/no-access",
  userFallbackPath: "/dashboard",
}
```

### ミドルウェア

```typescript
// middleware.ts
import { createAuthMiddleware } from "@inta/auth/middleware"
import { middlewareConfig } from "@/lib/auth-config"

const updateSession = createAuthMiddleware(middlewareConfig)

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

`enableRoleCheck: false` にするとセッション更新のみ（ロールチェックなし）になる。

### OAuth コールバック

```typescript
// app/auth/callback/route.ts
import { createCallbackHandler } from "@inta/auth/callback"
import { createPermissionResolver } from "@inta/auth/resolve"
import { roleConfig, callbackConfig } from "@/lib/auth-config"

const { resolveLocalRole } = createPermissionResolver(roleConfig)

export const GET = createCallbackHandler(roleConfig, resolveLocalRole, callbackConfig)
```

### サーバーサイド認証ガード

```typescript
// lib/auth.ts
import { createAuthGuards } from "@inta/auth/guards"
import { roleConfig, guardsConfig } from "@/lib/auth-config"

export const {
  getSession,
  getUser,
  getProfile,
  requireAuth,
  requireRole,
  requireAdmin,
  requireUser,
  getPermissionsForRole,
  roleHasPermission,
} = createAuthGuards(roleConfig, guardsConfig)
```

Server Component での使用:

```typescript
export default async function AdminPage() {
  const profile = await requireAdmin()
  return <div>Admin: {profile.email}</div>
}
```

### ログインフック

```tsx
// components/auth/login-form.tsx
"use client"
import { useKeycloakLogin } from "@inta/auth/hooks"

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const { login, isLoading, error } = useKeycloakLogin()

  return (
    <button onClick={() => login(redirectTo)} disabled={isLoading}>
      {isLoading ? "ログイン中..." : "ログイン"}
    </button>
  )
}
```

### Permissions JSON エンドポイント

```typescript
// app/.well-known/permissions.json/route.ts
import { createPermissionsHandler } from "@inta/auth/permissions-handler"
import { buildPermissionsJson } from "@inta/auth/permissions"

export const GET = createPermissionsHandler(() =>
  buildPermissionsJson({
    appKey: "my-app",
    roles: [
      { key: "myapp.admin", display_name: "管理者", permissions: ["myapp.read", "myapp.manage"] },
      { key: "myapp.user", display_name: "ユーザー", permissions: ["myapp.read"] },
    ],
    permissions: [
      { key: "myapp.read", display_name: "閲覧", category: "データ" },
      { key: "myapp.manage", display_name: "管理", category: "データ" },
    ],
  })
)
```

`x-permissions-api-key` ヘッダーと `PERMISSIONS_API_KEY` 環境変数で認証される。

### Supabase クライアント (re-export)

既存の import パスを維持するため、各アプリで re-export する:

```typescript
// lib/supabase/client.ts
export { createClient } from "@inta/auth/client"

// lib/supabase/server.ts
export { createClient } from "@inta/auth/server"

// lib/supabase/admin.ts
export { createAdminClient } from "@inta/auth/admin"
```

### リポジトリ関数

profiles / memberships / tenant_cache / audit_logs への共通クエリ関数。`SupabaseClient` を引数に取るため、アプリ側で admin client を渡して使用する。

```typescript
import { createAdminClient } from "@inta/auth/admin"
import {
  getProfile, updateProfile, upsertProfile,
  getUserMemberships, syncMemberships,
  getTenantCache, getTenantById, syncTenantCache,
  insertAuditLog, getAuditLogs,
} from "@inta/auth/repositories"

const admin = createAdminClient()

// プロフィール取得
const profile = await getProfile(admin, userId)

// テナントキャッシュ取得（companies / organizations に分類済み）
const { companies, organizations } = await getTenantCache(admin)

// 所属情報取得（テナント名つき）
const memberships = await getUserMemberships(admin, userId)

// 監査ログ挿入
await insertAuditLog(admin, userId, {
  action: "update",
  table_name: "assets",
  record_id: assetId,
  old_values: oldData,
  new_values: newData,
})

// 監査ログ検索
const logs = await getAuditLogs(admin, {
  table_name: "assets",
  from: "2025-01-01T00:00:00Z",
  limit: 50,
})
```

### テナント同期 API

Account Center から企業・組織情報を取得して tenant_cache テーブルに同期する共通エンドポイント。admin 権限が必要。

```typescript
// app/api/admin/tenants/sync/route.ts
import { createTenantSyncHandler } from "@inta/auth/api"

export const POST = createTenantSyncHandler({
  accountCenterUrl: process.env.ACCOUNT_CENTER_URL!,
  apiKey: process.env.PERMISSIONS_API_KEY!,
  appKey: process.env.APP_KEY!,
})
```

### マイグレーションテンプレート

`migrations/` ディレクトリに共通テーブルのテンプレート SQL を提供:

| ファイル | 内容 |
|---|---|
| `00001_profiles.sql` | profiles テーブル + ENUM型 + `handle_new_user` トリガー + `is_admin()` / `is_active_user()` ヘルパー + RLS |
| `00002_user_memberships.sql` | user_memberships テーブル + `get_user_company_ids()` / `get_user_organization_ids()` ヘルパー + RLS |
| `00003_tenant_cache.sql` | tenant_cache テーブル + RLS |
| `00004_audit_logs.sql` | audit_logs テーブル + RLS |

各アプリの Supabase マイグレーションに必要なテンプレートをコピーして利用する。アプリ固有のカラムが必要な場合は `ALTER TABLE` で追加すること。

## 設定リファレンス

### MiddlewareConfig

| プロパティ | 型 | 説明 |
|---|---|---|
| `enableRoleCheck` | `boolean` | `false` でセッション更新のみ、`true` で RBAC 付き |
| `publicRoutes` | `string[]` | 認証不要なルート |
| `loginPath` | `string` | ログインページのパス |
| `noAccessPath` | `string` | アクセス権なしページのパス |
| `adminRoutePrefix` | `string?` | admin ルートのプレフィックス |
| `userFallbackPath` | `string?` | user が admin ルートにアクセスした時のリダイレクト先 |
| `defaultDashboardPath` | `string` | ログイン後のデフォルト遷移先 |
| `allowedRedirectPaths` | `string[]?` | リダイレクト先ホワイトリスト（未指定で全パス許可） |

### CallbackConfig

| プロパティ | 型 | 説明 |
|---|---|---|
| `syncRole` | `boolean` | Account Center から userinfo 経由でロールを同期するか |
| `useUpsert` | `boolean` | `true` で upsert（プロフィール自動作成）、`false` で update のみ |
| `upsertFields` | `boolean?` | upsert 時に email, display_name, avatar_url も含めるか |
| `syncMemberships` | `boolean` | メンバーシップ（companies/organizations）を同期するか |
| `loginPath` | `string` | エラー時のリダイレクト先 |
| `noAccessPath` | `string` | guest ロールのリダイレクト先 |
| `defaultDashboardPath` | `string` | ログイン後のデフォルト遷移先 |
| `adminDashboardPath` | `string?` | admin ロールの遷移先（未指定で defaultDashboardPath） |

### GuardsConfig

| プロパティ | 型 | 説明 |
|---|---|---|
| `loginPath` | `string` | 未認証時のリダイレクト先 |
| `noAccessPath` | `string` | プロフィール取得失敗・guest 時のリダイレクト先 |
| `userFallbackPath` | `string?` | 許可されていないロールのリダイレクト先 |

## 環境変数

各アプリで以下の環境変数が必要:

```
NEXT_PUBLIC_SUPABASE_URL=         # Supabase プロジェクト URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase Anon キー
SUPABASE_SERVICE_ROLE_KEY=        # Service Role キー（admin client 用）
ACCOUNT_CENTER_URL=               # Account Center URL（callback のロール同期用）
NEXT_PUBLIC_SITE_URL=             # サイト URL（OAuth リダイレクト用）
PERMISSIONS_API_KEY=              # permissions.json エンドポイントの API キー
```

## submodule の更新

ライブラリ更新時、各アプリで:

```bash
cd packages/auth
git pull origin main
cd ../..
git add packages/auth
git commit -m "chore: update @inta/auth submodule"
```

## 開発

```bash
pnpm install
pnpm type-check   # tsc --noEmit
```
