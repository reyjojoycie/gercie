// lib/auth/clientFetch.ts
export interface ApiResult {
  ok: boolean
  status: number
  data: any
}

interface ApiOptions {
  timeoutMs?: number
  /** Nombre de nouveaux essais en cas d'erreur réseau ou 5xx (GET : 2 par défaut, POST : 0) */
  retries?: number
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function apiRequest(
  url: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
  options: ApiOptions = {}
): Promise<ApiResult> {
  const timeoutMs = options.timeoutMs ?? 20000
  // Pas de nouvel essai automatique sur POST : cela pourrait renvoyer un SMS ou un email deux fois
  const retries = options.retries ?? (method === 'GET' ? 2 : 0)

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 0,
      data: { error: 'Vous êtes hors ligne. Vérifiez votre connexion.' },
    }
  }

  let lastResult: ApiResult = {
    ok: false,
    status: 0,
    data: { error: 'Connexion instable. Vérifiez votre réseau et réessayez.' },
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await wait(1000 * attempt)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      })

      const data = await res.json().catch(() => ({}))
      lastResult = { ok: res.ok, status: res.status, data }

      if (res.status < 500) return lastResult
    } catch (err: any) {
      lastResult = {
        ok: false,
        status: 0,
        data: {
          error:
            err?.name === 'AbortError'
              ? 'La requête prend trop de temps. Réessayez.'
              : 'Connexion instable. Vérifiez votre réseau et réessayez.',
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return lastResult
}