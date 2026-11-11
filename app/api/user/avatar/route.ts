// app/api/user/avatar/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import { logActivity, getRequestMeta } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

const BUCKET = 'avatars'
const MAX_SIZE_MB = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
])

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
  }
}

function applyNoStore(response: NextResponse) {
  for (const [key, value] of Object.entries(noStoreHeaders())) {
    response.headers.set(key, value)
  }
  return response
}

function generateId() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `avatar-${Date.now()}`
  } catch {
    return `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function getFileExtension(file: File) {
  const fromName = file.name?.split('.')?.pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }

  return EXT_BY_MIME[file.type] || 'jpg'
}

function isMissingTableError(error: any) {
  return (
    error?.code === '42P01' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('does not exist') ||
    String(error?.details || '')
      .toLowerCase()
      .includes('does not exist')
  )
}

function isMissingColumnError(error: any) {
  return (
    error?.code === '42703' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('column') ||
    String(error?.details || '')
      .toLowerCase()
      .includes('column')
  )
}

function isBucketMissingError(error: any) {
  const message = String(error?.message || error?.error || '').toLowerCase()
  return (
    message.includes('bucket') ||
    message.includes('not found') ||
    error?.statusCode === 404 ||
    error?.status === 404
  )
}

async function cleanupOldAvatars(
  supabase: any,
  userId: string,
  keepFileName?: string | null
) {
  try {
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(userId, { limit: 100 })

    if (error || !files || files.length === 0) return

    const pathsToRemove = files
      .filter((file: any) => file.name !== keepFileName)
      .map((file: any) => `${userId}/${file.name}`)

    if (pathsToRemove.length > 0) {
      await supabase.storage.from(BUCKET).remove(pathsToRemove)
    }
  } catch (error) {
    logger.warn('Erreur nettoyage anciens avatars', {
      userId,
      error,
    })
  }
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/user/avatar
 * Récupère l'URL de l'avatar actuel de l'utilisateur connecté.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-avatar-get:${ip}`,
    maxRequests: 60,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    const supabase = await createClient(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return applyNoStore(
          NextResponse.json({
            data: { avatar_url: null },
          })
        )
      }

      logger.error('Erreur GET /api/user/avatar', {
        userId: user.id,
        error,
      })

      return applyNoStore(
        NextResponse.json(
          { error: 'Impossible de récupérer l\'avatar' },
          { status: 500 }
        )
      )
    }

    return applyNoStore(
      NextResponse.json({
        data: {
          avatar_url: data?.avatar_url ?? null,
        },
      })
    )
  } catch (error: any) {
    logger.error('Crash GET /api/user/avatar', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/user/avatar
 * Téléverse un nouvel avatar pour l'utilisateur connecté.
 *
 * Attend FormData avec un champ "file".
 * Remplace l'ancien avatar et nettoie les fichiers précédents si possible.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-avatar-upload:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de téléversements. Réessayez dans une minute.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    let formData: FormData

    try {
      formData = await request.formData()
    } catch {
      return applyNoStore(
        NextResponse.json(
          { error: 'Le requête doit être envoyée en FormData' },
          { status: 400 }
        )
      )
    }

    const file = formData.get('file') as File | null

    if (!file) {
      return applyNoStore(
        NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 })
      )
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return applyNoStore(
        NextResponse.json(
          {
            error:
              'Format d\'image non supporté. Utilisez JPG, PNG, WEBP ou GIF.',
          },
          { status: 400 }
        )
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return applyNoStore(
        NextResponse.json(
          {
            error: `L'image ne doit pas dépasser ${MAX_SIZE_MB} Mo.`,
          },
          { status: 400 }
        )
      )
    }

    const supabase = await createClient(true)

    const extension = getFileExtension(file)
    const fileName = `avatar-${Date.now()}-${generateId()}.${extension}`
    const storagePath = `${user.id}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      logger.error('Erreur upload avatar', {
        userId: user.id,
        error: uploadError,
      })

      if (isBucketMissingError(uploadError)) {
        return applyNoStore(
          NextResponse.json(
            {
              error:
                'Le bucket storage "avatars" n\'existe pas. Exécutez le SQL Supabase fourni.',
              code: 'STORAGE_BUCKET_MISSING',
            },
            { status: 500 }
          )
        )
      }

      return applyNoStore(
        NextResponse.json(
          { error: 'Impossible de téléverser l\'avatar' },
          { status: 500 }
        )
      )
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    const publicUrl = publicUrlData?.publicUrl

    if (!publicUrl) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})

      return applyNoStore(
        NextResponse.json(
          { error: 'URL publique indisponible pour l\'avatar' },
          { status: 500 }
        )
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)

    if (updateError) {
      logger.error('Erreur mise à jour avatar dans profiles', {
        userId: user.id,
        error: updateError,
      })

      // Rollback simple : on supprime le fichier nouvellement uploadé
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})

      if (isMissingColumnError(updateError)) {
        return applyNoStore(
          NextResponse.json(
            {
              error:
                'La colonne profiles.avatar_url est manquante. Exécutez le SQL Supabase fourni.',
              code: 'PROFILE_AVATAR_COLUMN_MISSING',
            },
            { status: 500 }
          )
        )
      }

      return applyNoStore(
        NextResponse.json(
          { error: 'Avatar téléversé mais impossible de mettre à jour le profil' },
          { status: 500 }
        )
      )
    }

    // Nettoyage des anciens avatars après succès
    await cleanupOldAvatars(supabase, user.id, fileName)

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'avatar_updated',
      description: 'Photo de profil mise à jour',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        storage_path: storagePath,
      },
    })

    return applyNoStore(
      NextResponse.json({
        success: true,
        message: 'Avatar mis à jour avec succès.',
        url: publicUrl,
        data: {
          avatar_url: publicUrl,
        },
      })
    )
  } catch (error: any) {
    logger.error('Crash POST /api/user/avatar', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}

/* ------------------------------------------------------------------ */
/* DELETE                                                              */
/* ------------------------------------------------------------------ */

/**
 * DELETE /api/user/avatar
 * Supprime l'avatar actuel de l'utilisateur connecté.
 */
export async function DELETE(request: Request) {
  const ip = getClientIp(request)

  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `user-avatar-delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return applyNoStore(
        NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      )
    }

    const supabase = await createClient(true)

    // Supprime tous les fichiers du dossier utilisateur dans le bucket avatars
    await cleanupOldAvatars(supabase, user.id, null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id)

    if (updateError) {
      logger.error('Erreur suppression avatar dans profiles', {
        userId: user.id,
        error: updateError,
      })

      if (isMissingColumnError(updateError)) {
        return applyNoStore(
          NextResponse.json(
            {
              error:
                'La colonne profiles.avatar_url est manquante. Exécutez le SQL Supabase fourni.',
              code: 'PROFILE_AVATAR_COLUMN_MISSING',
            },
            { status: 500 }
          )
        )
      }

      return applyNoStore(
        NextResponse.json(
          { error: 'Impossible de mettre à jour le profil' },
          { status: 500 }
        )
      )
    }

    const meta = getRequestMeta(request)

    await logActivity({
      userId: user.id,
      action: 'avatar_removed',
      description: 'Photo de profil supprimée',
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return applyNoStore(
      NextResponse.json({
        success: true,
        message: 'Avatar supprimé avec succès.',
        data: {
          avatar_url: null,
        },
      })
    )
  } catch (error: any) {
    logger.error('Crash DELETE /api/user/avatar', error)

    return applyNoStore(
      NextResponse.json(
        { error: error?.message || 'Erreur serveur' },
        { status: 500 }
      )
    )
  }
}