// components/ui/Avatar.tsx
'use client'

import React, {
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useRef,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  ImgHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'
import { Tooltip } from './Tooltip' // composant amélioré existant
import { motion, AnimatePresence } from 'framer-motion'

/* ========================================================================
   Types
   ======================================================================== */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | number | string
type AvatarShape = 'circle' | 'rounded' | 'square' | 'hexagon' | 'squircle'
type AvatarVariant = 'solid' | 'outline' | 'glow' | 'gradient'
type AvatarStatus = 'online' | 'offline' | 'busy' | 'away' | 'none'
type AvatarBadgePosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type AvatarAnimation = 'none' | 'scale' | 'rotate' | 'fadeIn' | 'bounce'

interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** URL de l'image (prioritaire sur le fallback) */
  src?: string
  /** Texte alternatif (obligatoire pour l'accessibilité) */
  alt?: string
  /** Nom complet utilisé pour générer les initiales si src absent */
  name?: string
  /** Initiales personnalisées (si absentes, déduites du nom) */
  initials?: string
  /** Icône personnalisée (au lieu de l'image ou des initiales) */
  icon?: ReactNode
  /** Taille (prédéfinie ou personnalisée en pixels) */
  size?: AvatarSize
  /** Forme de l'avatar */
  shape?: AvatarShape
  /** Variante de style */
  variant?: AvatarVariant
  /** Statut (point coloré) */
  status?: AvatarStatus
  /** Position du statut */
  statusPosition?: 'top-right' | 'bottom-right'
  /** Badge (compteur, icône, etc.) */
  badge?: ReactNode
  /** Position du badge */
  badgePosition?: AvatarBadgePosition
  /** Couleur de fond en l'absence d'image */
  bgColor?: string
  /** Couleur du texte (initiales) */
  textColor?: string
  /** Tooltip au survol */
  tooltip?: string
  /** Délai du tooltip */
  tooltipDelay?: number
  /** Animation d'apparition */
  animation?: AvatarAnimation
  /** Désactive le chargement paresseux de l'image */
  eager?: boolean
  /** Fonction appelée en cas d'erreur de chargement de l'image */
  onImageError?: () => void
  /** Classe additionnelle */
  className?: string
  /** Children (optionnel, pour superposer du contenu) */
  children?: ReactNode
  /** Ref vers l'élément DOM */
  ref?: React.Ref<HTMLDivElement>
}

/* ========================================================================
   Contexte pour le groupe d'avatars (AvatarGroup)
   ======================================================================== */
interface AvatarGroupContextValue {
  /** Distance de chevauchement négative entre avatars */
  overlap: string
  /** Nombre maximum d'avatars visibles avant "+X" */
  maxVisible: number
  /** Taille commune (surcharge la taille individuelle si fournie) */
  groupSize?: AvatarSize
  /** Forme commune */
  groupShape?: AvatarShape
  /** Variante commune */
  groupVariant?: AvatarVariant
}

const AvatarGroupContext = createContext<AvatarGroupContextValue>({
  overlap: '-0.5rem',
  maxVisible: 5,
})

interface AvatarGroupProps {
  children: ReactNode
  /** Espacement négatif entre les avatars (ex: '-0.5rem') */
  overlap?: string
  /** Nombre maximal d'avatars avant d'afficher "+X" */
  maxVisible?: number
  /** Taille appliquée à tous les enfants si non spécifiée individuellement */
  size?: AvatarSize
  /** Forme appliquée à tous les enfants si non spécifiée */
  shape?: AvatarShape
  /** Variante appliquée à tous les enfants */
  variant?: AvatarVariant
  /** Classe additionnelle */
  className?: string
}

const AvatarGroup = ({
  children,
  overlap = '-0.5rem',
  maxVisible = 5,
  size,
  shape,
  variant,
  className,
}: AvatarGroupProps) => {
  const contextValue = useMemo(
    () => ({ overlap, maxVisible, groupSize: size, groupShape: shape, groupVariant: variant }),
    [overlap, maxVisible, size, shape, variant]
  )

  return (
    <AvatarGroupContext.Provider value={contextValue}>
      <div className={cn('flex items-center', className)}>{children}</div>
    </AvatarGroupContext.Provider>
  )
}

