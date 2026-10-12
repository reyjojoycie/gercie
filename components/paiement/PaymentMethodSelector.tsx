'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface PaymentMethod {
  id: string
  nom: string
  code: string
  logo_url: string | null
  instructions: string
  type: 'wallet' | 'card' | 'mobile_money'
}

interface PaymentMethodSelectorProps {
  selected: PaymentMethod | null
  onSelect: (method: PaymentMethod) => void
  methods?: PaymentMethod[]   // ← nouvelle prop
}

export default function PaymentMethodSelector({
  selected,
  onSelect,
  methods: overrideMethods,
}: PaymentMethodSelectorProps) {
  const query = useQuery<PaymentMethod[]>({
    queryKey: ['active-payment-methods'],
    queryFn: () => fetch('/api/paiement/methodes').then((r) => r.json()),
    staleTime: 60_000,
    enabled: !overrideMethods,   // ne lance la requête que si pas d'override
  })

  const methods = overrideMethods ?? query.data ?? []

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {methods.map((m) => (
        <motion.button
          key={m.id}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition',
            selected?.code === m.code
              ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/20 shadow-gold'
              : 'border-border hover:border-gold-400/50'
          )}
          onClick={() => onSelect(m)}
        >
          {m.logo_url && (
            <img src={m.logo_url} alt={m.nom} className="h-10 object-contain" />
          )}
          <span className="text-sm font-medium">{m.nom}</span>
          {m.instructions && (
            <p className="text-xs text-muted-foreground text-center">
              {m.instructions}
            </p>
          )}
        </motion.button>
      ))}
    </div>
  )
}