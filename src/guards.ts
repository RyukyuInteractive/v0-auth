import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "./server"
import type { UserRole, RoleConfig, GuardsConfig } from "./types"

/**
 * Creates a set of cached auth guard functions.
 *
 * All returned functions are wrapped with React `cache()` for
 * request-level deduplication in Server Components.
 *
 * @example
 * ```ts
 * const guards = createAuthGuards(authConfig.roles, {
 *   loginPath: "/login",
 *   noAccessPath: "/no-access",
 *   userFallbackPath: "/app/assets",
 * })
 *
 * // In a Server Component:
 * const profile = await guards.requireAdmin()
 * ```
 */
export function createAuthGuards(roleConfig: RoleConfig, config: GuardsConfig) {
  const getSession = cache(async () => {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  })

  const getUser = cache(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  })

  const getProfile = cache(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

    return profile
  })

  const requireAuth = cache(async () => {
    const user = await getUser()
    if (!user) {
      redirect(config.loginPath)
    }
    return user
  })

  const requireRole = cache(async (allowedRoles: UserRole[]) => {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (!user || userError) {
      redirect(config.loginPath)
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profile || profileError) {
      console.error("[requireRole] Profile fetch failed:", profileError)
      redirect(config.noAccessPath)
    }

    if (profile.role === "guest") {
      redirect(config.noAccessPath)
    }

    if (!allowedRoles.includes(profile.role)) {
      redirect(config.userFallbackPath ?? config.noAccessPath)
    }

    return profile
  })

  const requireAdmin = cache(async () => {
    return requireRole(["admin"])
  })

  const requireUser = cache(async () => {
    return requireRole(["user", "admin"])
  })

  /**
   * Get the permissions for a given local role.
   */
  function getPermissionsForRole(role: UserRole): string[] {
    for (const [roleKey, localRole] of Object.entries(roleConfig.roleKeyToLocal)) {
      if (localRole === role) {
        return roleConfig.rolePermissions[roleKey] ?? []
      }
    }
    return []
  }

  /**
   * Check if a role has a specific permission.
   */
  function roleHasPermission(role: UserRole, permission: string): boolean {
    return getPermissionsForRole(role).includes(permission)
  }

  return {
    getSession,
    getUser,
    getProfile,
    requireAuth,
    requireRole,
    requireAdmin,
    requireUser,
    getPermissionsForRole,
    roleHasPermission,
  }
}
