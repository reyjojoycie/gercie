// components/ui/SpecificationsTable.tsx
import { cn } from '@/lib/utils'

interface Spec {
  key: string
  value: string
}

export function SpecificationsTable({ specs, className }: { specs: Spec[]; className?: string }) {
  if (!specs || specs.length === 0) return null

  return (
    <div className={cn('mt-6 border-t border-border pt-4', className)}>
      <h3 className="text-lg font-semibold text-foreground mb-3">Spécifications techniques</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {specs.map((s, i) => (
          <div key={i} className="flex justify-between py-1 border-b border-border/50 last:border-0">
            <dt className="text-sm font-medium text-muted-foreground">{s.key}</dt>
            <dd className="text-sm text-foreground">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}