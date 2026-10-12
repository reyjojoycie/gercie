// lib/confetti.ts
// ---------------------------------------------------------------------------
// Gestion des confettis ultra‑premium pour Gercie.
// Célébrations, succès, livraison terminée, etc.
// Intégration parfaite avec le thème, accessibilité et performance.
// ---------------------------------------------------------------------------

import confetti from 'canvas-confetti'
import { logger } from './logger' // optionnel pour loguer les erreurs discrètement

/* ========================================================================== */
/*  Types & Configuration                                                     */
/* ========================================================================== */

export interface ConfettiOptions {
  /** Durée en millisecondes (défaut 3000) */
  duration?: number
  /** Angle de dispersion (défaut 70) */
  spread?: number
  /** Vitesse initiale */
  startVelocity?: number
  /** Décélération */
  decay?: number
  /** Taille des particules */
  scalar?: number
  /** Couleurs (par défaut la palette Gercie dynamique) */
  colors?: string[]
  /** Point d'origine (0-1) */
  origin?: { x: number; y: number }
  /** Nombre de particules par frame (défaut 3) */
  particlesPerFrame?: number
  /** Forme des confettis (cercle, carré, étoile, coeur) */
  shapes?: ('circle' | 'square' | 'star' | 'heart')[]
  /** Active le son (défaut false) */
  sound?: boolean
  /** Volume sonore (0-1) */
  soundVolume?: number
  /** Z-index du canvas */
  zIndex?: number
  /** Désactive le confetti si l'utilisateur préfère la réduction de mouvement */
  respectReducedMotion?: boolean
}

// ---------------------------------------------------------------------------
// Palette de couleurs dynamique (utilise les variables CSS du thème)
// ---------------------------------------------------------------------------
function getThemeColors(): string[] {
  if (typeof window !== 'undefined') {
    const style = getComputedStyle(document.documentElement)
    return [
      style.getPropertyValue('--color-brand-600').trim() || '#2a4ae3',
      style.getPropertyValue('--color-brand-500').trim() || '#4766f7',
      style.getPropertyValue('--color-accent-600').trim() || '#0fa073',
      style.getPropertyValue('--color-accent-500').trim() || '#18c78a',
      style.getPropertyValue('--color-warm-600').trim() || '#d4ac0d',
      style.getPropertyValue('--color-warm-500').trim() || '#f6cf2a',
      style.getPropertyValue('--color-luxury-600').trim() || '#6d39d2',
      style.getPropertyValue('--color-luxury-500').trim() || '#8b5cf6',
    ].filter(Boolean)
  }
  // Fallback
  return [
    '#2a4ae3', '#4766f7', '#0fa073', '#18c78a',
    '#d4ac0d', '#f6cf2a', '#6d39d2', '#8b5cf6',
  ]
}

// ---------------------------------------------------------------------------
// Vérification des préférences de réduction de mouvement
// ---------------------------------------------------------------------------
function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------
// Effets sonores légers (optionnels)
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null
function playTinySound(volume = 0.1) {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 800
    gain.gain.value = volume
    osc.start()
    osc.stop(audioCtx.currentTime + 0.1)
  } catch (e) {
    // Silencieux – l'utilisateur n'a peut-être pas interagi
  }
}

// ---------------------------------------------------------------------------
// Fonction de base : lancement des confettis
// ---------------------------------------------------------------------------
let activeFrames: number[] = []

function addFrame(id: number) {
  activeFrames.push(id)
}

function clearAllFrames() {
  activeFrames.forEach(id => cancelAnimationFrame(id))
  activeFrames = []
}

