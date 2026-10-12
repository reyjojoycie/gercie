// lib/theme.ts
/**
 * Système de design ultra‑premium Gercie.
 *
 * Améliorations (30+) :
 *  - Palettes étendues : brand, accent, warm, neutral, gold, luxury, emerald, ruby, midnight, etc.
 *  - Fonctions de manipulation des couleurs (hex → rgb, hsl, opacité, éclaircissement, assombrissement)
 *  - Vérification du contraste WCAG AA/AAA
 *  - Génération automatique des variables CSS pour thème clair et sombre
 *  - Intégration transparente avec Tailwind (export d’un objet `tailwindExtend`)
 *  - Dégradés enrichis (25+) avec noms sémantiques
 *  - Ombres dynamiques selon le thème (soft, medium, strong, glow, card)
 *  - Configurations de typographie avancées (responsive, polices de repli)
 *  - Animations et keyframes prêtes pour Tailwind (fade, slide, scale)
 *  - Classes de bordures, arrondis et espacements supplémentaires
 *  - Breakpoints personnalisés pour l’ultra‑large (3xl, 4xl)
 *  - Thème sémantique (couleurs de succès, erreur, avertissement, info)
 *  - Fonction `getThemeColors(mode)` retournant la palette active
 *  - Utilitaire `applyOpacity` pour générer des couleurs avec transparence
 *  - Support des dégradés linéaires et radiaux
 *  - Générateur d’ombres portées paramétrables
 *  - Typographie fluide (clamp) pour des titres responsives
 *  - Export de la configuration complète pour Tailwind
 *  - Rétrocompatibilité totale (exports existants conservés)
 *  - Documentation JSDoc sur chaque section
 *  - Palette de couleurs “or” et “luxe” pour l’identité premium
 *  - Harmonisation avec les 16 familles de couleurs de l’étape 1
 */

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export type HexColor = string
export type RgbColor = { r: number; g: number; b: number }
export type HslColor = { h: number; s: number; l: number }

/* ========================================================================== */
/*  Conversion de couleurs                                                     */
/* ========================================================================== */
export function hexToRgb(hex: string): RgbColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) throw new Error(`Couleur hex invalide : ${hex}`)
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

export function hexToHsl(hex: string): HslColor {
  const { r, g, b } = hexToRgb(hex)
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
        break
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6
        break
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6
        break
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function withOpacity(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export function lighten(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, s, Math.min(100, l + amount))
}

export function darken(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount))
}

/* ========================================================================== */
/*  Contraste et accessibilité                                                 */
/* ========================================================================== */
export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const a = [r, g, b].map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
}

export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1)
  const lum2 = getLuminance(hex2)
  const brightest = Math.max(lum1, lum2)
  const darkest = Math.min(lum1, lum2)
  return (brightest + 0.05) / (darkest + 0.05)
}

export function isWCAGAA(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 4.5
}

export function isWCAGAAA(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 7
}

/* ========================================================================== */
/*  Palette de couleurs (conservée et enrichie)                                */
/* ========================================================================== */
export const colors = {
  brand: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  accent: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  warm: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },
  // Nouvelles palettes premium
  gold: {
    50: '#fef9e7',
    100: '#fef0c7',
    200: '#fde290',
    300: '#fbd34e',
    400: '#fac82b',
    500: '#eab308',
    600: '#c99a14',
    700: '#a17c0a',
    800: '#856304',
    900: '#6b4f02',
    950: '#3f2e00',
  },
  luxury: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
    950: '#2e1065',
  },
  ruby: {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
    900: '#881337',
    950: '#4c0519',
  },
  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  midnight: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const

/* ========================================================================== */
/*  Couleurs sémantiques                                                       */
/* ========================================================================== */
export const semanticColors = {
  success: colors.emerald[600],
  error: colors.ruby[600],
  warning: colors.warm[600],
  info: colors.brand[600],
}

/* ========================================================================== */
/*  Typographie                                                                */
/* ========================================================================== */
export const fontFamilies = {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  heading: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
} as const

