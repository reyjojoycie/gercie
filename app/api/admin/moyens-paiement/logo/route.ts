// app/api/admin/moyens-paiement/logo/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const STORAGE_BUCKET = 'moyens-paiement-logos'
const MAX_SIZE = 2 * 1024 * 1024 // 2 Mo

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

const log = (logger as any) || console

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function extractStoragePath(
  url: string | null | undefined,
  bucket: string
): string | null {
  if (!url) return null

  const publicMarker = `/storage/v1/object/public/${bucket}/`
  if (url.includes(publicMarker)) {
    return url.split(publicMarker)[1] || null
  }

  const genericMarker = `/${bucket}/`
  if (url.includes(genericMarker)) {
    return url.split(genericMarker)[1] || null
  }

  return null
}

function generateFileName(ext: string): string {
  const stamp = Date.now()
  const random = Math.random().toString(36).slice(2, 10)
  return `${stamp}-${random}.${ext}`
}

function isMissingBucketError(error: any): boolean {
  const message = String(
    error?.message || error?.error_description || error?.hint || ''
  ).toLowerCase()

  return (
    message.includes('bucket') ||
    message.includes('not found') ||
    message.includes('does not exist')
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  POST : upload du logo vers Supabase Storage                    */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-logo-post:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Aucun fichier reçu.' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Fichier vide.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Taille maximale : 2 Mo.' },
        { status: 400 }
      )
    }

    const ext = ALLOWED_MIME_TYPES[file.type]

    if (!ext) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilise PNG, JPG ou WEBP.' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const fileName = generateFileName(ext)
    const storagePath = `logos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      log.error?.('Upload logo moyens-paiement error', uploadError)

      if (isMissingBucketError(uploadError)) {
        return NextResponse.json(
          {
            error:
              `Le bucket Supabase "${STORAGE_BUCKET}" est introuvable. Crée-le dans Supabase Storage puis réessaie.`,
            details: uploadError.message,
          },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          error:
            uploadError.message ||
            "Impossible d'envoyer le logo vers Supabase Storage.",
        },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)

    return NextResponse.json(
      {
        success: true,
        url: publicUrl,
        path: storagePath,
        bucket: STORAGE_BUCKET,
      },
      { status: 201 }
    )
  } catch (err: any) {
    log.error?.('POST /api/admin/moyens-paiement/logo error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors de l’upload du logo.',
      },
      { status: 500 }
    )
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  DELETE : suppression manuelle d’un logo                        */
/* ═══════════════════════════════════════════════════════════════ */

export async function DELETE(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-moyens-paiement-logo-delete:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Accès non autorisé' },
      { status: err?.status || 403 }
    )
  }

  try {
    const urlFromQuery = new URL(request.url).searchParams.get('url')

    let urlFromBody: string | null = null

    try {
      const body = await request.json()
      urlFromBody = String(body?.url || '') || null
    } catch {
      urlFromBody = null
    }

    const url = urlFromBody || urlFromQuery

    if (!url) {
      return NextResponse.json(
        { error: 'URL du logo manquante.' },
        { status: 400 }
      )
    }

    const path = extractStoragePath(url, STORAGE_BUCKET)

    if (!path) {
      return NextResponse.json(
        { error: 'URL de logo invalide ou hors bucket.' },
        { status: 400 }
      )
    }

    const supabase = await createClient(true)

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path])

    if (error) {
      log.error?.('Delete logo moyens-paiement error', error)

      return NextResponse.json(
        {
          error:
            error.message ||
            'Impossible de supprimer le logo.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err: any) {
    log.error?.('DELETE /api/admin/moyens-paiement/logo error', err)

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Erreur lors de la suppression du logo.',
      },
      { status: 500 }
    )
  }
}