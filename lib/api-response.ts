import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/**
 * Retourne une réponse de succès standardisée.
 */
export function successResponse<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    {
      success: true,
      ...(typeof data === 'object' && data !== null && !Array.isArray(data)
        ? data
        : { data }),
    },
    { status, headers }
  )
}

/**
 * Retourne une réponse d'erreur standardisée.
 */
export function errorResponse(message: string, status = 500, details?: any) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  )
}

/**
 * Retourne une réponse d'erreur de validation Zod formatée (status 400).
 */
export function validationErrorResponse(error: ZodError | any) {
  const details = error instanceof ZodError ? error.flatten() : error
  return errorResponse('Données ou paramètres invalides', 400, details)
}
