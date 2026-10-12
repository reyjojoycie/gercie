// ---------------------------------------------------------------------------
// API User Addresses – CRUD complet des adresses de livraison
// Sécurité : authentification, validation, IDOR protection, rate-limiting
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabaseServer'
import {
  addressSchema,
  addressUpdateSchema,
  validateSchema,
  normalizePhone,
  isValidPhone,
  AUTH_ERROR_MESSAGES,
} from '@/lib/validators/auth'
import {
  getCurrentUser,
  isUserBanned,
  isUserDeleted,
  isProfileActive,
  getUserProfile,
} from '@/lib/auth'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'

export const runtime = 'nodejs'

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const MAX_ADDRESSES_PER_USER = 10

/* ------------------------------------------------------------------ */
/*  Logger structuré                                                   */
/* ------------------------------------------------------------------ */
function logAddresses(event: string, metadata?: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const payload = { event, timestamp, ...metadata }

  if (process.env.NODE_ENV === 'development') {
    console.log('[ADDRESSES]', payload)
  } else if (
    event.toLowerCase().includes('error') ||
    event.toLowerCase().includes('échec')
  ) {
    console.error('[ADDRESSES]', payload)
  }
}

/* ------------------------------------------------------------------ */
/*  Helper : construire la réponse adresse                             */
/* ------------------------------------------------------------------ */
function buildAddressResponse(address: any) {
  // Construire adresse_text à partir des données géographiques si disponible
  const adresse_text =
    address.adresse_text ||
    [address.quartier, address.avenue, address.numero]
      .filter(Boolean)
      .join(', ') ||
    address.reference ||
    ''

  return {
    id: address.id,
    nom: address.nom,
    province_id: address.province_id,
    ville_id: address.ville_id,
    commune_id: address.commune_id,
    quartier: address.quartier,
    avenue: address.avenue,
    numero: address.numero,
    reference: address.reference,
    telephone: address.telephone,
    adresse_text,
    created_at: address.created_at,
  }
}