/* ========================================================================
   Utilitaires internes
   ======================================================================== */

// Taille prédéfinie vers pixels
const sizeMap: Record<string, string> = {
  xs: '1.5rem',
  sm: '2rem',
  md: '2.5rem',
  lg: '3rem',
  xl: '4rem',
  '2xl': '5rem',
  '3xl': '6rem',
}

const statusColorMap: Record<AvatarStatus, string> = {
  online: 'bg-green-500',
  offline: 'bg-neutral-400',
  busy: 'bg-red-500',
  away: 'bg-yellow-500',
  none: '',
}

// Forme
const shapeClasses: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  rounded: 'rounded-xl',
  square: 'rounded-md',
  hexagon: 'hexagon', // via clip-path
  squircle: 'rounded-[20%]',
}

// Variante
const variantClasses: Record<AvatarVariant, string> = {
  solid: '',
  outline: 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900',
  glow: 'shadow-glow-brand',
  gradient: 'p-[2px] bg-gradient-to-r from-gold-400 via-brand-400 to-luxury-500',
}

// Animation d'entrée
const animationVariants = {
  none: {},
  scale: {
    initial: { scale: 0 },
    animate: { scale: 1 },
    transition: { type: 'spring', stiffness: 500, damping: 30 },
  },
  rotate: {
    initial: { rotate: -180, opacity: 0 },
    animate: { rotate: 0, opacity: 1 },
    transition: { duration: 0.4 },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 },
  },
  bounce: {
    initial: { scale: 0.3, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { type: 'spring', stiffness: 400, damping: 10 },
  },
}

/* ========================================================================
   Composant Avatar
   ======================================================================== */
