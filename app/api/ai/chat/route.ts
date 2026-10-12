// app/api/ai/chat/route.ts
// Chatbot RAG – répond aux questions des utilisateurs en utilisant le contexte
// des produits. Nécessite une session utilisateur (optionnel mais recommandé).
// Supporte un historique de conversation pour un dialogue continu.
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server';
import { generateChatResponse, ChatMessage } from '@/lib/ai/chatEngine';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schéma du corps de la requête
const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message requis').max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  temperature: z.number().min(0).max(1).optional().default(0.7),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Requête invalide', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, history, temperature } = parsed.data;

    // Génération de la réponse (l'historique est passé tel quel)
    const response = await generateChatResponse(message, {
      history: history as ChatMessage[],
      temperature,
    });

    return NextResponse.json({ response });
  } catch (error: any) {
    logger.error('Erreur API chat IA', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération de la réponse.' },
      { status: 500 }
    );
  }
}