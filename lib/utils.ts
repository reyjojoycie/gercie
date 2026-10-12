// lib/utils.ts
/**
 * Utilitaires ultra‑premium pour Gercie.
 *
 * Fonctions existantes conservées + 30+ améliorations professionnelles :
 *  - Fusion de classes Tailwind (cn)
 *  - Formateurs de prix (CDF, USD, pourcentage)
 *  - Validateurs d’URL, email, téléphone
 *  - Manipulation sécurisée des objets et tableaux
 *  - Génération d’UUID, slug, identifiants courts
 *  - Gestion du localStorage / sessionStorage avec sécurité SSR
 *  - Debounce, throttle
 *  - Copie dans le presse‑papier
 *  - Troncature de texte, capitalisation
 *  - Détection du type d’appareil, navigateur, OS
 *  - Extraction de paramètres d’URL
 *  - Formatage de dates simples
 *  - Utilitaires de couleur (hex to rgb, contraste)
 *  - Génération de chaînes aléatoires
 *  - Deep clone simple
 *  - Fusion profonde (deep merge)
 *  - Détection d’environnement (client / serveur)
 *  - Fonction de pause (sleep)
 *  - Conversion de devises (placeholder)
 *  - Conformité Gercie : pas de casse, enrichissements constants
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ============================================================================
// 1. Fusion de classes Tailwind (conservée)
// ============================================================================
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ============================================================================
// 2. Environnement
// ============================================================================
export const isBrowser = typeof window !== 'undefined'
export const isServer = !isBrowser
export const isDev = process.env.NODE_ENV === 'development'
export const isProd = process.env.NODE_ENV === 'production'

// ============================================================================
// 3. Formateurs de prix et devises
// ============================================================================
export function formatPrice(
  amount: number,
  currency: 'CDF' | 'USD' = 'CDF',
  locale: string = 'fr-CD'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount)
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`
  }
}

export function formatCompactPrice(amount: number, currency: 'CDF' | 'USD' = 'CDF'): string {
  const formatted = new Intl.NumberFormat('fr', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(amount)
  return `${formatted} ${currency}`
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// ============================================================================
// 4. Formatage de dates
// ============================================================================
export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(date)
  return d.toLocaleDateString('fr-FR', options)
}

export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date)
  return d.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function timeAgo(date: Date | string | number): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const seconds = Math.floor((now - then) / 1000)
  if (seconds < 60) return "À l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Il y a ${days} j`
  return formatDate(date)
}

// ============================================================================
// 5. Chaînes de caractères
// ============================================================================
export function truncate(str: string, maxLength: number, suffix = '…'): string {
  if (!str) return ''
  return str.length > maxLength ? str.slice(0, maxLength - suffix.length) + suffix : str
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function slugify(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function generateId(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============================================================================
// 6. Validation
// ============================================================================
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s()-]/g, ''))
}

export function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// 7. Débounce et throttle
// ============================================================================
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let lastCall = 0
  return (...args) => {
    const now = Date.now()
    if (now - lastCall >= limit) {
      lastCall = now
      fn(...args)
    }
  }
}

// ============================================================================
// 8. Stockage local sécurisé (SSR-safe)
// ============================================================================
export function safeLocalStorage(): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
} {
  if (isBrowser) {
    return {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    }
  }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
}

// ============================================================================
// 9. Presse‑papier
// ============================================================================
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// 10. Objets et tableaux
// ============================================================================
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== 'undefined') return structuredClone(obj)
  return JSON.parse(JSON.stringify(obj))
}

export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = deepMerge(target[key] || {}, source[key])
      } else {
        (target as any)[key] = source[key]
      }
    }
  }
  return target
}

export function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  keys.forEach(key => delete result[key])
  return result
}

export function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  keys.forEach(key => {
    if (key in obj) result[key] = obj[key]
  })
  return result
}

// ============================================================================
// 11. URL et recherche
// ============================================================================
export function getQueryParams(url?: string): Record<string, string> {
  const search = url ? new URL(url).search : isBrowser ? window.location.search : ''
  const params = new URLSearchParams(search)
  const obj: Record<string, string> = {}
  params.forEach((value, key) => {
    obj[key] = value
  })
  return obj
}

export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base, isBrowser ? window.location.origin : 'http://localhost')
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value))
  })
  return url.toString()
}

// ============================================================================
// 12. Détection navigateur / appareil (utile pour UX)
// ============================================================================
export function getUserAgentInfo(): { os: string; browser: string; mobile: boolean } {
  if (!isBrowser) return { os: 'unknown', browser: 'unknown', mobile: false }
  const ua = navigator.userAgent
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
  let os = 'unknown'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  let browser = 'unknown'
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome'
  else if (/Firefox/.test(ua)) browser = 'Firefox'
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  else if (/Edg/.test(ua)) browser = 'Edge'
  return { os, browser, mobile }
}

// ============================================================================
// 13. Utilitaires de couleur (hex/rgb)
// ============================================================================
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const a = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}

export function getTextColorForBackground(hex: string): '#ffffff' | '#000000' {
  return getLuminance(hex) > 0.5 ? '#000000' : '#ffffff'
}

// ============================================================================
// 14. Sleep / pause
// ============================================================================
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// 15. Génération de plages de nombres
// ============================================================================
export function range(start: number, end: number, step = 1): number[] {
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => start + i * step)
}

// ============================================================================
// 16. Conversion devise simplifiée (placeholder – peut être relié à l'API)
// ============================================================================
export function convertCurrency(
  amount: number,
  from: 'CDF' | 'USD',
  to: 'CDF' | 'USD',
  rate: number // à récupérer depuis l'API exchange rate
): number {
  if (from === to) return amount
  return from === 'USD' ? amount * rate : amount / rate
}