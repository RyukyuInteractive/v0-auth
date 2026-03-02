import "server-only"

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "./server"
import { createAdminClient } from "./admin"
import type { UserRole, AppRolesMap, RoleConfig, CallbackConfig, Memberships } from "./types"

const ACCOUNT_CENTER_URL = process.env.ACCOUNT_CENTER_URL

interface UserinfoResult {
  appRoles?: AppRolesMap
  memberships?: Memberships
}

/**
 * Fetch app_roles and memberships from the account center's userinfo endpoint.
 */
async function fetchFromUserinfo(providerToken: string): Promise<UserinfoResult> {
  if (!ACCOUNT_CENTER_URL) return {}

  try {
    const resp = await fetch(`${ACCOUNT_CENTER_URL}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    })
    if (resp.ok) {
      const userinfo = await resp.json()
      return {
        appRoles: userinfo.app_roles || undefined,
        memberships: userinfo.memberships || undefined,
      }
    }
    console.error("[Auth Callback] Userinfo fetch failed:", resp.status, await resp.text())
  } catch (err) {
    console.error("[Auth Callback] Userinfo fetch error:", err)
  }
  return {}
}

/**
 * Creates a GET handler for `/auth/callback`.
 *
 * Handles the OAuth code exchange, role resolution, profile sync,
 * optional membership sync, and redirect.
 *
 * @example
 * ```ts
 * // app/auth/callback/route.ts
 * import { createCallbackHandler } from "@inta/auth/callback"
 * import { createPermissionResolver } from "@inta/auth/resolve"
 *
 * const { resolveLocalRole } = createPermissionResolver(authConfig.roles)
 *
 * export const GET = createCallbackHandler(
 *   authConfig.roles,
 *   resolveLocalRole,
 *   {
 *     syncRole: true,
 *     useUpsert: false,
 *     syncMemberships: true,
 *     loginPath: "/login",
 *     noAccessPath: "/no-access",
 *     defaultDashboardPath: "/app/assets",
 *     adminDashboardPath: "/admin",
 *   }
 * )
 * ```
 */
export function createCallbackHandler(
  _roleConfig: RoleConfig,
  resolveLocalRole: (appRoles: AppRolesMap | undefined) => UserRole,
  config: CallbackConfig
) {
  return async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get("code")
    const origin = requestUrl.origin

    // Get redirect URL from cookie
    const authRedirectCookie = request.cookies.get("auth_redirect")
    const customRedirect = authRedirectCookie?.value ? decodeURIComponent(authRedirectCookie.value) : null

    if (code) {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.user) {
        // Resolve app_roles:
        // 1. Try direct userinfo call with provider_token (most reliable)
        // 2. Fall back to user_metadata.app_roles (cached by Supabase)
        let appRoles: AppRolesMap | undefined
        let memberships: Memberships | undefined

        if (config.syncRole && data.session?.provider_token) {
          const result = await fetchFromUserinfo(data.session.provider_token)
          appRoles = result.appRoles
          memberships = result.memberships
        }

        if (!appRoles) {
          appRoles = (data.user.user_metadata?.app_roles as AppRolesMap) || undefined
        }

        const localRole = resolveLocalRole(appRoles)

        // Sync role to profiles using service role client (bypasses RLS)
        const adminClient = createAdminClient()

        if (config.useUpsert) {
          // upsert: create profile if not exists
          const upsertData: Record<string, unknown> = {
            id: data.user.id,
            role: localRole,
            status: "active",
          }

          if (config.upsertFields) {
            upsertData.email = data.user.email
            upsertData.display_name =
              data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? data.user.email
            upsertData.avatar_url = data.user.user_metadata?.avatar_url ?? null
          }

          const { error: syncError } = await adminClient.from("profiles").upsert(upsertData, { onConflict: "id" })

          if (syncError) {
            console.error("[Auth Callback] Role sync error:", syncError)
          }
        } else {
          // update: only update existing profile
          const { error: syncError } = await adminClient
            .from("profiles")
            .update({ role: localRole, status: "active" })
            .eq("id", data.user.id)

          if (syncError) {
            console.error("[Auth Callback] Role sync error:", syncError)
          }
        }

        // Sync memberships (full replace)
        if (config.syncMemberships && memberships) {
          try {
            await adminClient.from("user_memberships").delete().eq("user_id", data.user.id)

            const rows = [
              ...memberships.companies.map((id) => ({
                user_id: data.user.id,
                scope_type: "company" as const,
                scope_id: id,
              })),
              ...memberships.organizations.map((id) => ({
                user_id: data.user.id,
                scope_type: "organization" as const,
                scope_id: id,
              })),
            ]

            if (rows.length > 0) {
              const { error: membershipError } = await adminClient.from("user_memberships").insert(rows)
              if (membershipError) {
                console.error("[Auth Callback] Membership sync error:", membershipError)
              }
            }
          } catch (err) {
            console.error("[Auth Callback] Membership sync error:", err)
          }
        }

        // Determine redirect URL
        let redirectUrl: string

        if (localRole === "guest") {
          redirectUrl = `${origin}${config.noAccessPath}`
        } else if (customRedirect && customRedirect.startsWith("/")) {
          redirectUrl = `${origin}${customRedirect}`
        } else if (localRole === "admin" && config.adminDashboardPath) {
          redirectUrl = `${origin}${config.adminDashboardPath}`
        } else {
          redirectUrl = `${origin}${config.defaultDashboardPath}`
        }

        const response = NextResponse.redirect(redirectUrl)

        // Clear the redirect cookie
        response.cookies.set("auth_redirect", "", {
          path: "/",
          maxAge: 0,
        })

        return response
      }
    }

    // If something went wrong, redirect to login
    return NextResponse.redirect(`${origin}${config.loginPath}`)
  }
}