/* ------------------------------------------------------------------ */
/*  GET : Liste des adresses de l'utilisateur                          */
/* ------------------------------------------------------------------ */
export async function GET() {
  const startTime = Date.now()

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    const profile = await getUserProfile(user.id)
    if (profile && !isProfileActive(profile)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Récupérer les adresses                                       */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { data: addresses, error } = await supabaseAdmin
      .from('user_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      logAddresses('GET fetch error', {
        userId: user.id,
        error: error.message,
      })
      return NextResponse.json(
        { error: 'Impossible de charger vos adresses.' },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logAddresses('GET success', {
      userId: user.id,
      count: addresses?.length || 0,
      durationMs: duration,
    })

    const response = NextResponse.json({
      data: (addresses || []).map(buildAddressResponse),
    })

    response.headers.set('Cache-Control', 'private, no-cache')
    return response
  } catch (error: any) {
    logAddresses('GET unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  POST : Ajouter une adresse                                         */
/* ------------------------------------------------------------------ */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `addresses:post:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    const profile = await getUserProfile(user.id)
    if (profile && !isProfileActive(profile)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_inactive },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Parser le body                                               */
    /* ---------------------------------------------------------------- */
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Validation avec schéma partagé                               */
    /* ---------------------------------------------------------------- */
    const validation = validateSchema(addressSchema, body)
    if (!validation.success) {
      logAddresses('POST validation failed', {
        userId: user.id,
        errors: validation.errors,
      })
      return NextResponse.json(
        { error: 'Données invalides.', errors: validation.errors },
        { status: 400 }
      )
    }

    const validatedData = validation.data

    /* ---------------------------------------------------------------- */
    /*  5. Vérifier le nombre maximum d'adresses                        */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { count } = await supabaseAdmin
      .from('user_addresses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count && count >= MAX_ADDRESSES_PER_USER) {
      logAddresses('POST max addresses reached', {
        userId: user.id,
        count,
      })
      return NextResponse.json(
        { error: `Vous avez atteint le maximum de ${MAX_ADDRESSES_PER_USER} adresses.` },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  6. Normalisation des données                                    */
    /* ---------------------------------------------------------------- */
    // Construire adresse_text descriptif
    const adresseParts = [
      validatedData.quartier?.trim(),
      validatedData.avenue?.trim(),
      validatedData.numero?.trim(),
    ].filter(Boolean)

    const adresse_text = adresseParts.join(', ') || validatedData.reference?.trim() || ''

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      nom: validatedData.nom.trim(),
      province_id: validatedData.province_id || null,
      ville_id: validatedData.ville_id || null,
      commune_id: validatedData.commune_id || null,
      quartier: validatedData.quartier?.trim() || null,
      avenue: validatedData.avenue?.trim() || null,
      numero: validatedData.numero?.trim() || null,
      reference: validatedData.reference?.trim() || null,
      adresse_text,
    }

    // Normaliser le téléphone si fourni
    if (validatedData.telephone) {
      if (!isValidPhone(validatedData.telephone)) {
        return NextResponse.json(
          { error: 'Format de numéro invalide (ex: 0812345678 ou +243812345678).' },
          { status: 400 }
        )
      }
      insertPayload.telephone = normalizePhone(validatedData.telephone)
    } else {
      insertPayload.telephone = null
    }

    /* ---------------------------------------------------------------- */
    /*  7. Insérer l'adresse                                            */
    /* ---------------------------------------------------------------- */
    const { data: newAddress, error } = await supabaseAdmin
      .from('user_addresses')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      logAddresses('POST insert error', {
        userId: user.id,
        error: error.message,
        code: error.code,
      })

      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Cette adresse existe déjà.' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        {
          error: "Erreur lors de l'enregistrement de l'adresse.",
          details:
            process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  8. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logAddresses('POST success', {
      userId: user.id,
      addressId: newAddress.id,
      durationMs: duration,
    })

    const response = NextResponse.json(
      { data: buildAddressResponse(newAddress) },
      { status: 201 }
    )

    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: any) {
    logAddresses('POST unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  PUT : Modifier une adresse                                         */
/* ------------------------------------------------------------------ */
export async function PUT(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `addresses:put:${ip}`,
    maxRequests: 15,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Parser le body                                               */
    /* ---------------------------------------------------------------- */
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête JSON invalide.' },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Validation avec schéma partagé                               */
    /* ---------------------------------------------------------------- */
    const validation = validateSchema(addressUpdateSchema, body)
    if (!validation.success) {
      logAddresses('PUT validation failed', {
        userId: user.id,
        errors: validation.errors,
      })
      return NextResponse.json(
        { error: 'Données invalides.', errors: validation.errors },
        { status: 400 }
      )
    }

    const { id, ...updateData } = validation.data

    /* ---------------------------------------------------------------- */
    /*  5. Vérifier que l'adresse appartient à l'utilisateur            */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { data: existingAddress, error: fetchError } = await supabaseAdmin
      .from('user_addresses')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !existingAddress) {
      return NextResponse.json(
        { error: 'Adresse introuvable.' },
        { status: 404 }
      )
    }

    if (existingAddress.user_id !== user.id) {
      logAddresses('PUT unauthorized access attempt', {
        userId: user.id,
        targetUserId: existingAddress.user_id,
        addressId: id,
      })
      return NextResponse.json(
        { error: 'Accès non autorisé à cette adresse.' },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  6. Normalisation des données                                    */
    /* ---------------------------------------------------------------- */
    const updatePayload: Record<string, unknown> = {}

    if ('nom' in updateData && updateData.nom !== undefined) {
      updatePayload.nom = updateData.nom.trim()
    }
    if ('province_id' in updateData) {
      updatePayload.province_id = updateData.province_id || null
    }
    if ('ville_id' in updateData) {
      updatePayload.ville_id = updateData.ville_id || null
    }
    if ('commune_id' in updateData) {
      updatePayload.commune_id = updateData.commune_id || null
    }
    if ('quartier' in updateData && updateData.quartier !== undefined) {
      updatePayload.quartier = updateData.quartier.trim()
    }
    if ('avenue' in updateData && updateData.avenue !== undefined) {
      updatePayload.avenue = updateData.avenue.trim()
    }
    if ('numero' in updateData) {
      updatePayload.numero = updateData.numero?.trim() || null
    }
    if ('reference' in updateData) {
      updatePayload.reference = updateData.reference?.trim() || null
    }
    if ('telephone' in updateData) {
      if (updateData.telephone) {
        if (!isValidPhone(updateData.telephone)) {
          return NextResponse.json(
            { error: 'Format de numéro invalide.' },
            { status: 400 }
          )
        }
        updatePayload.telephone = normalizePhone(updateData.telephone)
      } else {
        updatePayload.telephone = null
      }
    }

    // Reconstruire adresse_text si les champs géographiques ont changé
    if (
      'quartier' in updateData ||
      'avenue' in updateData ||
      'numero' in updateData ||
      'reference' in updateData
    ) {
      const adresseParts = [
        updatePayload.quartier || updateData.quartier,
        updatePayload.avenue || updateData.avenue,
        updatePayload.numero || updateData.numero,
      ]
        .filter(Boolean)
        .map((s) => (typeof s === 'string' ? s.trim() : s))

      updatePayload.adresse_text =
        adresseParts.join(', ') ||
        updatePayload.reference ||
        updateData.reference ||
        ''
    }

    updatePayload.updated_at = new Date().toISOString()

    /* ---------------------------------------------------------------- */
    /*  7. Mettre à jour l'adresse                                      */
    /* ---------------------------------------------------------------- */
    const { data: updatedAddress, error: updateError } = await supabaseAdmin
      .from('user_addresses')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      logAddresses('PUT update error', {
        userId: user.id,
        addressId: id,
        error: updateError.message,
      })
      return NextResponse.json(
        { error: "Erreur lors de la modification de l'adresse." },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  8. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logAddresses('PUT success', {
      userId: user.id,
      addressId: id,
      updatedFields: Object.keys(updatePayload).filter((k) => k !== 'updated_at'),
      durationMs: duration,
    })

    const response = NextResponse.json({
      data: buildAddressResponse(updatedAddress),
    })

    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: any) {
    logAddresses('PUT unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE : Supprimer une adresse                                     */
/* ------------------------------------------------------------------ */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `addresses:delete:${ip}`,
    maxRequests: 10,
    windowSeconds: 60,
  })

  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans une minute.', code: 'RATE_LIMITED' },
        { status: 429 }
      ),
      rateLimitHeaders
    )
  }

  try {
    /* ---------------------------------------------------------------- */
    /*  1. Authentification                                             */
    /* ---------------------------------------------------------------- */
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.session_expired },
        { status: 401 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  2. Vérification des flags de sécurité                           */
    /* ---------------------------------------------------------------- */
    if (isUserBanned(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_banned },
        { status: 403 }
      )
    }

    if (isUserDeleted(user)) {
      return NextResponse.json(
        { error: AUTH_ERROR_MESSAGES.account_deleted },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  3. Extraire l'ID depuis les query params                        */
    /* ---------------------------------------------------------------- */
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: "ID de l'adresse requis." },
        { status: 400 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  4. Vérifier que l'adresse appartient à l'utilisateur            */
    /* ---------------------------------------------------------------- */
    const supabaseAdmin = await createServiceClient()
    const { data: existingAddress, error: fetchError } = await supabaseAdmin
      .from('user_addresses')
      .select('id, user_id, nom')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !existingAddress) {
      return NextResponse.json(
        { error: 'Adresse introuvable.' },
        { status: 404 }
      )
    }

    if (existingAddress.user_id !== user.id) {
      logAddresses('DELETE unauthorized access attempt', {
        userId: user.id,
        targetUserId: existingAddress.user_id,
        addressId: id,
      })
      return NextResponse.json(
        { error: 'Accès non autorisé à cette adresse.' },
        { status: 403 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  5. Supprimer l'adresse                                          */
    /* ---------------------------------------------------------------- */
    const { error: deleteError } = await supabaseAdmin
      .from('user_addresses')
      .delete()
      .eq('id', id)

    if (deleteError) {
      logAddresses('DELETE error', {
        userId: user.id,
        addressId: id,
        error: deleteError.message,
      })
      return NextResponse.json(
        { error: "Erreur lors de la suppression de l'adresse." },
        { status: 500 }
      )
    }

    /* ---------------------------------------------------------------- */
    /*  6. Réponse                                                      */
    /* ---------------------------------------------------------------- */
    const duration = Date.now() - startTime
    logAddresses('DELETE success', {
      userId: user.id,
      addressId: id,
      addressName: existingAddress.nom,
      durationMs: duration,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Adresse supprimée avec succès.',
    })

    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: any) {
    logAddresses('DELETE unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return NextResponse.json(
      { error: AUTH_ERROR_MESSAGES.server },
      { status: 500 }
    )
  }
}