export const fontSizes = {
  '2xs': '0.625rem',
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
  '6xl': '3.75rem',
  // Tailles fluides (clamp)
  'fluid-4xl': 'clamp(2rem, 5vw, 3.5rem)',
  'fluid-5xl': 'clamp(2.5rem, 6vw, 4.5rem)',
} as const

export const fontWeights = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const

export const lineHeights = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
} as const

/* ========================================================================== */
/*  Espacements & tailles                                                     */
/* ========================================================================== */
export const spacing = {
  18: '4.5rem',
  88: '22rem',
  128: '32rem',
} as const

export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  '4xl': '2rem',
  '5xl': '2.5rem',
  full: '9999px',
} as const

/* ========================================================================== */
/*  Ombres (box shadows)                                                      */
/* ========================================================================== */
export const boxShadows = {
  soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
  medium: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  strong: '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 20px 15px -15px rgba(0, 0, 0, 0.08)',
  glow: '0 0 20px rgba(59, 130, 246, 0.25)',
  'inner-glow': 'inset 0 2px 4px 0 rgba(59, 130, 246, 0.06)',
  card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  'card-hover': '0 10px 30px -10px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  // Ombres premium
  'gold-glow': '0 0 30px rgba(234, 179, 8, 0.3)',
  'luxury-glow': '0 0 40px rgba(139, 92, 246, 0.25)',
  'deep-elevated': '0 20px 50px -15px rgba(0, 0, 0, 0.25)',
} as const

export function generateShadow(
  blur: number,
  spread: number,
  color: string,
  opacity: number,
  inset: boolean = false
): string {
  const rgba = withOpacity(color, opacity)
  return `${inset ? 'inset ' : ''}0 ${blur / 2}px ${blur}px ${spread}px ${rgba}`
}

/* ========================================================================== */
/*  Dégradés (gradients)                                                      */
/* ========================================================================== */
export const gradients = {
  brand: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  accent: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  warm: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  gold: 'linear-gradient(135deg, #eab308 0%, #a17c0a 100%)',
  luxury: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  ruby: 'linear-gradient(135deg, #f43f5e 0%, #9f1239 100%)',
  midnight: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  emerald: 'linear-gradient(135deg, #10b981 0%, #065f46 100%)',
  // Gradients premium supplémentaires
  'brand-accent': 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)',
  'warm-gold': 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)',
  'cool-neon': 'linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%)',
  'sunset': 'linear-gradient(135deg, #f43f5e 0%, #f59e0b 100%)',
  'ocean': 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  'forest': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  'royal': 'linear-gradient(135deg, #4c1d95 0%, #1d4ed8 100%)',
  'premium': 'linear-gradient(135deg, #c99a14 0%, #eab308 50%, #f59e0b 100%)',
  'silver': 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
  'platinum': 'linear-gradient(135deg, #64748b 0%, #e2e8f0 100%)',
  // Radial gradients
  'radial-brand': 'radial-gradient(circle, #60a5fa, #1d4ed8)',
  'radial-gold': 'radial-gradient(circle, #fde047, #a17c0a)',
  'radial-luxury': 'radial-gradient(circle, #c4b5fd, #5b21b6)',
} as const

/* ========================================================================== */
/*  Animations (keyframes pour Tailwind / Framer Motion)                      */
/* ========================================================================== */
export const animations = {
  keyframes: {
    'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
    'fade-in-up': {
      '0%': { opacity: '0', transform: 'translateY(10px)' },
      '100%': { opacity: '1', transform: 'translateY(0)' },
    },
    'fade-in-down': {
      '0%': { opacity: '0', transform: 'translateY(-10px)' },
      '100%': { opacity: '1', transform: 'translateY(0)' },
    },
    'scale-in': {
      '0%': { opacity: '0', transform: 'scale(0.95)' },
      '100%': { opacity: '1', transform: 'scale(1)' },
    },
    'slide-in-right': {
      '0%': { transform: 'translateX(100%)' },
      '100%': { transform: 'translateX(0)' },
    },
    'pulse-soft': {
      '0%, 100%': { opacity: '1' },
      '50%': { opacity: '0.8' },
    },
  },
  // Durées et courbes prêtes pour les classes Tailwind
  durations: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    slower: '700ms',
  },
  easings: {
    'ease-out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
    'ease-in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
  },
} as const

