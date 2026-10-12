// app/api/chat/route.ts
import { createClient } from '@/lib/supabaseServer'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { z } from 'zod'
import { loggerInfo, loggerError } from '@/lib/logger'

// Schéma de validation
const chatSchema = z.object({
  message: z.string().min(1, "Le message ne peut pas être vide").max(500, "Message trop long"),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).optional()
})

// Prompt système pour le contexte
const SYSTEM_PROMPT = `Tu es l'assistant virtuel de Gercie, une marketplace haut de gamme en République Démocratique du Congo.
Tu aides les utilisateurs avec des questions sur :
- Les commandes (suivi, annulation, retour)
- Les produits (recherche, caractéristiques)
- Le fonctionnement du site (paiement, livraison, compte vendeur/livreur)
- Les politiques de confidentialité et conditions générales
Réponds de manière concise, professionnelle et chaleureuse en français. Si tu ne connais pas la réponse, propose de contacter le support.`

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  // 1. Rate limiting : 20 requêtes par minute pour le chat
  const { allowed, remaining, resetTime, headers: rateLimitHeaders } = rateLimit({
    id: `chat:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
    banDurationSeconds: 300,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter quelques minutes.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  // 2. Authentification optionnelle (pour personnalisation future)
  let userId: string | null = null
  try {
    const user = await getCurrentUser()
    userId = user?.id ?? null
  } catch {}

  // 3. Valider les données
  const rawBody = await request.json()
  const parsed = chatSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { message, history } = parsed.data

  // 4. Appeler l'API OpenAI (ou un autre LLM)
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'Configuration manquante pour le service IA.' }, { status: 500 })
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(history ?? []).slice(-10), // garder les 10 derniers échanges pour contexte
      { role: 'user', content: message }
    ]

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // ou 'gpt-4o' selon l'abonnement
        messages,
        max_tokens: 300,
        temperature: 0.7,
      }),
    })

    if (!openaiResponse.ok) {
      const errData = await openaiResponse.json()
      throw new Error(errData.error?.message ?? 'Erreur OpenAI')
    }

    const completion = await openaiResponse.json()
    const reply = completion.choices[0]?.message?.content ?? "Désolé, je n'ai pas pu répondre."

    // Journaliser (optionnellement)
    loggerInfo({ userId, message, reply }, 'Chatbot interaction')

    return NextResponse.json({ reply })
  } catch (error: any) {
    loggerError(error, { userId, message })
    return NextResponse.json({ error: 'Erreur du service IA.' }, { status: 500 })
  }
}
