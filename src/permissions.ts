import type {
  AppPermissionsJson,
  AppPermissionsJsonRole,
  AppPermissionsJsonPermission,
  PermissionsJsonInput,
} from "./types"

export type { AppPermissionsJson, AppPermissionsJsonRole, AppPermissionsJsonPermission, PermissionsJsonInput }

/**
 * Build the permissions.json payload for the account center.
 *
 * Each app defines its own roles and permissions, then passes them
 * to this function to produce the JSON that the account center
 * fetches from `/.well-known/permissions.json`.
 *
 * @example
 * ```ts
 * const json = buildPermissionsJson({
 *   appKey: "equipment",
 *   roles: [
 *     { key: "eq.admin", display_name: "管理者", permissions: [...] },
 *     { key: "eq.user", display_name: "ユーザー", permissions: [...] },
 *   ],
 *   permissions: [
 *     { key: "eq.asset.read", display_name: "備品閲覧", category: "備品" },
 *   ],
 * })
 * ```
 */
export function buildPermissionsJson(input: PermissionsJsonInput): AppPermissionsJson {
  return {
    app_key: input.appKey,
    version: input.version ?? "1.0.0",
    roles: input.roles,
    permissions: input.permissions,
  }
}
