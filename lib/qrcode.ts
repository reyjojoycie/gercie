// lib/qrcode.ts
import QRCode from 'qrcode'

/* ------------------------------------------------------------------ */
/*  Configuration par défaut                                            */
/* ------------------------------------------------------------------ */
const DEFAULT_OPTIONS: QRCode.QRCodeToDataURLOptions = {
  width: 200,
  margin: 2,
  color: {
    dark: '#B8860B', // gold foncé
    light: '#FFFFFF00', // transparent
  },
  errorCorrectionLevel: 'M',
}

/* ------------------------------------------------------------------ */
/*  Cache simple (mémoire)                                              */
/* ------------------------------------------------------------------ */
const qrCache = new Map<string, string>()
const MAX_CACHE_SIZE = 50

/* ------------------------------------------------------------------ */
/*  Génération d'un QR code en data URL                                 */
/* ------------------------------------------------------------------ */
/**
 * Génère une data URL (PNG) pour un texte donné.
 * @param text - le contenu à encoder (ex: code client, code livreur)
 * @param options - options de rendu (taille, couleurs)
 * @returns data URL ou null en cas d'erreur
 */
export async function generateQRCodeDataURL(
  text: string,
  options?: Partial<QRCode.QRCodeToDataURLOptions>,
): Promise<string | null> {
  if (!text) return null

  const cacheKey = `dataurl:${text}:${JSON.stringify(options || {})}`
  const cached = qrCache.get(cacheKey)
  if (cached) return cached

  try {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
    const dataUrl = await QRCode.toDataURL(text, mergedOptions)

    // Gérer la taille du cache
    if (qrCache.size >= MAX_CACHE_SIZE) {
      const firstKey = qrCache.keys().next().value
      if (firstKey !== undefined) qrCache.delete(firstKey)
    }
    qrCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch (err) {
    console.error('Erreur génération QR code data URL:', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Génération d'un QR code en chaîne SVG                               */
/* ------------------------------------------------------------------ */
/**
 * Génère une chaîne SVG pour un texte donné.
 * @param text - contenu à encoder
 * @param options - options de rendu
 * @returns chaîne SVG ou null en cas d'erreur
 */
export async function generateQRCodeSVG(
  text: string,
  options?: Partial<QRCode.QRCodeToStringOptions>,
): Promise<string | null> {
  if (!text) return null

  const cacheKey = `svg:${text}:${JSON.stringify(options || {})}`
  const cached = qrCache.get(cacheKey)
  if (cached) return cached

  try {
    const mergedOptions: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      width: options?.width || 200,
      margin: options?.margin || 2,
      color: options?.color || { dark: '#B8860B', light: '#FFFFFF00' },
      errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
    }
    const svg = await QRCode.toString(text, mergedOptions)

    if (qrCache.size >= MAX_CACHE_SIZE) {
      const firstKey = qrCache.keys().next().value
      if (firstKey !== undefined) qrCache.delete(firstKey)
    }
    qrCache.set(cacheKey, svg)
    return svg
  } catch (err) {
    console.error('Erreur génération QR code SVG:', err)
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Raccourcis pour les codes de commande                               */
/* ------------------------------------------------------------------ */
/**
 * Génère le QR code pour le code client d'une commande.
 * @param codeClient - le code client (6 caractères)
 * @returns data URL ou null
 */
export async function generateClientCodeQR(codeClient: string): Promise<string | null> {
  return generateQRCodeDataURL(codeClient)
}

/**
 * Génère le QR code pour le code livreur d'une commande.
 * @param codeLivreur - le code livreur (6 caractères)
 * @returns data URL ou null
 */
export async function generateLivreurCodeQR(codeLivreur: string): Promise<string | null> {
  return generateQRCodeDataURL(codeLivreur)
}