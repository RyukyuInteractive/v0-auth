import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  UserRole,
  UserStatus,
  TenantInfo,
  UserMemberships,
  AuditLogEntry,
  AuditLogRecord,
  AuditLogFilters,
} from "./types"

// ========================================
// Profiles
// ========================================

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: UserRole; status: UserStatus } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single()
  return data as { role: UserRole; status: UserStatus } | null
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<{ role: UserRole; status: UserStatus; display_name: string; email: string }>
) {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
  if (error) throw error
}

export async function upsertProfile(
  supabase: SupabaseClient,
  userId: string,
  data: {
    email: string
    display_name?: string | null
    avatar_url?: string | null
    role?: UserRole
    status?: UserStatus
  }
) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...data }, { onConflict: "id" })
  if (error) throw error
}

// ========================================
// User Memberships
// ========================================

/**
 * Get a user's memberships with tenant names resolved from tenant_cache.
 */
export async function getUserMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<UserMemberships> {
  const [{ data: memberships }, { data: tenantCache }] = await Promise.all([
    supabase
      .from("user_memberships")
      .select("scope_type, scope_id")
      .eq("user_id", userId),
    supabase.from("tenant_cache").select("id, type, name"),
  ])

  const nameMap = new Map<string, string>()
  for (const t of tenantCache ?? []) {
    nameMap.set(t.id, t.name)
  }

  const companies = (memberships ?? [])
    .filter((m) => m.scope_type === "company")
    .map((m) => ({
      scope_id: m.scope_id,
      name: nameMap.get(m.scope_id) ?? m.scope_id,
    }))

  const organizations = (memberships ?? [])
    .filter((m) => m.scope_type === "organization")
    .map((m) => ({
      scope_id: m.scope_id,
      name: nameMap.get(m.scope_id) ?? m.scope_id,
    }))

  return { companies, organizations }
}

/**
 * Sync memberships for a user (delete all, then insert).
 */
export async function syncMemberships(
  supabase: SupabaseClient,
  userId: string,
  memberships: { companies: string[]; organizations: string[] }
) {
  await supabase.from("user_memberships").delete().eq("user_id", userId)

  const rows = [
    ...memberships.companies.map((id) => ({
      user_id: userId,
      scope_type: "company" as const,
      scope_id: id,
    })),
    ...memberships.organizations.map((id) => ({
      user_id: userId,
      scope_type: "organization" as const,
      scope_id: id,
    })),
  ]

  if (rows.length > 0) {
    const { error } = await supabase.from("user_memberships").insert(rows)
    if (error) throw error
  }
}

// ========================================
// Tenant Cache
// ========================================

/**
 * Get all tenants from tenant_cache, grouped by type.
 */
export async function getTenantCache(
  supabase: SupabaseClient
): Promise<{ companies: TenantInfo[]; organizations: TenantInfo[] }> {
  const { data } = await supabase
    .from("tenant_cache")
    .select("id, type, name, slug, status, parent_id")
    .order("name")

  if (!data) return { companies: [], organizations: [] }

  const companies: TenantInfo[] = []
  const organizations: TenantInfo[] = []

  for (const row of data) {
    const info: TenantInfo = {
      id: row.id,
      name: row.name,
      type: row.type as "company" | "organization",
      slug: row.slug,
      status: row.status,
      parentId: row.parent_id,
    }

    if (row.type === "company") {
      companies.push(info)
    } else {
      organizations.push(info)
    }
  }

  return { companies, organizations }
}

/**
 * Get a single tenant by ID from tenant_cache.
 */
export async function getTenantById(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantInfo | null> {
  const { data } = await supabase
    .from("tenant_cache")
    .select("id, type, name, slug, status, parent_id")
    .eq("id", tenantId)
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    type: data.type as "company" | "organization",
    slug: data.slug,
    status: data.status,
    parentId: data.parent_id,
  }
}

/**
 * Full sync of tenant_cache: delete all → insert.
 */
export async function syncTenantCache(
  supabase: SupabaseClient,
  tenants: {
    id: string
    type: "company" | "organization"
    name: string
    slug?: string | null
    status?: string
    parent_id?: string | null
    company_id?: string | null
  }[]
) {
  await supabase.from("tenant_cache").delete().neq("id", "")

  if (tenants.length > 0) {
    const now = new Date().toISOString()
    const rows = tenants.map((t) => ({
      id: t.id,
      type: t.type,
      name: t.name,
      slug: t.slug ?? null,
      status: t.status ?? "active",
      parent_id: t.parent_id ?? null,
      company_id: t.company_id ?? null,
      synced_at: now,
    }))

    const { error } = await supabase.from("tenant_cache").insert(rows)
    if (error) throw error
  }
}

// ========================================
// Audit Logs
// ========================================

/**
 * Insert an audit log entry.
 */
export async function insertAuditLog(
  supabase: SupabaseClient,
  userId: string | null,
  record: AuditLogRecord
) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action: record.action,
    table_name: record.table_name,
    record_id: record.record_id ?? null,
    old_values: record.old_values ?? null,
    new_values: record.new_values ?? null,
  })
  if (error) throw error
}

/**
 * Get audit logs with optional filters.
 */
export async function getAuditLogs(
  supabase: SupabaseClient,
  filters?: AuditLogFilters
): Promise<AuditLogEntry[]> {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })

  if (filters?.user_id) {
    query = query.eq("user_id", filters.user_id)
  }
  if (filters?.action) {
    query = query.eq("action", filters.action)
  }
  if (filters?.table_name) {
    query = query.eq("table_name", filters.table_name)
  }
  if (filters?.from) {
    query = query.gte("created_at", filters.from)
  }
  if (filters?.to) {
    query = query.lte("created_at", filters.to)
  }
  if (filters?.limit) {
    query = query.limit(filters.limit)
  }
  if (filters?.offset) {
    query = query.range(
      filters.offset,
      filters.offset + (filters.limit ?? 50) - 1
    )
  }

  const { data } = await query
  return (data ?? []) as AuditLogEntry[]
}