export function triggerConfetti(options?: ConfettiOptions): () => void {
  const opts = options || {}
  const duration = opts.duration ?? 3000
  const spread = opts.spread ?? 70
  const startVelocity = opts.startVelocity ?? 60
  const decay = opts.decay ?? 0.9
  const scalar = opts.scalar ?? 1
  const colors = opts.colors ?? getThemeColors()
  const origin = opts.origin ?? { x: 0.5, y: 0.5 }
  const particlesPerFrame = opts.particlesPerFrame ?? 3
  const sound = opts.sound ?? false
  const soundVolume = opts.soundVolume ?? 0.1
  const respectReducedMotion = opts.respectReducedMotion ?? true
  const zIndex = opts.zIndex ?? 99999

  if (respectReducedMotion && shouldReduceMotion()) {
    // Ne rien lancer, mais on peut quand même émettre un son ?
    if (sound) playTinySound(soundVolume)
    return () => {} // fonction de nettoyage vide
  }

  const end = Date.now() + duration
  let stopped = false

  const frame = () => {
    if (stopped) return
    confetti({
      particleCount: particlesPerFrame,
      angle: 60,
      spread,
      origin,
      colors,
      startVelocity,
      decay,
      scalar,
      zIndex,
    })
    if (Date.now() < end) {
      const id = requestAnimationFrame(frame)
      addFrame(id)
    }
  }

  if (sound) playTinySound(soundVolume)
  const id = requestAnimationFrame(frame)
  addFrame(id)

  // Retourne une fonction pour stopper l'effet prématurément
  return () => {
    stopped = true
  }
}

// ---------------------------------------------------------------------------
// Effets spéciaux (conservés et enrichis)
// ---------------------------------------------------------------------------
export function confettiFromElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const x = (rect.left + rect.width / 2) / window.innerWidth
  const y = (rect.top + rect.height / 2) / window.innerHeight

  triggerConfetti({
    origin: { x, y },
    spread: 90,
    startVelocity: 30,
    decay: 0.9,
    scalar: 0.8,
    duration: 1500,
    particlesPerFrame: 2,
  })
}

export function confettiCelebration() {
  const duration = 5000
  const end = Date.now() + duration
  const colors = getThemeColors()

  const frame = () => {
    confetti({
      particleCount: 7,
      angle: 60,
      spread: 80,
      origin: { x: 0, y: 0.7 },
      colors,
    })
    confetti({
      particleCount: 7,
      angle: 120,
      spread: 80,
      origin: { x: 1, y: 0.7 },
      colors,
    })
    if (Date.now() < end) {
      requestAnimationFrame(frame)
    }
  }
  frame()
}

export function confettiRain() {
  const end = Date.now() + 3000
  const frame = () => {
    confetti({
      particleCount: 2,
      angle: 90,
      spread: 120,
      origin: { x: 0.5, y: 0 },
      colors: getThemeColors(),
      startVelocity: 30,
      decay: 0.98,
      scalar: 0.6,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

// ---------------------------------------------------------------------------
// Nouveaux effets premium
// ---------------------------------------------------------------------------
export function confettiFireworks(originX: number = 0.5, originY: number = 0.3) {
  const end = Date.now() + 4000
  const colors = getThemeColors()
  const frame = () => {
    confetti({
      particleCount: 15,
      angle: 270,
      spread: 360,
      origin: { x: originX, y: originY },
      colors,
      startVelocity: 40,
      decay: 0.92,
      scalar: 1.2,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

export function confettiHeart(originX: number = 0.5, originY: number = 0.5) {
  const scalar = 0.8
  const particleCount = 40
  // Utilisation de la forme "heart" via canvas-confetti (nécessite canvas-confetti v2+)
  confetti({
    particleCount,
    spread: 360,
    origin: { x: originX, y: originY },
    colors: getThemeColors(),
    shapes: ['heart'],
    scalar,
  })
}

export function confettiStars(originX: number = 0.5, originY: number = 0.5) {
  confetti({
    particleCount: 30,
    spread: 360,
    origin: { x: originX, y: originY },
    colors: getThemeColors(),
    shapes: ['star'],
    scalar: 0.9,
  })
}

export function confettiCascade(count = 3, delayMs = 800) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      triggerConfetti({
        duration: 1500,
        origin: { x: 0.5, y: 0.4 },
        spread: 50,
        startVelocity: 50,
        scalar: 1 - i * 0.1,
        particlesPerFrame: 4 - i,
      })
    }, i * delayMs)
  }
}

// ---------------------------------------------------------------------------
// Nettoyage manuel (utile dans un useEffect)
// ---------------------------------------------------------------------------
export function stopAllConfetti() {
  clearAllFrames()
}

// ---------------------------------------------------------------------------
// Réinitialisation du module (utile pour les tests)
// ---------------------------------------------------------------------------
export function resetConfetti() {
  stopAllConfetti()
  audioCtx?.close()
  audioCtx = null
}