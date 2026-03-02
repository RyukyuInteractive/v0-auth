import type { UserRole, AppRolesMap, RoleConfig } from "./types"

/**
 * Creates a permission resolver bound to app-specific role configuration.
 *
 * @example
 * ```ts
 * const resolver = createPermissionResolver({
 *   roleKeys: { ADMIN: "eq.admin", USER: "eq.user" },
 *   roleKeyToLocal: { "eq.admin": "admin", "eq.user": "user" },
 *   rolePermissions: { "eq.admin": [...], "eq.user": [...] },
 *   permissions: PERMISSIONS,
 * })
 *
 * const role = resolver.resolveLocalRole(appRoles) // "admin" | "user" | "guest"
 * ```
 */
export function createPermissionResolver(roleConfig: RoleConfig) {
  // Known role keys ordered by priority (first match wins)
  const knownRoleKeys = Object.values(roleConfig.roleKeys)

  /**
   * Resolve Account Center app_roles to local UserRole.
   * Scans all app_roles entries for known role keys in priority order.
   */
  function resolveLocalRole(appRoles: AppRolesMap | undefined): UserRole {
    if (!appRoles) return "guest"

    for (const roleKey of knownRoleKeys) {
      for (const entry of Object.values(appRoles)) {
        if (entry.roles?.includes(roleKey)) {
          return roleConfig.roleKeyToLocal[roleKey] ?? "guest"
        }
      }
    }

    return "guest"
  }

  /**
   * Extract permissions from app_roles.
   * Returns permissions from the first entry that contains a known role key.
   */
  function resolvePermissions(appRoles: AppRolesMap | undefined): string[] {
    if (!appRoles) return []

    for (const entry of Object.values(appRoles)) {
      const hasKnownRole = knownRoleKeys.some((k) => entry.roles.includes(k))
      if (hasKnownRole) {
        return entry.permissions
      }
    }

    return []
  }

  /**
   * Check if the user has a specific permission.
   */
  function hasPermission(permissions: string[], required: string): boolean {
    return permissions.includes(required)
  }

  /**
   * Check if the user has all of the specified permissions.
   */
  function hasAllPermissions(permissions: string[], required: string[]): boolean {
    return required.every((p) => permissions.includes(p))
  }

  /**
   * Check if the user has any of the specified permissions.
   */
  function hasAnyPermission(permissions: string[], required: string[]): boolean {
    return required.some((p) => permissions.includes(p))
  }

  return {
    resolveLocalRole,
    resolvePermissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
  }
}
