// components/CategoryIcon.tsx
import React, { useMemo, memo } from 'react'
import * as Icons from 'lucide-react'
import { getCategoryIcon } from '@/lib/categories'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type IconVariant = 'brand' | 'accent' | 'warm' | 'neutral' | 'gold' | 'danger' | 'success'

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number

export interface CategoryIconProps {
  /** Nom de la catégorie pour déterminer l'icône */
  categoryName: string
  /** Taille de l'icône (preset ou nombre en px) */
  size?: IconSize
  /** Classes CSS additionnelles */
  className?: string
  /** Variante de couleur prédéfinie */
  variant?: IconVariant
  /** Permet de surcharger les classes de couleur */
  colorClassName?: string
  /** Label accessible (si l'icône est informative, pas décorative) */
  'aria-label'?: string
  /** Rôle ARIA (par défaut "img" si aria-label, sinon "presentation") */
  role?: 'img' | 'presentation'
  /** Animation au hover */
  hoverAnimation?: boolean
  /** Animation pulse continue */
  pulseAnimation?: boolean
  /** Afficher un badge/notification */
  badge?: number | string | null
  /** Couleur du badge */
  badgeVariant?: 'default' | 'danger' | 'success' | 'warning'
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const VARIANT_STYLES: Record<IconVariant, string> = {
  brand: 'text-brand-600 dark:text-brand-400',
  accent: 'text-accent-600 dark:text-accent-400',
  warm: 'text-warm-600 dark:text-warm-400',
  neutral: 'text-neutral-600 dark:text-neutral-400',
  gold: 'text-gold-600 dark:text-gold-400',
  danger: 'text-danger-600 dark:text-danger-400',
  success: 'text-success-600 dark:text-success-400',
}

const SIZE_MAP: Record<Exclude<IconSize, number>, number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
}

const BADGE_STYLES: Record<string, string> = {
  default: 'bg-brand-500 text-white',
  danger: 'bg-danger-500 text-white',
  success: 'bg-success-500 text-white',
  warning: 'bg-warning-500 text-white',
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function getPixelSize(size: IconSize): number {
  if (typeof size === 'number') return size
  return SIZE_MAP[size] || SIZE_MAP.md
}

function isValidIconName(iconName: string): boolean {
  return iconName in Icons
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Icône de catégorie avec design system intégré.
 * 
 * Optimisé pour :
 * - Performance (memoization, React.memo)
 * - Accessibilité (aria-label, role)
 * - Responsive (tailles adaptatives)
 * - Stabilité (fallback robuste, validation)
 */
export const CategoryIcon = memo<CategoryIconProps>(({
  categoryName,
  size = 'md',
  className = '',
  variant = 'brand',
  colorClassName,
  'aria-label': ariaLabel,
  role,
  hoverAnimation = false,
  pulseAnimation = false,
  badge,
  badgeVariant = 'default',
}) => {
  // Déterminer la taille en pixels
  const pixelSize = useMemo(() => getPixelSize(size), [size])

  // Déterminer le rôle ARIA
  const ariaRole = useMemo(() => {
    if (role) return role
    return ariaLabel ? 'img' : 'presentation'
  }, [role, ariaLabel])

  // Déterminer si l'icône est décorative
  const isDecorative = !ariaLabel

  // Récupérer le nom de l'icône
  const iconName = useMemo(() => {
    try {
      return getCategoryIcon(categoryName)
    } catch (err) {
      console.warn('Erreur getCategoryIcon:', err)
      return null
    }
  }, [categoryName])

  // Récupérer le composant icône
  const IconComponent = useMemo(() => {
    if (!iconName || !isValidIconName(iconName)) {
      return Icons.Tag // Fallback par défaut
    }
    return (Icons as any)[iconName] || Icons.Tag
  }, [iconName])

  // Classes de couleur
  const colorClass = colorClassName ?? VARIANT_STYLES[variant]

  // Classes d'animation
  const animationClasses = useMemo(() => {
    const classes: string[] = []
    
    if (hoverAnimation) {
      classes.push('group-hover:scale-110 transition-transform duration-200')
    }
    
    if (pulseAnimation) {
      classes.push('animate-pulse')
    }
    
    return classes.join(' ')
  }, [hoverAnimation, pulseAnimation])

  // Classes finales
  const iconClasses = cn(
    'transition-colors',
    colorClass,
    animationClasses,
    className
  )

  // Formater le badge
  const badgeText = useMemo(() => {
    if (badge === null || badge === undefined) return null
    if (typeof badge === 'number') {
      return badge > 99 ? '99+' : badge.toString()
    }
    return badge.toString()
  }, [badge])

  return (
    <div className="relative inline-flex items-center justify-center">
      <IconComponent
        size={pixelSize}
        className={iconClasses}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={ariaRole}
        focusable="false"
      />
      
      {/* Badge/notification */}
      {badgeText && (
        <span
          className={cn(
            'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1',
            'flex items-center justify-center',
            'text-xs font-bold rounded-full',
            'border-2 border-white dark:border-neutral-900',
            BADGE_STYLES[badgeVariant]
          )}
          aria-label={`${badgeText} notification${badgeText !== '1' ? 's' : ''}`}
        >
          {badgeText}
        </span>
      )}
    </div>
  )
})

CategoryIcon.displayName = 'CategoryIcon'

export default CategoryIcon