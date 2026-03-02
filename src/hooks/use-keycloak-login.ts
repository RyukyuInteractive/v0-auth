"use client"

import { useState, useCallback } from "react"
import { createClient } from "../client"
import type { UseKeycloakLoginOptions, UseKeycloakLoginReturn } from "../types"

/**
 * Hook for initiating Keycloak OAuth login.
 *
 * Manages the redirect cookie, loading state, and error state.
 * Each app provides its own login form UI and calls `login()` from this hook.
 *
 * @example
 * ```tsx
 * function LoginForm({ redirectTo }: { redirectTo?: string }) {
 *   const { login, isLoading, error } = useKeycloakLogin()
 *
 *   return (
 *     <button onClick={() => login(redirectTo)} disabled={isLoading}>
 *       {isLoading ? "ログイン中..." : "ログイン"}
 *     </button>
 *   )
 * }
 * ```
 */
export function useKeycloakLogin(options: UseKeycloakLoginOptions = {}): UseKeycloakLoginReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const callbackPath = options.callbackPath ?? "/auth/callback"
  const scopes = options.scopes ?? "openid profile email"

  const login = useCallback(
    async (redirectTo?: string) => {
      setError(null)
      setIsLoading(true)

      try {
        const supabase = createClient()

        // Store redirect URL in cookie for use after OAuth callback
        if (redirectTo) {
          document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=600; SameSite=Lax`
        } else {
          document.cookie = "auth_redirect=; path=/; max-age=0"
        }

        const redirectUrl =
          options.redirectUrl ??
          (process.env.NEXT_PUBLIC_SITE_URL
            ? `${process.env.NEXT_PUBLIC_SITE_URL}${callbackPath}`
            : `${window.location.origin}${callbackPath}`)

        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "keycloak",
          options: {
            redirectTo: redirectUrl,
            scopes,
          },
        })

        if (oauthError) {
          console.error("[Auth] OAuth error:", oauthError)
          setError(oauthError.message)
          setIsLoading(false)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected error"
        console.error("[Auth] Unexpected error:", err)
        setError(message)
        setIsLoading(false)
      }
    },
    [options.redirectUrl, callbackPath, scopes]
  )

  return { login, isLoading, error }
}
