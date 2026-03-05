// ========================================
// Core Auth Types
// ========================================

export type UserRole = "guest" | "user" | "admin"
export type UserStatus = "pending" | "active" | "suspended"

// ========================================
// Account Center app_roles
// ========================================

export interface AppRoleEntry {
  roles: string[]
  permissions: string[]
}

export type AppRolesMap = Record<string, AppRoleEntry>

// ========================================
// Role Configuration (per-app)
// ========================================

export interface RoleConfig {
  /** e.g. { ADMIN: "eq.admin", USER: "eq.user" } */
  roleKeys: Record<string, string>
  /** e.g. { "eq.admin": "admin", "eq.user": "user" } */
  roleKeyToLocal: Record<string, UserRole>
  /** e.g. { "eq.admin": ["eq.asset.read", ...], "eq.user": [...] } */
  rolePermissions: Record<string, string[]>
  /** The PERMISSIONS const from the app */
  permissions: Record<string, string>
}

// ========================================
// Middleware Configuration
// ========================================

export interface MiddlewareConfig {
  /** true でロールチェック付き、false でセッション更新のみ */
  enableRoleCheck: boolean
  /** 認証不要なルート e.g. ["/login", "/no-access", "/auth/callback"] */
  publicRoutes: string[]
  /** ログインページのパス */
  loginPath: string
  /** アクセス権なしページのパス */
  noAccessPath: string
  /** admin ルートプレフィックス e.g. "/admin" */
  adminRoutePrefix?: string
  /** admin 以外のユーザーのフォールバック先 */
  userFallbackPath?: string
  /** ログイン後デフォルト遷移先 */
  defaultDashboardPath: string
  /** リダイレクト先ホワイトリスト (未指定なら全パス許可) */
  allowedRedirectPaths?: string[]
}

// ========================================
// Callback Configuration
// ========================================

export interface CallbackConfig {
  /** Account Center からロール同期するか */
  syncRole: boolean
  /** update vs upsert */
  useUpsert: boolean
  /** upsert 時の追加フィールド (email, display_name 等) */
  upsertFields?: boolean
  /** メンバーシップ同期するか */
  syncMemberships: boolean
  /** ログインページ */
  loginPath: string
  /** アクセス権なしページ */
  noAccessPath: string
  /** ログイン後デフォルト遷移先 */
  defaultDashboardPath: string
  /** admin 用ダッシュボードパス */
  adminDashboardPath?: string
}

// ========================================
// Guards Configuration
// ========================================

export interface GuardsConfig {
  loginPath: string
  noAccessPath: string
  /** admin 以外のユーザーのフォールバック先 */
  userFallbackPath?: string
}

// ========================================
// Memberships
// ========================================

export interface Memberships {
  companies: string[]
  organizations: string[]
}

// ========================================
// Permissions JSON (Account Center format)
// ========================================

export interface AppPermissionsJsonRole {
  key: string
  display_name: string
  description?: string
  permissions: string[]
}

export interface AppPermissionsJsonPermission {
  key: string
  display_name: string
  description?: string
  category?: string
}

export interface AppPermissionsJson {
  app_key: string
  version: string
  roles: AppPermissionsJsonRole[]
  permissions: AppPermissionsJsonPermission[]
}

// ========================================
// Permissions JSON Input (for buildPermissionsJson)
// ========================================

export interface PermissionsJsonInput {
  appKey: string
  version?: string
  roles: AppPermissionsJsonRole[]
  permissions: AppPermissionsJsonPermission[]
}

// ========================================
// useKeycloakLogin options
// ========================================

export interface UseKeycloakLoginOptions {
  /** OAuth redirect URL override. Defaults to {NEXT_PUBLIC_SITE_URL}/auth/callback */
  redirectUrl?: string
  /** OAuth scopes. Defaults to "openid profile email" */
  scopes?: string
  /** Callback path. Defaults to "/auth/callback" */
  callbackPath?: string
}

export interface UseKeycloakLoginReturn {
  login: (redirectTo?: string) => Promise<void>
  isLoading: boolean
  error: string | null
}

// ========================================
// Tenant Cache
// ========================================

export interface TenantInfo {
  id: string
  name: string
  type: "company" | "organization"
  slug?: string | null
  status?: string | null
  parentId?: string | null
}

// ========================================
// User Memberships
// ========================================

export interface MembershipEntry {
  id: string
  user_id: string
  scope_type: "company" | "organization"
  scope_id: string
  synced_at: string
}

export interface UserMemberships {
  companies: { scope_id: string; name: string }[]
  organizations: { scope_id: string; name: string }[]
}

// ========================================
// Audit Logs
// ========================================

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogRecord {
  action: string
  table_name: string
  record_id?: string | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
}

export interface AuditLogFilters {
  user_id?: string
  action?: string
  table_name?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

// ========================================
// Tenant Sync Configuration
// ========================================

export interface TenantSyncConfig {
  /** Account Center の URL (e.g. https://account.example.com) */
  accountCenterUrl: string
  /** API 認証キー */
  apiKey: string
  /** アプリケーションキー (e.g. "equipment") */
  appKey: string
  /**
   * tenant_cache 同期完了後に呼ばれるコールバック。
   * Account Center API の生レスポンスと admin client を受け取り、
   * アプリ固有の追加データ（member_count, lead_name 等）を処理できる。
   */
  onAfterSync?: (context: TenantSyncContext) => Promise<void>
}

export interface TenantSyncContext {
  /** Account Center API から取得した企業一覧（organizations 含む生データ） */
  companies: AccountCenterCompany[]
  /** Service Role の Supabase クライアント */
  adminClient: import("@supabase/supabase-js").SupabaseClient
}

export interface AccountCenterCompany {
  id: string
  name: string
  slug: string
  status: string
  organizations: AccountCenterOrganization[]
  /** API レスポンスに含まれるその他のフィールド */
  [key: string]: unknown
}

export interface AccountCenterOrganization {
  id: string
  name: string
  company_id: string
  parent_id?: string | null
  /** API レスポンスに含まれるその他のフィールド */
  [key: string]: unknown
}
