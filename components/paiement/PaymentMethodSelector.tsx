// components/paiement/PaymentMethodSelector.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion'

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Info,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type PaymentMethodType =
  | 'mobile_money'
  | 'card'
  | 'bank_transfer'
  | 'cash_on_delivery'

export interface PaymentMethod {
  id: string
  nom: string
  code: string
  type: PaymentMethodType
  logo_url?: string | null
  instructions?: string | null
  ordre?: number
  actif?: boolean
  [key: string]: any
}

interface PaymentMethodSelectorProps {
  selected?: PaymentMethod | null
  onSelect: (method: PaymentMethod) => void
  methods?: PaymentMethod[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  endpoint?: string
  compact?: boolean
  showInstructions?: boolean
  autoSelectFirst?: boolean
  disabled?: boolean
  className?: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const LAST_METHOD_KEY = 'gercie_last_payment_method_v2'

const DEFAULT_ENDPOINTS = [
  '/api/moyens-paiement',
  '/api/admin/moyens-paiement',
]

const ALLOWED_TYPES: PaymentMethodType[] = [
  'mobile_money',
  'card',
  'bank_transfer',
  'cash_on_delivery',
]

const TYPE_CONFIG: Record<
  PaymentMethodType,
  {
    label: string
    description: string
    icon: React.ReactNode
    gradient: string
    accent: string
  }
> = {
  mobile_money: {
    label: 'Mobile Money',
    description: 'Orange Money / Airtel Money / M-Pesa',
    icon: <Smartphone size={20} />,
    gradient: 'from-orange-500/15 to-amber-500/15',
    accent: 'text-orange-500',
  },
  card: {
    label: 'Carte bancaire',
    description: 'Visa / Mastercard / Amex',
    icon: <CreditCard size={20} />,
    gradient: 'from-blue-500/15 to-indigo-500/15',
    accent: 'text-blue-500',
  },
  bank_transfer: {
    label: 'Virement bancaire',
    description: 'Transfert bancaire sécurisé',
    icon: <Banknote size={20} />,
    gradient: 'from-emerald-500/15 to-teal-500/15',
    accent: 'text-emerald-500',
  },
  cash_on_delivery: {
    label: 'Paiement à la livraison',
    description: 'Espèces à la réception',
    icon: <Package size={20} />,
    gradient: 'from-purple-500/15 to-pink-500/15',
    accent: 'text-purple-500',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // silencieux
  }
}

function isWalletMethod(method: Partial<PaymentMethod>): boolean {
  const type = String(method.type || '').toLowerCase()
  const code = String(method.code || '').toLowerCase()
  const nom = String(method.nom || '').toLowerCase()

  return (
    type === 'wallet' ||
    code === 'wallet' ||
    code.includes('wallet') ||
    code.includes('portefeuille') ||
    code.includes('solde') ||
    nom.includes('wallet') ||
    nom.includes('portefeuille') ||
    nom.includes('solde')
  )
}

function inferPaymentType(
  rawType: unknown,
  code: string,
  nom: string
): PaymentMethodType | null {
  const explicit = String(rawType || '').toLowerCase()

  if (explicit === 'wallet') return null

  if ((ALLOWED_TYPES as string[]).includes(explicit)) {
    return explicit as PaymentMethodType
  }

  const haystack = `${explicit} ${code} ${nom}`.toLowerCase()

  if (haystack.includes('wallet')) return null

  if (
    haystack.includes('mobile') ||
    haystack.includes('orange') ||
    haystack.includes('airtel') ||
    haystack.includes('mpesa') ||
    haystack.includes('m-pesa') ||
    haystack.includes('money')
  ) {
    return 'mobile_money'
  }

  if (
    haystack.includes('card') ||
    haystack.includes('carte') ||
    haystack.includes('visa') ||
    haystack.includes('mastercard') ||
    haystack.includes('amex') ||
    haystack.includes('cb')
  ) {
    return 'card'
  }

  if (
    haystack.includes('bank') ||
    haystack.includes('virement') ||
    haystack.includes('transfer') ||
    haystack.includes('bancaire')
  ) {
    return 'bank_transfer'
  }

  if (
    haystack.includes('cash') ||
    haystack.includes('livraison') ||
    haystack.includes('cod') ||
    haystack.includes('espece') ||
    haystack.includes('espèce')
  ) {
    return 'cash_on_delivery'
  }

  return 'card'
}

function normalizeMethod(
  raw: any,
  index: number
): PaymentMethod | null {
  if (!raw) return null

  const code = String(raw.code || raw.slug || raw.id || '').trim().toLowerCase()
  const nom = String(raw.nom || raw.name || raw.libelle || 'Moyen de paiement').trim()

  if (!code && !nom) return null

  if (isWalletMethod({ type: raw.type, code, nom })) {
    return null
  }

  const type = inferPaymentType(raw.type, code, nom)

  if (!type) return null

  const logoUrl =
    typeof raw.logo_url === 'string' && raw.logo_url.trim()
      ? raw.logo_url.trim()
      : typeof raw.logo === 'string' && raw.logo.trim()
        ? raw.logo.trim()
        : null

  const instructions =
    typeof raw.instructions === 'string' && raw.instructions.trim()
      ? raw.instructions.trim()
      : typeof raw.instruction === 'string' && raw.instruction.trim()
        ? raw.instruction.trim()
        : null

  return {
    id: String(raw.id || code || `${nom}-${index}`),
    nom,
    code: code || `methode-${index}`,
    type,
    logo_url: logoUrl,
    instructions,
    ordre: Number.isFinite(Number(raw.ordre)) ? Number(raw.ordre) : index,
    actif: raw.actif !== false && raw.active !== false && raw.is_active !== false,
  }
}

function normalizeMethodsPayload(payload: any): PaymentMethod[] {
  const rawArray = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.moyens)
        ? payload.moyens
        : Array.isArray(payload?.methods)
          ? payload.methods
          : []

  return rawArray
    .map((item: any, index: number) => normalizeMethod(item, index))
    .filter(Boolean) as PaymentMethod[]
}

function sortMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return [...methods].sort((a, b) => {
    const orderA = Number(a.ordre ?? 0)
    const orderB = Number(b.ordre ?? 0)

    if (orderA !== orderB) return orderA - orderB

    return String(a.nom || '').localeCompare(String(b.nom || ''))
  })
}

