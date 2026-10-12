// components/GoldDivider.tsx
import { cn } from '@/lib/utils'

interface GoldDividerProps {
  /** Ajoute un espacement vertical (my-4 par défaut) */
  spacing?: string
  /** Classe additionnelle */
  className?: string
}

export function GoldDivider({ spacing = 'my-4', className }: GoldDividerProps) {
  return (
    <div className={cn('relative', spacing, className)}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-transparent bg-gradient-to-r from-transparent via-gold-400 to-transparent h-px opacity-60 dark:opacity-40" />
      </div>
    </div>
  )
}
