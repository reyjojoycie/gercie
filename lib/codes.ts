// lib/codes.ts
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/*  Configuration                                                       */
/* ------------------------------------------------------------------ */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0, O, 1, I, l
const CODE_LENGTH = 6
const MAX_GENERATION_ATTEMPTS = 5

/* ------------------------------------------------------------------ */
/*  Génération brute d'un code                                          */
/* ------------------------------------------------------------------ */
/**
 * Génère un code alphanumérique sécurisé de 6 caractères.
 */
export function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}

/* ------------------------------------------------------------------ */
/*  Génération avec vérification d'unicité                              */
/* ------------------------------------------------------------------ */
/**
 * Génère un code unique pour une colonne donnée dans une table Supabase.
 * @param supabase - client Supabase (serveur ou browser)
 * @param column  - nom de la colonne (ex: 'code_client', 'code_livreur')
 * @param table   - nom de la table (ex: 'commandes')
 * @returns un code unique ou null si impossible
 */
export async function generateUniqueCode(
  supabase: SupabaseClient,
  column: string,
  table: string = 'commandes',
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = generateCode()
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq(column, code)
      .maybeSingle()

    if (error) {
      // Erreur de connexion ou de colonne, on log mais on continue pour éviter un crash
      console.error(`Erreur vérification unicité code (${column}):`, error.message)
      continue
    }

    if (!data) {
      return code // unique
    }
  }

  console.error(`Impossible de générer un code unique pour la colonne ${column} après ${MAX_GENERATION_ATTEMPTS} tentatives.`)
  return null
}

/* ------------------------------------------------------------------ */
/*  Validation de format                                                */
/* ------------------------------------------------------------------ */
/**
 * Vérifie qu'une chaîne est un code au format attendu (6 caractères alphanumériques).
 * Insensible à la casse, accepte uniquement les caractères de l'alphabet étendu.
 */
export function isValidCodeFormat(code: string): boolean {
  const regex = /^[A-Za-z0-9]{6}$/
  return regex.test(code)
}

/**
 * Normalise un code pour comparaison : majuscules, suppression des espaces.
 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}