function getTypeConfig(type?: PaymentMethodType) {
  return TYPE_CONFIG[type || 'card'] || TYPE_CONFIG.card
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SOUS-COMPOSANT LOGO                                            */
/* ═══════════════════════════════════════════════════════════════ */

function MethodLogo({
  method,
  size = 'md',
}: {
  method: PaymentMethod
  size?: 'sm' | 'md' | 'lg'
}) {
  const config = getTypeConfig(method.type)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [method.logo_url])

  const dimensions =
    size === 'sm'
      ? 'h-10 w-10'
      : size === 'lg'
        ? 'h-16 w-16'
        : 'h-12 w-12'

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 26 : 20

  if (method.logo_url && !failed) {
    return (
      <div
        className={cn(
          dimensions,
          'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-sm dark:bg-midnight-800'
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={method.logo_url}
          alt={method.nom}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
          loading="lazy"
          decoding="async"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        dimensions,
        'flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground'
      )}
      aria-hidden="true"
    >
      {config.icon}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SKELETON                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function MethodSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/70',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />

        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          {!compact && <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPOSANT PRINCIPAL                                            */
/* ═══════════════════════════════════════════════════════════════ */

export default function PaymentMethodSelector({
  selected,
  onSelect,
  methods: externalMethods,
  loading: externalLoading,
  error: externalError,
  onRetry,
  endpoint,
  compact = false,
  showInstructions = false,
  autoSelectFirst = true,
  disabled = false,
  className,
}: PaymentMethodSelectorProps) {
  const prefersReducedMotion = useReducedMotion()

  const shouldFetch = externalMethods === undefined

  const [internalMethods, setInternalMethods] = useState<PaymentMethod[]>([])
  const [internalLoading, setInternalLoading] = useState(shouldFetch)
  const [internalError, setInternalError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const isLoading = externalLoading ?? internalLoading
  const errorMessage = externalError ?? internalError

  /* ---------------------------------------------------------- */
  /* Fetch des moyens de paiement                                */
  /* ---------------------------------------------------------- */

  const fetchMethods = useCallback(async () => {
    if (!shouldFetch) return

    setInternalLoading(true)
    setInternalError(null)

    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    const endpoints = endpoint ? [endpoint] : DEFAULT_ENDPOINTS

    let lastError = 'Impossible de charger les moyens de paiement.'

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })

        const json = await res.json().catch(() => null)

        if (res.ok) {
          const normalized = normalizeMethodsPayload(json)
          setInternalMethods(normalized)
          setInternalLoading(false)
          return
        }

        lastError =
          json?.error ||
          json?.message ||
          `Erreur HTTP ${res.status} sur ${url}`
      } catch (err: any) {
        if (controller.signal.aborted) return

        lastError =
          err?.message ||
          `Impossible de joindre ${url}`
      }
    }

    if (!controller.signal.aborted) {
      setInternalError(lastError)
    }

    setInternalLoading(false)
  }, [endpoint, shouldFetch])

  useEffect(() => {
    void fetchMethods()

    return () => {
      abortRef.current?.abort()
    }
  }, [fetchMethods])

  /* ---------------------------------------------------------- */
  /* Liste filtrée / triée                                       */
  /* ---------------------------------------------------------- */

  const methods = useMemo(() => {
    const source = externalMethods ?? internalMethods

    return sortMethods(
      source
        .map((method, index) => normalizeMethod(method, index))
        .filter((method): method is PaymentMethod => Boolean(method))
        .filter((method) => method.actif !== false)
    )
  }, [externalMethods, internalMethods])

  /* ---------------------------------------------------------- */
  /* Sélection / mémorisation                                    */
  /* ---------------------------------------------------------- */

  const handleSelect = useCallback(
    (method: PaymentMethod) => {
      if (disabled) return

      safeLocalStorageSet(LAST_METHOD_KEY, method.code)
      onSelect(method)
    },
    [disabled, onSelect]
  )

  useEffect(() => {
    if (!autoSelectFirst || disabled || methods.length === 0) return
    if (selected) return

    const lastCode = safeLocalStorageGet(LAST_METHOD_KEY)
    const remembered = lastCode
      ? methods.find((m) => m.code === lastCode)
      : null

    handleSelect(remembered || methods[0])
  }, [autoSelectFirst, disabled, handleSelect, methods, selected])

  /* ---------------------------------------------------------- */
  /* Navigation clavier radio group                              */
  /* ---------------------------------------------------------- */

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (disabled) return

      const focusableIndexes = methods.map((_, i) => i)
      if (focusableIndexes.length === 0) return

      let nextIndex: number | null = null

      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown'
      ) {
        nextIndex = (index + 1) % methods.length
      } else if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp'
      ) {
        nextIndex = (index - 1 + methods.length) % methods.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = methods.length - 1
      }

      if (nextIndex === null) return

      event.preventDefault()

      const nextMethod = methods[nextIndex]
      const nextButton = buttonRefs.current[nextIndex]

      nextButton?.focus()

      if (nextMethod) {
        handleSelect(nextMethod)
      }
    },
    [disabled, handleSelect, methods]
  )

  /* ---------------------------------------------------------- */
  /* Rendu loading                                               */
  /* ---------------------------------------------------------- */

  if (isLoading && methods.length === 0) {
    return (
      <div
        className={cn(
          'grid gap-3',
          compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2',
          className
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <MethodSkeleton key={i} compact={compact} />
        ))}
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */

  if (errorMessage && methods.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
          className
        )}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="font-medium">Moyens de paiement indisponibles</p>
            <p className="mt-1 text-xs opacity-90">{errorMessage}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onRetry) {
                onRetry()
                return
              }

              void fetchMethods()
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-red-300/50 bg-white/60 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-200"
          >
            <RefreshCw size={14} />
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu vide                                                  */
  /* ---------------------------------------------------------- */

  if (methods.length === 0) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-border bg-card/70 p-6 text-center',
          className
        )}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-gold-400/30 bg-gold-400/10">
          <CreditCard size={24} className="text-gold-500" />
        </div>

        <p className="text-sm font-medium text-foreground">
          Aucun moyen de paiement disponible
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Contacte le support ou réessaie plus tard.
        </p>
      </div>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const hasSelected = Boolean(selected?.id || selected?.code)

  return (
    <div className={cn('space-y-4', className)}>
      <div
        role="radiogroup"
        aria-label="Moyens de paiement disponibles"
        aria-disabled={disabled}
        className={cn(
          'grid gap-3',
          compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2'
        )}
      >
        <AnimatePresence initial={false}>
          {methods.map((method, index) => {
            const config = getTypeConfig(method.type)
            const isSelected =
              selected?.id === method.id ||
              (!selected?.id && selected?.code === method.code)

            const isTabbable = isSelected || (!hasSelected && index === 0)

            return (
              <motion.button
                key={method.id}
                type="button"
                ref={(el) => {
                  buttonRefs.current[index] = el
                }}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isTabbable ? 0 : -1}
                disabled={disabled}
                onClick={() => handleSelect(method)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border text-left transition focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-60',
                  compact ? 'p-3' : 'p-4',
                  isSelected
                    ? 'border-gold-400 bg-gold-500/10 shadow-gold'
                    : 'border-border bg-card hover:border-gold-400/40 hover:shadow-card'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition group-hover:opacity-100',
                    config.gradient,
                    isSelected && 'opacity-100'
                  )}
                />

                <MethodLogo method={method} size={compact ? 'sm' : 'md'} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block truncate text-sm font-semibold',
                          isSelected
                            ? 'text-gold-700 dark:text-gold-300'
                            : 'text-foreground'
                        )}
                      >
                        {method.nom}
                      </span>

                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {config.label}
                      </span>
                    </span>

                    {isSelected && (
                      <CheckCircle2
                        size={18}
                        className="shrink-0 text-gold-500"
                        aria-hidden="true"
                      />
                    )}
                  </span>

                  {!compact && (
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {method.instructions && showInstructions
                        ? method.instructions
                        : config.description}
                    </span>
                  )}

                  {compact && showInstructions && method.instructions && (
                    <span className="mt-1 line-clamp-1 block text-[11px] text-muted-foreground">
                      {method.instructions}
                    </span>
                  )}
                </span>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-gold-500" />
          Paiement direct sécurisé
        </span>

        <span className="hidden sm:inline">•</span>

        <span className="inline-flex items-center gap-1.5">
          <Smartphone size={14} className="text-gold-500" />
          Mobile Money / Carte / Virement
        </span>

        <span className="hidden sm:inline">•</span>

        <span className="inline-flex items-center gap-1.5">
          <Info size={14} className="text-gold-500" />
          Aucun portefeuille interne utilisé
        </span>
      </div>
    </div>
  )
}