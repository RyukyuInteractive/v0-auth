import "server-only"

import { NextResponse } from "next/server"
import type { TenantSyncConfig, AccountCenterCompany } from "./types"
import { createAdminClient } from "./admin"
import { createClient } from "./server"
import { syncTenantCache } from "./repositories"

/**
 * Creates a Next.js route handler for syncing tenants from Account Center.
 *
 * @example
 * ```ts
 * // app/api/admin/tenants/sync/route.ts
 * import { createTenantSyncHandler } from "@inta/auth/api"
 *
 * export const POST = createTenantSyncHandler({
 *   accountCenterUrl: process.env.ACCOUNT_CENTER_URL!,
 *   apiKey: process.env.PERMISSIONS_API_KEY!,
 *   appKey: process.env.APP_KEY!,
 * })
 * ```
 */
export function createTenantSyncHandler(config: TenantSyncConfig) {
  return async function POST() {
    // Authentication check
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    // Authorization check (admin only)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 })
    }

    if (!config.accountCenterUrl || !config.apiKey || !config.appKey) {
      return NextResponse.json(
        { error: "テナント同期の設定が不完全です" },
        { status: 500 }
      )
    }

    // Fetch tenants from Account Center
    const response = await fetch(
      `${config.accountCenterUrl}/api/apps/${config.appKey}/tenants`,
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: "アカウントセンターからのデータ取得に失敗しました" },
        { status: 502 }
      )
    }

    const { companies } = (await response.json()) as {
      companies: AccountCenterCompany[]
    }

    // Build tenant rows
    const tenants: {
      id: string
      type: "company" | "organization"
      name: string
      slug?: string | null
      status?: string
      parent_id?: string | null
    }[] = []

    for (const company of companies) {
      tenants.push({
        id: company.id,
        type: "company",
        name: company.name,
        slug: company.slug,
        status: company.status,
        parent_id: null,
      })
      for (const org of company.organizations) {
        tenants.push({
          id: org.id,
          type: "organization",
          name: org.name,
          status: "active",
          parent_id: org.company_id,
        })
      }
    }

    // Sync using admin client
    const admin = createAdminClient()
    try {
      await syncTenantCache(admin, tenants)
    } catch {
      return NextResponse.json(
        { error: "テナントキャッシュへの書き込みに失敗しました" },
        { status: 500 }
      )
    }

    // Call onAfterSync hook for app-specific processing
    if (config.onAfterSync) {
      try {
        await config.onAfterSync({ companies, adminClient: admin })
      } catch (err) {
        console.error("[Tenant Sync] onAfterSync error:", err)
        return NextResponse.json(
          { error: "テナント同期後の追加処理に失敗しました" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      synced: tenants.length,
      companies: companies.length,
    })
  }
}
