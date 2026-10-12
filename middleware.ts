// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const GUARD_COOKIE_NAME = 'gercie_guard'
const GUARD_TTL_MS = 5 * 60 * 1000 // 5 minutes

const ONBOARDING_PATH = '/onboarding'

/**
 * Routes privées protégées par le garde-fou.
 *
 * Règle métier :
 * - utilisateur connecté non vérifié OU non onboardé
 *   ne doit pas accéder à l'accueil.
 *
 * On protège en priorité l'accueil `/`.
 * Les autres routes privées sensibles sont ajoutées progressivement.
 */
const GUARDED_EXACT_PATHS = ['/']

const GUARDED_PREFIX_PATHS = [
  '/account',
  '/commandes',
  '/favoris',
  '/panier',
  '/checkout',
  '/paiement',
]

function isGuardedPath(pathname: string): boolean {
  if (GUARDED_EXACT_PATHS.includes(pathname)) {
    return true
  }

  return GUARDED_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix))
}

function isOnboardingPath(pathname: string): boolean {
  return pathname.startsWith(ONBOARDING_PATH)
}

function isAuthPagePath(pathname: string): boolean {
  return pathname.startsWith('/login') || pathname.startsWith('/register')
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GuardPayload {
  uid: string
  v: boolean // verified : au moins un canal vérifié
  o: boolean // onboarded
  a: boolean // active
  exp: number
}

interface ProfileFlags {
  v: boolean
  o: boolean
  a: boolean
}

/* ------------------------------------------------------------------ */
/*  Sécurité headers                                                   */
/* ------------------------------------------------------------------ */

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')

  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )

  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  )

  if (process.env.NODE_ENV === 'production') {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.supabase.co https://*.basemaps.cartocdn.com https://www.googletagmanager.com",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.mapbox.com https://*.googleapis.com https://www.google-analytics.com https://www.google.com",
      "frame-src 'self' https://js.stripe.com https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]

    response.headers.set('Content-Security-Policy', cspDirectives.join('; '))
  }

  response.headers.delete('X-Powered-By')
}

/* ------------------------------------------------------------------ */
/*  Helpers redirection + cookies                                      */
/* ------------------------------------------------------------------ */

function redirectWithCookies(url: string, sourceResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url)

  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
  })

  applySecurityHeaders(redirectResponse)

  return redirectResponse
}

function setGuardCookie(response: NextResponse, token: string) {
  response.cookies.set(GUARD_COOKIE_NAME, encodeURIComponent(token), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(GUARD_TTL_MS / 1000),
  })
}

/* ------------------------------------------------------------------ */
/*  HMAC Edge-safe                                                     */
/* ------------------------------------------------------------------ */

const textEncoder = new TextEncoder()

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }

  return bytes
}

function getGuardSecret(): string {
  return (
    process.env.AUTH_GUARD_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'gercie-insecure-guard-secret'
  )
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getGuardSecret()

  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign', 'verify']
  )
}

async function signData(data: string): Promise<string | null> {
  try {
    const key = await getHmacKey()

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      textEncoder.encode(data)
    )

    return bytesToHex(signature)
  } catch {
    return null
  }
}

