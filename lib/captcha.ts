// lib/captcha.ts

/**
 * Vérifie un token Turnstile auprès de l'API Cloudflare.
 * @param token - Le token généré par le widget Turnstile côté client
 * @returns true si le token est valide, false sinon
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY non définie. Vérification ignorée.')
    return true // En développement, on peut laisser passer
  }

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          response: token,
        }),
      }
    )

    const data = await res.json()
    return data.success === true
  } catch (err: any) {
    console.error('Erreur de vérification Turnstile:', err)
    return false
  }
}