const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt = '',
      name,
      initials: initialsProp,
      icon,
      size = 'md',
      shape = 'circle',
      variant = 'solid',
      status = 'none',
      statusPosition = 'bottom-right',
      badge,
      badgePosition = 'top-right',
      bgColor,
      textColor,
      tooltip,
      tooltipDelay = 300,
      animation = 'fadeIn',
      eager = false,
      onImageError,
      className,
      children,
      ...imgProps
    },
    ref
  ) => {
    const [imgError, setImgError] = useState(false)
    const [imgLoaded, setImgLoaded] = useState(false)
    const groupCtx = useContext(AvatarGroupContext)

    // Surcharge par le groupe si présent
    const effectiveSize = groupCtx?.groupSize ?? size
    const effectiveShape = groupCtx?.groupShape ?? shape
    const effectiveVariant = groupCtx?.groupVariant ?? variant

    const sizeValue =
      typeof effectiveSize === 'number'
        ? `${effectiveSize}px`
        : sizeMap[effectiveSize as string] || effectiveSize

    // Calcul des initiales
    const initials = useMemo(() => {
      if (initialsProp) return initialsProp.toUpperCase().slice(0, 3)
      if (!name) return '?'
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 3)
    }, [name, initialsProp])

    // Couleurs automatiques si non fournies
    const autoColors = useMemo(() => {
      if (bgColor && textColor) return { bg: bgColor, text: textColor }
      // Génère une couleur de fond constante basée sur le nom (hash simple)
      const hash = (name || initials || 'avatar')
        .split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const hue = hash % 360
      return {
        bg: bgColor || `hsl(${hue}, 60%, 85%)`,
        text: textColor || `hsl(${hue}, 70%, 25%)`,
      }
    }, [bgColor, textColor, name, initials])

    const showImage = src && !imgError
    const showFallback = !showImage

    const handleImageError = useCallback(() => {
      setImgError(true)
      onImageError?.()
    }, [onImageError])

    const handleImageLoad = () => setImgLoaded(true)

    // Animation
    const motionProps = animation ? animationVariants[animation] || {} : {}

    const statusIndicator = status !== 'none' && (
      <span
        className={cn(
          'absolute w-3 h-3 rounded-full border-2 border-white dark:border-neutral-800',
          statusColorMap[status],
          statusPosition === 'top-right' && 'top-0 right-0 -translate-y-1/4 translate-x-1/4',
          statusPosition === 'bottom-right' && 'bottom-0 right-0 translate-y-1/4 translate-x-1/4'
        )}
        aria-label={status}
      />
    )

    const badgeElement = badge && (
      <span
        className={cn(
          'absolute z-10',
          badgePosition === 'top-right' && 'top-0 right-0 -translate-y-1/3 translate-x-1/3',
          badgePosition === 'top-left' && 'top-0 left-0 -translate-y-1/3 -translate-x-1/3',
          badgePosition === 'bottom-right' && 'bottom-0 right-0 translate-y-1/3 translate-x-1/3',
          badgePosition === 'bottom-left' && 'bottom-0 left-0 translate-y-1/3 -translate-x-1/3'
        )}
      >
        {badge}
      </span>
    )

    const avatarContent = (
      <motion.div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center overflow-hidden select-none',
          shapeClasses[effectiveShape],
          effectiveVariant === 'gradient' && 'p-[2px]',
          variantClasses[effectiveVariant],
          groupCtx && 'ring-2 ring-white dark:ring-neutral-900', // anneau de groupe
          className
        )}
        style={{
          width: sizeValue,
          height: sizeValue,
          minWidth: sizeValue,
          minHeight: sizeValue,
          background: showFallback && effectiveVariant !== 'gradient' ? autoColors.bg : undefined,
        }}
        {...motionProps}
        role="img"
        aria-label={alt || name || 'Avatar'}
      >
        {/* Image */}
        {showImage && (
          <img
            src={src}
            alt={alt || name || 'avatar'}
            className={cn(
              'w-full h-full object-cover',
              shapeClasses[effectiveShape],
              !imgLoaded && 'opacity-0',
              imgLoaded && 'animate-fade-in'
            )}
            loading={eager ? 'eager' : 'lazy'}
            onError={handleImageError}
            onLoad={handleImageLoad}
            {...imgProps}
          />
        )}

        {/* Fallback : initiales ou icône */}
        {showFallback && (
          <span
            className="w-full h-full flex items-center justify-center font-semibold"
            style={{ color: autoColors.text, fontSize: `calc(${sizeValue} * 0.4)` }}
          >
            {icon ? icon : initials}
          </span>
        )}

        {/* Enfants superposés */}
        {children}

        {/* Statut */}
        {statusIndicator}

        {/* Badge */}
        {badgeElement}

        {/* Effet de verre si variante gradient */}
        {effectiveVariant === 'gradient' && (
          <div className="absolute inset-0 rounded-full bg-white/10 backdrop-blur-[1px]" />
        )}
      </motion.div>
    )

    // Wrapper avec tooltip si nécessaire
    if (tooltip) {
      return (
        <Tooltip content={tooltip} delay={tooltipDelay} variant="dark">
          {avatarContent}
        </Tooltip>
      )
    }

    return avatarContent
  }
)
Avatar.displayName = 'Avatar'

/* ========================================================================
   Sous-composant AvatarGroup (avec gestion du "+X")
   ======================================================================== */
const AvatarGroupContainer = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ children, overlap = '-0.5rem', maxVisible = 5, size, shape, variant, className }, ref) => {
    const childrenArray = React.Children.toArray(children)
    const visibleChildren = childrenArray.slice(0, maxVisible)
    const hiddenCount = childrenArray.length - maxVisible

    return (
      <div ref={ref} className={cn('flex items-center', className)}>
        <AvatarGroup overlap={overlap} maxVisible={maxVisible} size={size} shape={shape} variant={variant}>
          {visibleChildren.map((child, index) => (
            <div
              key={index}
              style={{ marginLeft: index === 0 ? 0 : overlap, zIndex: childrenArray.length - index }}
            >
              {child}
            </div>
          ))}
          {hiddenCount > 0 && (
            <Avatar
              size={size || 'md'}
              shape={shape || 'circle'}
              variant={variant || 'solid'}
              initials={`+${hiddenCount}`}
              bgColor="#e5e7eb"
              textColor="#4b5563"
              style={{ marginLeft: overlap, zIndex: 0 }}
              className="ring-2 ring-white dark:ring-neutral-900 cursor-default"
            />
          )}
        </AvatarGroup>
      </div>
    )
  }
)
AvatarGroupContainer.displayName = 'AvatarGroup'

export { Avatar, AvatarGroupContainer as AvatarGroup }