async function verifySignature(data: string, signatureHex: string): Promise<boolean> {
  try {
    const key = await getHmacKey()

    return await crypto.subtle.verify(
      'HMAC',
      key,
      hexToBytes(signatureHex).buffer,
      textEncoder.encode(data)
    )
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Guard cookie                                                       */
/* ------------------------------------------------------------------ */

async function buildGuardCookie(payload: GuardPayload): Promise<string | null> {
  try {
    const data = btoa(JSON.stringify(payload))
    const signature = await signData(data)

    if (!signature) return null

    return `${data}.${signature}`
  } catch {
    return null
  }
}

async function readGuardCookie(
  request: NextRequest,
  expectedUserId?: string
): Promise<GuardPayload | null> {
  try {
    const encoded = request.cookies.get(GUARD_COOKIE_NAME)?.value

    if (!encoded) return null

    let token: string

    try {
      token = decodeURIComponent(encoded)
    } catch {
      return null
    }

    const lastDotIndex = token.lastIndexOf('.')

    if (lastDotIndex <= 0) return null

    const data = token.slice(0, lastDotIndex)
    const signature = token.slice(lastDotIndex + 1)

    const isValid = await verifySignature(data, signature)

    if (!isValid) return null

    const parsed = JSON.parse(atob(data)) as GuardPayload

    if (!parsed || typeof parsed !== 'object') return null

    if (!parsed.exp || parsed.exp < Date.now()) return null

    if (expectedUserId && parsed.uid !== expectedUserId) return null

    return parsed
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Supabase middleware client                                         */
/* ------------------------------------------------------------------ */

function createMiddlewareSupabase(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Profile flags                                                      */
/* ------------------------------------------------------------------ */

async function fetchProfileFlags(
  supabase: ReturnType<typeof createMiddlewareSupabase>,
  userId: string
): Promise<ProfileFlags | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email_verified, phone_verified, onboarding_completed, est_actif')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('[MIDDLEWARE] Profile flags fetch failed:', error.message)
      return null
    }

    return {
      v: data?.email_verified === true || data?.phone_verified === true,
      o: data?.onboarding_completed === true,
      a: data?.est_actif !== false,
    }
  } catch (err: any) {
    console.warn('[MIDDLEWARE] Profile flags fetch exception:', err?.message)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                         */
/* ------------------------------------------------------------------ */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  applySecurityHeaders(response)

  /* ---------------------------------------------------------------- */
  /*  Routes à ignorer                                                 */
  /* ------------------------------------------------------------------ */

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return response
  }

  const needsAuthCheck =
    isOnboardingPath(pathname) ||
    isAuthPagePath(pathname) ||
    isGuardedPath(pathname)

  if (!needsAuthCheck) {
    return response
  }

  /* ---------------------------------------------------------------- */
  /*  Supabase client                                                  */
  /* ------------------------------------------------------------------ */

  const supabase = createMiddlewareSupabase(request, response)

  if (!supabase) {
    return response
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /* ---------------------------------------------------------------- */
  /*  Utilisateur non connecté                                         */
  /* ------------------------------------------------------------------ */

  if (!user) {
    // Onboarding nécessite une session
    if (isOnboardingPath(pathname)) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', ONBOARDING_PATH)

      return redirectWithCookies(loginUrl.toString(), response)
    }

    // Les pages publiques ou login/register restent accessibles
    return response
  }

  /* ---------------------------------------------------------------- */
  /*  Utilisateur connecté                                             */
  /* ------------------------------------------------------------------ */

  const guard = await readGuardCookie(request, user.id)

  /*
   * Sur login/register :
   * si l'utilisateur est déjà valide, on redirige vers l'accueil.
   */
  if (isAuthPagePath(pathname)) {
    if (guard && guard.v && guard.o && guard.a) {
      return redirectWithCookies(new URL('/', request.url).toString(), response)
    }

    return response
  }

  /*
   * Sur onboarding :
   * si l'utilisateur est déjà valide, on redirige vers l'accueil.
   */
  if (isOnboardingPath(pathname)) {
    if (guard && guard.v && guard.o && guard.a) {
      return redirectWithCookies(new URL('/', request.url).toString(), response)
    }

    return response
  }

  /*
   * Routes protégées :
   * appliquer la règle métier.
   */
  if (!isGuardedPath(pathname)) {
    return response
  }

  // Cookie guard valide
  if (guard) {
    if (guard.v && guard.o && guard.a) {
      return response
    }

    return redirectWithCookies(
      new URL(ONBOARDING_PATH, request.url).toString(),
      response
    )
  }

  // Pas de cookie guard → vérifier le profil
  const flags = await fetchProfileFlags(supabase, user.id)

  if (!flags) {
    // Impossible de vérifier le profil.
    // Par sécurité, on dirige vers onboarding plutôt que l'accueil.
    return redirectWithCookies(
      new URL(ONBOARDING_PATH, request.url).toString(),
      response
    )
  }

  const payload: GuardPayload = {
    uid: user.id,
    v: flags.v,
    o: flags.o,
    a: flags.a,
    exp: Date.now() + GUARD_TTL_MS,
  }

  const token = await buildGuardCookie(payload)

  if (flags.v && flags.o && flags.a) {
    if (token) {
      setGuardCookie(response, token)
    }

    return response
  }

  const redirectResponse = redirectWithCookies(
    new URL(ONBOARDING_PATH, request.url).toString(),
    response
  )

  if (token) {
    setGuardCookie(redirectResponse, token)
  }

  return redirectResponse
}

/* ------------------------------------------------------------------ */
/*  Matcher                                                            */
/* ------------------------------------------------------------------ */

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|static|favicon.ico|site\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|avif|woff2?)).*)',
  ],
}