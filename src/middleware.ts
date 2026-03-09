import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { MiddlewareConfig } from "./types"

/**
 * Validate redirect path against an allowlist.
 * If no allowlist is configured, all paths starting with "/" are allowed.
 */
function isValidRedirectPath(redirectTo: string, allowedPaths?: string[]): boolean {
  if (!allowedPaths) {
    return redirectTo.startsWith("/")
  }
  return allowedPaths.some((allowedPath) => redirectTo === allowedPath || redirectTo.startsWith(allowedPath + "?"))
}

/**
 * Creates an auth middleware function for Next.js.
 *
 * - `enableRoleCheck: false` — session refresh only (e.g. inta-medal)
 * - `enableRoleCheck: true` — session refresh + RBAC routing (e.g. equipment, skills-manager)
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createAuthMiddleware } from "@inta/auth/middleware"
 *
 * const updateSession = createAuthMiddleware({
 *   enableRoleCheck: true,
 *   publicRoutes: ["/login", "/no-access", "/auth/callback"],
 *   loginPath: "/login",
 *   noAccessPath: "/no-access",
 *   adminRoutePrefix: "/admin",
 *   userFallbackPath: "/app/assets",
 *   defaultDashboardPath: "/app/assets",
 *   allowedRedirectPaths: ["/app/assets", "/admin/assets"],
 * })
 *
 * export async function middleware(request: NextRequest) {
 *   return updateSession(request)
 * }
 * ```
 */
export function createAuthMiddleware(config: MiddlewareConfig) {
  return async function updateSession(request: NextRequest): Promise<NextResponse> {
    let supabaseResponse = NextResponse.next({ request })

    try {
      return await _updateSession(request, supabaseResponse, config)
    } catch (error) {
      console.error("[Middleware] Unhandled error:", error)
      return supabaseResponse
    }
  }
}

async function _updateSession(
  request: NextRequest,
  supabaseResponse: NextResponse,
  config: MiddlewareConfig
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Session-only mode: just refresh cookies, no role checks
  if (!config.enableRoleCheck) {
    return supabaseResponse
  }

  const pathname = request.nextUrl.pathname

  const isPublicRoute = config.publicRoutes.some((route) => pathname.startsWith(route))

  // Unauthenticated → redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = config.loginPath
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  // Role-based access control for authenticated users
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, has_custom_permissions")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("[Middleware] Profile fetch error:", profileError)
      return supabaseResponse
    }

    const role = profile?.role || "guest"

    // Guest → /no-access only
    if (role === "guest" && !pathname.startsWith(config.noAccessPath) && !pathname.startsWith(config.loginPath)) {
      const url = request.nextUrl.clone()
      url.pathname = config.noAccessPath
      return NextResponse.redirect(url)
    }

    // Regular user cannot access admin routes (unless has custom permissions)
    if (
      config.adminRoutePrefix &&
      config.userFallbackPath &&
      role === "user" &&
      pathname.startsWith(config.adminRoutePrefix) &&
      !profile?.has_custom_permissions
    ) {
      const url = request.nextUrl.clone()
      url.pathname = config.userFallbackPath
      return NextResponse.redirect(url)
    }

    // Logged-in user at login page → redirect to dashboard
    if (pathname === config.loginPath) {
      const redirectTo = request.nextUrl.searchParams.get("redirect")
      const url = request.nextUrl.clone()

      if (role === "guest") {
        url.pathname = config.noAccessPath
        url.searchParams.delete("redirect")
        return NextResponse.redirect(url)
      }

      if (redirectTo && isValidRedirectPath(redirectTo, config.allowedRedirectPaths)) {
        const [path, query] = redirectTo.split("?")
        url.pathname = path
        if (query) {
          new URLSearchParams(query).forEach((value, key) => {
            url.searchParams.set(key, value)
          })
        }
      } else {
        url.pathname = config.defaultDashboardPath
      }
      url.searchParams.delete("redirect")
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
