// components/GlassCard.tsx
import { cn } from '@/lib/utils'
import { GlowEffect } from '@/components/GlowEffect'

type GlassCardVariant = 'default' | 'gold' | 'brand'
type GlassCardSpacing = 'sm' | 'md' | 'lg'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variante de couleur pour l'effet de verre */
  variant?: GlassCardVariant
  /** Taille du padding intérieur */
  spacing?: GlassCardSpacing
  /** Active un effet de lueur autour de la carte */
  glow?: boolean
  /** Couleur de la lueur (si glow=true) */
  glowColor?: 'brand' | 'accent' | 'warm' | 'luxury' | 'gold'
  /** Ajoute un contour doré subtil */
  goldBorder?: boolean
  /** Le contenu */
  children: React.ReactNode
}

const variantMap: Record<GlassCardVariant, string> = {
  default: 'bg-white/70 dark:bg-neutral-900/50 border-white/20 dark:border-neutral-700/30',
  gold: 'bg-white/80 dark:bg-neutral-900/60 border-gold-400/30 dark:border-gold-400/20',
  brand: 'bg-white/70 dark:bg-neutral-900/50 border-brand-400/20 dark:border-brand-400/10',
}

const spacingMap: Record<GlassCardSpacing, string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export function GlassCard({
  variant = 'default',
  spacing = 'md',
  glow = false,
  glowColor = 'brand',
  goldBorder = false,
  className,
  children,
  ...props
}: GlassCardProps) {
  const cardContent = (
    <div
      className={cn(
        'backdrop-blur-xl border rounded-2xl shadow-soft transition-all duration-300',
        variantMap[variant],
        spacingMap[spacing],
        goldBorder && 'border-gold-400/60 dark:border-gold-400/40',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )

  if (glow) {
    return (
      <GlowEffect color={glowColor} intensity={25}>
        {cardContent}
      </GlowEffect>
    )
  }

  return cardContent
}