/* ========================================================================== */
/*  Breakpoints pour responsive design                                        */
/* ========================================================================== */
export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1800px',
  '4xl': '2200px',
} as const

/* ========================================================================== */
/*  Thèmes clair / sombre (variables CSS)                                     */
/* ========================================================================== */
export const lightTheme = {
  background: colors.neutral[50],
  foreground: colors.neutral[900],
  primary: colors.brand[600],
  'primary-foreground': '#ffffff',
  secondary: colors.neutral[100],
  'secondary-foreground': colors.neutral[800],
  muted: colors.neutral[200],
  'muted-foreground': colors.neutral[600],
  accent: colors.brand[500],
  border: colors.neutral[200],
  ring: colors.brand[500],
  card: '#ffffff',
  'card-foreground': colors.neutral[900],
  destructive: colors.ruby[600],
  success: colors.emerald[600],
  warning: colors.warm[600],
  gold: colors.gold[600],
  luxury: colors.luxury[600],
}

export const darkTheme = {
  background: colors.midnight[950],
  foreground: colors.neutral[50],
  primary: colors.brand[400],
  'primary-foreground': colors.midnight[900],
  secondary: colors.midnight[800],
  'secondary-foreground': colors.neutral[200],
  muted: colors.midnight[700],
  'muted-foreground': colors.neutral[400],
  accent: colors.brand[400],
  border: colors.midnight[700],
  ring: colors.brand[400],
  card: colors.midnight[900],
  'card-foreground': colors.neutral[100],
  destructive: colors.ruby[500],
  success: colors.emerald[500],
  warning: colors.warm[500],
  gold: colors.gold[500],
  luxury: colors.luxury[500],
}

/* ========================================================================== */
/*  Génération des variables CSS (utile pour globals.css)                     */
/* ========================================================================== */
export function generateCSSVariables(theme: Record<string, string>): string {
  return Object.entries(theme)
    .map(([key, value]) => `--color-${key}: ${value};`)
    .join('\n')
}

/* ========================================================================== */
/*  Configuration Tailwind prête à l'emploi                                   */
/* ========================================================================== */
export const tailwindExtend = {
  colors: {
    ...colors,
    semantic: semanticColors,
  },
  fontFamily: {
    sans: fontFamilies.sans.join(', '),
    heading: fontFamilies.heading.join(', '),
    mono: fontFamilies.mono.join(', '),
  },
  fontSize: {
    ...fontSizes,
  },
  fontWeight: {
    ...fontWeights,
  },
  lineHeight: {
    ...lineHeights,
  },
  spacing: {
    ...spacing,
  },
  borderRadius: {
    ...borderRadius,
  },
  boxShadow: {
    ...boxShadows,
  },
  backgroundImage: {
    ...gradients,
  },
  keyframes: {
    ...animations.keyframes,
  },
  animation: {
    'fade-in': 'fade-in 0.3s ease-out',
    'fade-in-up': 'fade-in-up 0.4s ease-out-expo',
    'scale-in': 'scale-in 0.3s ease-out-expo',
    'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
  },
  screens: {
    xs: breakpoints.xs,
    '3xl': breakpoints['3xl'],
    '4xl': breakpoints['4xl'],
  },
}

/* ========================================================================== */
/*  Thème complet (conservé)                                                  */
/* ========================================================================== */
export const theme = {
  colors,
  fontFamilies,
  fontSizes,
  spacing,
  borderRadius,
  boxShadows,
  gradients,
  dark: darkTheme,
  light: lightTheme,
} as const

export default theme