import "server-only"

import { NextResponse, type NextRequest } from "next/server"
import type { AppPermissionsJson } from "./types"

/**
 * Creates a GET handler for `/.well-known/permissions.json`.
 *
 * Validates the `x-permissions-api-key` header against
 * `PERMISSIONS_API_KEY` env var, then returns the permissions JSON.
 *
 * @example
 * ```ts
 * // app/.well-known/permissions.json/route.ts
 * import { createPermissionsHandler } from "@inta/auth/permissions-handler"
 * import { buildPermissionsJson } from "@inta/auth/permissions"
 *
 * export const GET = createPermissionsHandler(() =>
 *   buildPermissionsJson({
 *     appKey: "equipment",
 *     roles: [...],
 *     permissions: [...],
 *   })
 * )
 * ```
 */
export function createPermissionsHandler(buildFn: () => AppPermissionsJson) {
  return async function GET(request: NextRequest) {
    const apiKey = process.env.PERMISSIONS_API_KEY

    if (!apiKey) {
      return new NextResponse(null, { status: 404 })
    }

    const authHeader = request.headers.get("x-permissions-api-key")
    if (authHeader !== apiKey) {
      return new NextResponse(null, { status: 401 })
    }

    return NextResponse.json(buildFn())
  }
}
