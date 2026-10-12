// lib/currency.ts

import { createClient } from '@/lib/supabaseServer' // pour usage serveur
import type { SupabaseClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface Devise {
  id: string
  code: string
  symbole: string
  taux_conversion: number // par rapport à la devise de base (CDF)
  actif: boolean
}

/* ------------------------------------------------------------------ */
/*  Cache simple (mémoire) pour les devises                             */
/* ------------------------------------------------------------------ */
let cachedDevises: Devise[] | null = null
let cacheExpiry: number = 0

/**
 * Récupère toutes les devises actives (et inactives si besoin).
 * @param supabase - client Supabase (serveur ou browser)
 * @param onlyActive - si true, ne retourne que les devises actives
 * @returns liste des devises
 */
export async function getDevises(
  supabase: SupabaseClient,
  onlyActive: boolean = true,
): Promise<Devise[]> {
  const now = Date.now()
  if (cachedDevises && now < cacheExpiry) {
    return onlyActive
      ? cachedDevises.filter((d) => d.actif)
      : cachedDevises
  }

  const query = supabase.from('devises').select('*')
  if (onlyActive) query.eq('actif', true)

  const { data, error } = await query.order('code')
  if (error) {
    console.error('Erreur chargement devises:', error.message)
    return []
  }

  cachedDevises = data as Devise[]
  cacheExpiry = now + 60_000 // cache 60 secondes
  return data as Devise[]
}

/**
 * Récupère une devise par son code.
 */
export async function getDeviseByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<Devise | null> {
  const devises = await getDevises(supabase, false)
  return devises.find((d) => d.code === code) || null
}

/* ------------------------------------------------------------------ */
/*  Fonctions de conversion                                             */
/* ------------------------------------------------------------------ */

/**
 * Convertit un montant d’une devise source vers une devise cible.
 * Les taux sont supposés relatifs à la devise de base (CDF).
 * Exemple : convertCurrency(100, 'CDF', 'USD', devises) → 100 / 2800
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  devises: Devise[],
): number {
  const from = devises.find((d) => d.code === fromCode)
  const to = devises.find((d) => d.code === toCode)
  if (!from || !to) throw new Error(`Devise inconnue : ${fromCode} ou ${toCode}`)
  // Conversion via CDF comme pivot
  const amountInBase = amount * from.taux_conversion
  return amountInBase / to.taux_conversion
}

/* ------------------------------------------------------------------ */
/*  Formatage d’un montant avec symbole et décimales                     */
/* ------------------------------------------------------------------ */

/**
 * Formate un montant dans une devise donnée.
 * @param amount - le montant numérique
 * @param code - code de la devise (ex: 'CDF', 'USD')
 * @param devises - liste des devises (pour récupérer le symbole)
 * @param locale - locale pour le formatage (par défaut 'fr-FR')
 */
export function formatCurrency(
  amount: number,
  code: string,
  devises: Devise[],
  locale: string = 'fr-FR',
): string {
  const devise = devises.find((d) => d.code === code)
  if (!devise) return `${amount} ???`

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'CDF' ? 0 : 2,
      maximumFractionDigits: code === 'CDF' ? 0 : 2,
    }).format(amount)
  } catch {
    // Fallback manuel
    const symbol = devise.symbole || code
    const fractionDigits = code === 'CDF' ? 0 : 2
    return `${amount.toFixed(fractionDigits)} ${symbol}`
  }
}

/**
 * Formate un montant avec le symbole court (sans l’objet Intl).
 */
export function formatCurrencyShort(
  amount: number,
  code: string,
  devises: Devise[],
): string {
  const devise = devises.find((d) => d.code === code)
  const symbol = devise?.symbole || code
  const fractionDigits = code === 'CDF' ? 0 : 2
  return `${amount.toFixed(fractionDigits)} ${symbol}`
}

/* ------------------------------------------------------------------ */
/*  Hook React Query pour usage côté client (optionnel)                 */
/* ------------------------------------------------------------------ */
import { useQuery } from '@tanstack/react-query'

export function useCurrencies(onlyActive: boolean = true) {
  return useQuery<Devise[]>({
    queryKey: ['currencies', onlyActive],
    queryFn: async () => {
      const res = await fetch('/api/devises')
      if (!res.ok) throw new Error('Erreur chargement devises')
      return res.json()
    },
    staleTime: 60_000,
  })
}