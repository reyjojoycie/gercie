// app/commande/confirmation/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import confetti from 'canvas-confetti'

import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useToast } from '@/components/ui/Toast'
import { useOnlineStatus } from '@/contexts/OnlineStatusContext'

import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

import { cn } from '@/lib/utils'

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Facebook,
  FileText,
  Gift,
  HelpCircle,
  Key,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Currency = 'USD' | 'CDF'

type OrderStatus =
  | 'en_attente'
  | 'payee'
  | 'collecte'
  | 'conditionnement_premium'
  | 'en_livraison'
  | 'livree'
  | 'annulee'
  | 'refusee'
  | 'rembourse'
  | 'retour_demande'

type ArticleStatus = 'ok' | 'refuse' | 'pending'

interface OrderArticle {
  nom: string
  quantite: number
  prix_unitaire: number
  specifications?: string | null
  image?: string | null
  statut?: ArticleStatus
  motif_refus?: string | null
}

interface OrderTimelineStep {
  id: string
  label: string
  description?: string
  timestamp?: string | null
  done: boolean
  active: boolean
}

interface OrderDetail {
  id: string
  numero: string
  total: number
  total_global?: number
  total_usd?: number
  total_cdf?: number
  sous_total?: number
  frais_livraison?: number
  reduction?: number
  statut: OrderStatus
  type_livraison: string
  adresse_livraison?: string | null
  commune_livraison?: string | null
  point_retrait?: { nom: string; adresse: string } | null
  code_client?: string | null
  code_livreur?: string | null
  created_at: string
  updated_at?: string
  delivered_at?: string | null
  articles: OrderArticle[]
  timeline?: OrderTimelineStep[]
  vendeur?: { boutique_nom: string; telephone?: string } | null
  message_cadeau?: string | null
  payment_method?: string | null
  payment_reference?: string | null
}

interface ReviewPayload {
  commande_id: string
  note: number
  commentaire: string
  article_index?: number
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const PLACEHOLDER = '/placeholder.jpg'
const POLL_INTERVAL_ACTIVE = 30_000 // 30s
const POLL_INTERVAL_DELIVERED = 120_000 // 2min

const STEPS = [
  { id: 'cart', label: 'Panier', icon: ShoppingBag },
  { id: 'checkout', label: 'Commande', icon: MapPin },
  { id: 'payment', label: 'Paiement', icon: CreditCard },
  { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
] as const

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string
    variant: 'accent' | 'gold' | 'warm' | 'danger' | 'neutral'
    icon: React.ReactNode
    description: string
  }
> = {
  en_attente: {
    label: 'En attente de paiement',
    variant: 'warm',
    icon: <Clock size={14} />,
    description: 'Votre commande est réservée. Finalisez le paiement pour la valider.',
  },
  payee: {
    label: 'Paiement confirmé',
    variant: 'accent',
    icon: <CheckCircle2 size={14} />,
    description: 'Paiement reçu. Préparation en cours.',
  },
  collecte: {
    label: 'En collecte',
    variant: 'accent',
    icon: <Package size={14} />,
    description: 'Vos articles sont récupérés chez les vendeurs.',
  },
  conditionnement_premium: {
    label: 'Conditionnement premium',
    variant: 'gold',
    icon: <Gift size={14} />,
    description: 'Emballage soigné et contrôle qualité en cours.',
  },
  en_livraison: {
    label: 'En livraison',
    variant: 'accent',
    icon: <Truck size={14} />,
    description: 'Le livreur est en route vers votre adresse.',
  },
  livree: {
    label: 'Livrée',
    variant: 'gold',
    icon: <CheckCircle size={14} />,
    description: 'Commande livrée avec succès. Merci pour votre confiance !',
  },
  annulee: {
    label: 'Annulée',
    variant: 'danger',
    icon: <XCircle size={14} />,
    description: 'Cette commande a été annulée.',
  },
  refusee: {
    label: 'Refusée',
    variant: 'danger',
    icon: <XCircle size={14} />,
    description: 'Un ou plusieurs articles ont été refusés à la livraison.',
  },
  rembourse: {
    label: 'Remboursée',
    variant: 'neutral',
    icon: <RotateCcw size={14} />,
    description: 'Le remboursement a été effectué.',
  },
  retour_demande: {
    label: 'Retour demandé',
    variant: 'warm',
    icon: <RotateCcw size={14} />,
    description: 'Votre demande de retour est en cours de traitement.',
  },
}

const TIMELINE_STEPS: {
  id: OrderStatus
  label: string
  description: string
  icon: React.ReactNode
}[] = [
  {
    id: 'payee',
    label: 'Paiement validé',
    description: 'Transaction confirmée',
    icon: <CreditCard size={16} />,
  },
  {
    id: 'collecte',
    label: 'Collecte',
    description: 'Récupération des articles',
    icon: <Package size={16} />,
  },
  {
    id: 'conditionnement_premium',
    label: 'Conditionnement',
    description: 'Emballage premium',
    icon: <Gift size={16} />,
  },
  {
    id: 'en_livraison',
    label: 'En livraison',
    description: 'En route chez vous',
    icon: <Truck size={16} />,
  },
  {
    id: 'livree',
    label: 'Livrée',
    description: 'Commande reçue',
    icon: <CheckCircle size={16} />,
  },
]

const ARTICLE_STATUS_CONFIG: Record<
  ArticleStatus,
  { variant: 'accent' | 'danger' | 'neutral'; icon: React.ReactNode; label: string }
> = {
  ok: {
    variant: 'accent',
    icon: <CheckCircle2 size={14} />,
    label: 'Accepté',
  },
  refuse: {
    variant: 'danger',
    icon: <XCircle size={14} />,
    label: 'Indésirable',
  },
  pending: {
    variant: 'neutral',
    icon: <Clock size={14} />,
    label: 'Vérification',
  },
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function toPositiveNumber(value: any): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `$${value.toFixed(2)}`
}

function formatCdf(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString('fr-FR')} FC`
}

function formatMoney(value: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(value) : formatCdf(value)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return ''
  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'à l’instant'
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 7) return `il y a ${days} j`
    return formatDate(value)
  } catch {
    return ''
  }
}

function getStatusConfig(status: OrderStatus) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.en_attente
}

function getTimelineForStatus(status: OrderStatus, custom?: OrderTimelineStep[]): OrderTimelineStep[] {
  if (custom && custom.length > 0) return custom

  const order = TIMELINE_STEPS.map((s) => s.id)
  const currentIndex = order.indexOf(status)

  return TIMELINE_STEPS.map((step, idx) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    done: currentIndex >= 0 && idx <= currentIndex,
    active: currentIndex === idx,
    timestamp: null,
  }))
}

function isDeliveredStatus(status: OrderStatus): boolean {
  return status === 'livree'
}

function isFinalStatus(status: OrderStatus): boolean {
  return (
    status === 'livree' ||
    status === 'annulee' ||
    status === 'refusee' ||
    status === 'rembourse'
  )
}

function canCancel(status: OrderStatus): boolean {
  return status === 'en_attente' || status === 'payee' || status === 'collecte'
}

function canReturn(status: OrderStatus): boolean {
  return status === 'livree'
}

function canReview(status: OrderStatus): boolean {
  return status === 'livree'
}

function triggerConfetti(duration = 3000) {
  if (typeof window === 'undefined') return

  try {
    const end = Date.now() + duration
    const colors = ['#FFD700', '#FFA500', '#FF6347', '#32CD32', '#1E90FF']

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      })
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  } catch {
    // silencieux
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

function buildShareUrl(order: OrderDetail): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/commande/confirmation?id=${order.id}`
}

function buildShareText(order: OrderDetail): string {
  return `J'ai passé une commande sur Gercie (n° ${order.numero}). Découvrez la boutique !`
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SOUS-COMPOSANTS                                                */
/* ═══════════════════════════════════════════════════════════════ */

function Stepper({ currentStep }: { currentStep: string }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep)
  const prefersReduced = useReducedMotion()

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          const isActive = step.id === currentStep
          const isCompleted = idx < currentIndex

          return (
            <motion.div
              key={step.id}
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                'flex min-w-[110px] flex-1 flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-center transition',
                isActive
                  ? 'border-gold-400/40 bg-gold-500/10 text-gold-700 dark:text-gold-300'
                  : isCompleted
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                    : 'border-border bg-card text-muted-foreground'
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  isActive
                    ? 'bg-gold-500 text-white'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </span>

              <span className="text-xs font-medium sm:text-sm">{step.label}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBanner({
  order,
  totals,
}: {
  order: OrderDetail
  totals: {
    primaryTotal: number
    secondaryTotal: number
    primaryCurrency: Currency
    secondaryCurrency: Currency
  }
}) {
  const config = getStatusConfig(order.statut)
  const prefersReduced = useReducedMotion()

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative mb-8 overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-gold-600 via-gold-500 to-burgundy-700 text-white shadow-strong"
    >
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <CardContent className="relative p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="neutral" size="sm" className="bg-white/20 text-white">
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Badge>

              <span className="text-xs opacity-80">
                Commande #{order.numero}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold md:text-3xl">
              Merci pour votre commande !
            </h1>

            <p className="mt-2 max-w-xl text-sm opacity-90">
              {config.description}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  Montant payé
                </p>
                <p className="mt-1 text-lg font-bold">
                  {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
                </p>
                <p className="text-[11px] opacity-75">
                  ≈ {formatMoney(totals.secondaryTotal, totals.secondaryCurrency)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  Date
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {formatDate(order.created_at)}
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider opacity-75">
                  Paiement
                </p>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {order.payment_method || 'Mobile Money'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:min-w-[180px]">
            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => window.print()}
              leftIcon={<Printer size={14} />}
            >
              Imprimer
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => downloadInvoice(order)}
              leftIcon={<Download size={14} />}
            >
              Facture PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => shareOrder(order)}
              leftIcon={<Share2 size={14} />}
            >
              Partager
            </Button>
          </div>
        </div>
      </CardContent>
    </motion.div>
  )
}

function Timeline({
  steps,
  status,
}: {
  steps: OrderTimelineStep[]
  status: OrderStatus
}) {
  const prefersReduced = useReducedMotion()

  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock size={18} className="text-gold-500" />
          Progression de la commande
        </CardTitle>
        <CardDescription>
          Suivi en temps réel de votre colis
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ol className="relative space-y-6 border-l-2 border-gold-400/20 pl-6">
          {steps.map((step, idx) => {
            const stepConfig = TIMELINE_STEPS.find((s) => s.id === step.id)
            const Icon = stepConfig?.icon || <Package size={16} />

            return (
              <motion.li
                key={step.id}
                initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="relative"
              >
                <span
                  className={cn(
                    'absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                    step.done
                      ? 'border-gold-500 bg-gold-500 text-white'
                      : step.active
                        ? 'border-gold-500 bg-background text-gold-500 animate-pulse'
                        : 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {step.done ? <CheckCircle2 size={14} /> : Icon}
                </span>

                <div className="pb-2">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      step.done || step.active
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </p>

                  {step.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}

                  {step.timestamp && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(step.timestamp)} • {formatRelativeTime(step.timestamp)}
                    </p>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gold-400/10 pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Truck size={12} className="text-gold-500" />
            <span>Traçabilité de flotte intégrée</span>
          </div>

          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-gold-500" />
            <span>Garantie protection acheteur RDC</span>
          </div>

          {status === 'en_livraison' && (
            <div className="flex items-center gap-1.5 text-gold-600">
              <Zap size={12} />
              <span>Livreur en route</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CodeValidationCard({
  order,
  onCopy,
  copied,
}: {
  order: OrderDetail
  onCopy: (code: string, id: string) => void
  copied: string | null
}) {
  if (!order.code_client && !order.code_livreur) return null

  return (
    <Card variant="glass" className="border-gold-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key size={18} className="text-gold-500" />
          Codes de validation
        </CardTitle>
        <CardDescription>
          Communiquez ces codes au livreur pour confirmer la réception.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {order.code_client && (
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Code client (à donner au livreur)
                </p>
                <p className="mt-1 truncate font-mono text-2xl font-bold tracking-widest text-gold-600 dark:text-gold-400">
                  {order.code_client}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Tooltip content={copied === 'client' ? 'Copié !' : 'Copier'}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-gold-500 hover:bg-gold-500/5"
                    onClick={() => onCopy(order.code_client!, 'client')}
                    aria-label="Copier le code client"
                  >
                    {copied === 'client' ? (
                      <CheckCircle size={18} className="text-green-500" />
                    ) : (
                      <Copy size={18} />
                    )}
                  </Button>
                </Tooltip>

                <Tooltip content="QR code">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-gold-500 hover:bg-gold-500/5"
                    onClick={() => showQrCode(order.code_client!, 'Client')}
                    aria-label="Afficher QR code"
                  >
                    <QrCode size={18} />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}

        {order.code_livreur && (
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Code livreur (interne)
            </p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-foreground">
              {order.code_livreur}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ArticlesCard({
  order,
  totals,
}: {
  order: OrderDetail
  totals: {
    primaryCurrency: Currency
    secondaryCurrency: Currency
    convert: (cdf: number) => { primary: number; secondary: number }
  }
}) {
  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package size={18} className="text-gold-500" />
          Articles de la commande
        </CardTitle>
        <CardDescription>
          {order.articles.length} article{order.articles.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {order.articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun article renseigné pour cette commande.
          </p>
        ) : (
          order.articles.map((article, idx) => {
            const lineCdf = article.prix_unitaire * article.quantite
            const converted = totals.convert(lineCdf)
            const articleStatus: ArticleStatus = article.statut || 'pending'
            const statusCfg = ARTICLE_STATUS_CONFIG[articleStatus]

            return (
              <motion.div
                key={`${article.nom}-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-start gap-3 rounded-2xl border border-border bg-background/50 p-3"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={article.image || PLACEHOLDER}
                    alt={article.nom}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">
                    {article.nom}
                  </p>

                  {article.specifications && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {article.specifications}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={statusCfg.variant} size="sm">
                      <span className="mr-1">{statusCfg.icon}</span>
                      {statusCfg.label}
                    </Badge>

                    <span className="text-xs text-muted-foreground">
                      Qté : {article.quantite}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      Unité : {formatMoney(article.prix_unitaire, 'CDF')}
                    </span>
                  </div>

                  {article.statut === 'refuse' && article.motif_refus && (
                    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                      Motif : {article.motif_refus}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-gold-600">
                    {formatMoney(converted.primary, totals.primaryCurrency)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ≈ {formatMoney(converted.secondary, totals.secondaryCurrency)}
                  </p>
                </div>
              </motion.div>
            )
          })
        )}

        {/* Totaux */}
        <div className="space-y-2 border-t border-gold-400/20 pt-4 text-sm">
          {order.sous_total != null && (
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span>
                {formatMoney(totals.convert(order.sous_total).primary, totals.primaryCurrency)}
              </span>
            </div>
          )}

          {order.frais_livraison != null && order.frais_livraison > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Livraison</span>
              <span>
                {formatMoney(totals.convert(order.frais_livraison).primary, totals.primaryCurrency)}
              </span>
            </div>
          )}

          {order.reduction != null && order.reduction > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>Remise</span>
              <span>
                - {formatMoney(totals.convert(order.reduction).primary, totals.primaryCurrency)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-gold-400/20 pt-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Total facturé</p>
            <p className="text-xs text-muted-foreground">
              Toutes taxes et frais inclus
            </p>
          </div>

          <div className="text-right">
            <p className="font-serif text-2xl font-bold text-gold-500">
              {formatMoney(totals.convert(order.total).primary, totals.primaryCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              ≈ {formatMoney(totals.convert(order.total).secondary, totals.secondaryCurrency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DeliveryCard({ order }: { order: OrderDetail }) {
  return (
    <Card variant="glass" className="border-gold-400/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin size={18} className="text-gold-500" />
          Livraison
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted-foreground">Mode</span>
          <span className="font-medium text-foreground capitalize">
            {order.type_livraison?.replace('_', ' ') || 'Domicile'}
          </span>
        </div>

        {order.adresse_livraison && (
          <div>
            <p className="text-xs text-muted-foreground">Adresse</p>
            <p className="mt-1 text-sm text-foreground">{order.adresse_livraison}</p>
            {order.commune_livraison && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.commune_livraison}
              </p>
            )}
          </div>
        )}

        {order.point_retrait && (
          <div>
            <p className="text-xs text-muted-foreground">Point de retrait</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {order.point_retrait.nom}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.point_retrait.adresse}
            </p>
          </div>
        )}

        {order.message_cadeau && (
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-gold-700 dark:text-gold-300">
              <Gift size={12} />
              Message cadeau
            </p>
            <p className="mt-1 text-sm italic text-foreground">
              « {order.message_cadeau} »
            </p>
          </div>
        )}

        {order.vendeur && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Vendeur</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {order.vendeur.boutique_nom}
            </p>
            {order.vendeur.telephone && (
              <a
                href={`tel:${order.vendeur.telephone}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-gold-600 hover:underline"
              >
                <MessageCircle size={12} />
                Appeler le vendeur
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewModal({
  open,
  onClose,
  onSubmit,
  submitting,
  order,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: ReviewPayload) => void
  submitting: boolean
  order: OrderDetail
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [hovered, setHovered] = useState(0)

  const handleSubmit = () => {
    if (!comment.trim()) return
    onSubmit({
      commande_id: order.id,
      note: rating,
      commentaire: comment.trim(),
    })
    setComment('')
    setRating(5)
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Laisser un avis"
      description="Partagez votre expérience avec cette commande."
      size="md"
      accent="gold"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="luxe"
            onClick={handleSubmit}
            disabled={submitting || !comment.trim()}
            leftIcon={
              submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />
            }
          >
            Publier
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Votre note</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="p-1 transition focus:outline-none focus:ring-2 focus:ring-gold-500 rounded"
                aria-label={`Note ${star} sur 5`}
              >
                <Star
                  size={28}
                  className={cn(
                    'transition',
                    (hovered || rating) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-neutral-300'
                  )}
                />
              </button>
            ))}
            <span className="ml-2 text-sm font-medium text-foreground">
              {rating}/5
            </span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Commentaire</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Décrivez votre expérience : qualité, livraison, service..."
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <span className="block text-right text-xs text-muted-foreground">
            {comment.length}/500
          </span>
        </label>
      </div>
    </Modal>
  )
}

function QrCodeModal({
  open,
  onClose,
  code,
  label,
}: {
  open: boolean
  onClose: () => void
  code: string
  label: string
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`QR Code — ${label}`}
      description="Scannez ce code pour valider la réception."
      size="sm"
      accent="gold"
    >
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="rounded-2xl border border-gold-400/30 bg-white p-4 shadow-gold">
          <div className="flex h-48 w-48 items-center justify-center bg-muted text-xs text-muted-foreground">
            QR : {code}
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Code : <span className="font-mono font-bold text-foreground">{code}</span>
        </p>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ACTIONS GLOBALES                                               */
/* ═══════════════════════════════════════════════════════════════ */

function downloadInvoice(order: OrderDetail) {
  if (typeof window === 'undefined') return

  try {
    const content = [
      'GERCIE — FACTURE',
      '================',
      `Commande : ${order.numero}`,
      `Date : ${formatDate(order.created_at)}`,
      `Statut : ${getStatusConfig(order.statut).label}`,
      '',
      'ARTICLES',
      '--------',
      ...order.articles.map(
        (a) =>
          `${a.quantite} × ${a.nom}${a.specifications ? ` (${a.specifications})` : ''} — ${formatMoney(a.prix_unitaire * a.quantite, 'CDF')}`
      ),
      '',
      `TOTAL : ${formatMoney(order.total, 'CDF')}`,
      '',
      'Merci pour votre confiance !',
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facture-${order.numero}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    // silencieux
  }
}

async function shareOrder(order: OrderDetail) {
  if (typeof window === 'undefined') return

  const url = buildShareUrl(order)
  const text = buildShareText(order)

  if (navigator.share) {
    try {
      await navigator.share({ title: `Commande ${order.numero}`, text, url })
      return
    } catch {
      // fallback
    }
  }

  const ok = await copyToClipboard(`${text}\n${url}`)
  if (ok) {
    // Le toast sera géré par le caller
  }
}

function showQrCode(code: string, label: string) {
  // Déclenché via état local dans la page principale
  const event = new CustomEvent('gercie:show-qr', { detail: { code, label } })
  window.dispatchEvent(event)
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                */
/* ═══════════════════════════════════════════════════════════════ */

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const prefersReduced = useReducedMotion()

  const { user, loading: authLoading } = useAuth()
  const { clearCart } = useCart()
  const { rate } = useExchangeRate()
  const isOnline = useOnlineStatus()

  const commandeId = searchParams.get('id') || ''

  const [copied, setCopied] = useState<string | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [qrModal, setQrModal] = useState<{ open: boolean; code: string; label: string }>({
    open: false,
    code: '',
    label: '',
  })

  const isCartCleared = useRef(false)
  const confettiFired = useRef(false)

  /* ---------------------------------------------------------- */
  /* Écouteur QR code                                            */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.code) {
        setQrModal({ open: true, code: detail.code, label: detail.label || 'Code' })
      }
    }

    window.addEventListener('gercie:show-qr', handler)
    return () => window.removeEventListener('gercie:show-qr', handler)
  }, [])

  /* ---------------------------------------------------------- */
  /* Chargement commande                                         */
  /* ---------------------------------------------------------- */

  const {
    data: order,
    isLoading: loading,
    error,
    refetch,
    isFetching,
  } = useQuery<OrderDetail>({
    queryKey: ['commande', commandeId],
    queryFn: async () => {
      if (!commandeId) throw new Error("Aucun identifiant de commande.")

      const res = await fetch(`/api/commandes/${commandeId}`, {
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || 'Impossible de charger la commande.')
      }

      return data as OrderDetail
    },
    enabled: !!commandeId && !!user,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const status = query.state.data?.statut
      if (!status) return false
      if (isFinalStatus(status)) return POLL_INTERVAL_DELIVERED
      return POLL_INTERVAL_ACTIVE
    },
    refetchIntervalInBackground: false,
    retry: 1,
  })

  /* ---------------------------------------------------------- */
  /* Totaux                                                      */
  /* ---------------------------------------------------------- */

  const rateOk = Number.isFinite(Number(rate)) && Number(rate) > 0

  const totals = useMemo(() => {
    const primaryCurrency: Currency = 'USD'
    const secondaryCurrency: Currency = 'CDF'

    const convert = (cdf: number) => {
      const safeCdf = Number(cdf) || 0
      const usd = rateOk ? safeCdf / Number(rate) : 0
      return {
        primary: usd,
        secondary: safeCdf,
      }
    }

    const rawTotal = Number(order?.total ?? order?.total_global ?? 0) || 0

    return {
      primaryCurrency,
      secondaryCurrency,
      convert,
      primaryTotal: rateOk ? rawTotal / Number(rate) : 0,
      secondaryTotal: rawTotal,
    }
  }, [order?.total, order?.total_global, rate, rateOk])

  /* ---------------------------------------------------------- */
  /* Timeline                                                    */
  /* ---------------------------------------------------------- */

  const timeline = useMemo(
    () => getTimelineForStatus(order?.statut || 'en_attente', order?.timeline),
    [order?.statut, order?.timeline]
  )

  /* ---------------------------------------------------------- */
  /* Effets                                                      */
  /* ---------------------------------------------------------- */

  // Purge du panier une seule fois si commande valide
  useEffect(() => {
    if (!order || isCartCleared.current) return

    const validStatuses: OrderStatus[] = [
      'payee',
      'collecte',
      'conditionnement_premium',
      'en_livraison',
      'livree',
    ]

    if (validStatuses.includes(order.statut)) {
      isCartCleared.current = true
      clearCart?.().catch(() => {})
    }
  }, [clearCart, order])

  // Confettis à la livraison
  useEffect(() => {
    if (!order || confettiFired.current) return
    if (!isDeliveredStatus(order.statut)) return

    confettiFired.current = true

    if (!prefersReduced) {
      triggerConfetti(3500)
    }
  }, [order, prefersReduced])

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user && commandeId) {
      router.push(
        `/login?redirect=/commande/confirmation?id=${commandeId}`
      )
    }
  }, [authLoading, commandeId, router, user])

  /* ---------------------------------------------------------- */
  /* Mutations                                                   */
  /* ---------------------------------------------------------- */

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/commandes/${commandeId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Échec de l’annulation.')
      return data
    },
    onSuccess: () => {
      toast.addToast({
        type: 'success',
        message: 'Votre commande a été annulée.',
      })
      setShowCancelModal(false)
      queryClient.invalidateQueries({ queryKey: ['commande', commandeId] })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  const returnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/retours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commande_id: commandeId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Échec de la demande de retour.')
      return data
    },
    onSuccess: () => {
      toast.addToast({
        type: 'success',
        message: 'Demande de retour enregistrée. Le support vous contactera.',
      })
      setShowReturnModal(false)
      queryClient.invalidateQueries({ queryKey: ['commande', commandeId] })
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async (payload: ReviewPayload) => {
      const res = await fetch('/api/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Échec de l’enregistrement de l’avis.')
      return data
    },
    onSuccess: () => {
      toast.addToast({
        type: 'success',
        message: 'Merci pour votre avis !',
      })
      setShowReviewModal(false)
    },
    onError: (err: any) => {
      toast.addToast({ type: 'error', message: err.message })
    },
  })

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleCopy = useCallback(
    async (code: string, id: string) => {
      const ok = await copyToClipboard(code)
      if (ok) {
        setCopied(id)
        toast.addToast({ type: 'success', message: 'Code copié.' })
        setTimeout(() => setCopied(null), 2000)
      } else {
        toast.addToast({ type: 'error', message: 'Copie impossible.' })
      }
    },
    [toast]
  )

  const handleShare = useCallback(async () => {
    if (!order) return
    await shareOrder(order)
    toast.addToast({ type: 'info', message: 'Lien de partage préparé.' })
  }, [order, toast])

  const handleDownload = useCallback(() => {
    if (!order) return
    downloadInvoice(order)
    toast.addToast({ type: 'success', message: 'Facture téléchargée.' })
  }, [order, toast])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  /* ---------------------------------------------------------- */
  /* Rendu loading                                               */
  /* ---------------------------------------------------------- */

  if (authLoading || (loading && !order)) {
    return (
      <Container className="py-10">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </Container>
    )
  }

  /* ---------------------------------------------------------- */
  /* Rendu erreur                                                */
  /* ---------------------------------------------------------- */

  if (error && !order) {
    return (
      <Container className="py-16">
        <Card className="mx-auto max-w-md border-red-500/30 bg-red-500/5 p-8 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
          <h2 className="mb-2 text-2xl font-bold text-foreground">
            Fiche de commande inaccessible
          </h2>
          <p className="mb-6 text-muted-foreground">
            {error instanceof Error
              ? error.message
              : 'La commande demandée est introuvable ou a été archivée.'}
          </p>

          <div className="flex justify-center gap-3">
            <Button variant="luxe" onClick={() => refetch()} leftIcon={<RefreshCw size={14} />}>
              Actualiser
            </Button>
            <Link href="/profile?tab=orders">
              <Button variant="outline-gold">Mes commandes</Button>
            </Link>
          </div>
        </Card>
      </Container>
    )
  }

  if (!order) return null

  /* ---------------------------------------------------------- */
  /* Rendu principal                                             */
  /* ---------------------------------------------------------- */

  const statusCfg = getStatusConfig(order.statut)

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-16">
      <Container className="py-8 md:py-12">
        <Stepper currentStep="confirmation" />

        {/* Alerte hors ligne */}
        {!isOnline && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>
              Vous êtes hors ligne. Les informations affichées peuvent ne pas
              être à jour. Reconnectez-vous pour un suivi en temps réel.
            </p>
          </div>
        )}

        {/* Bandeau statut */}
        <StatusBanner order={order} totals={totals} />

        {/* Indicateur rafraîchissement auto */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3 text-xs text-muted-foreground backdrop-blur-sm">
          <div className="flex items-center gap-2">
            {isFetching ? (
              <Loader2 size={14} className="animate-spin text-gold-500" />
            ) : (
              <RefreshCw size={14} className="text-gold-500" />
            )}
            <span>
              Suivi automatique {isFinalStatus(order.statut) ? ' toutes les 2 min' : ' toutes les 30 s'}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            leftIcon={<RefreshCw size={12} />}
          >
            Actualiser
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-6 lg:col-span-2">
            <Timeline steps={timeline} status={order.statut} />
            <ArticlesCard order={order} totals={totals} />
            <CodeValidationCard order={order} onCopy={handleCopy} copied={copied} />
            <DeliveryCard order={order} />

            {/* Actions post-commande */}
            <Card variant="glass" className="border-gold-400/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles size={18} className="text-gold-500" />
                  Actions
                </CardTitle>
                <CardDescription>
                  Gérez votre commande après validation.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {canCancel(order.statut) && (
                    <Button
                      variant="outline"
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                      onClick={() => setShowCancelModal(true)}
                      leftIcon={<XCircle size={14} />}
                    >
                      Annuler la commande
                    </Button>
                  )}

                  {canReturn(order.statut) && (
                    <Button
                      variant="outline-gold"
                      onClick={() => setShowReturnModal(true)}
                      leftIcon={<RotateCcw size={14} />}
                    >
                      Demander un retour
                    </Button>
                  )}

                  {canReview(order.statut) && (
                    <Button
                      variant="luxe"
                      onClick={() => setShowReviewModal(true)}
                      leftIcon={<Star size={14} />}
                    >
                      Laisser un avis
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => router.push('/profile?tab=support')}
                    leftIcon={<HelpCircle size={14} />}
                  >
                    Contacter le support
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrint}
                    leftIcon={<Printer size={14} />}
                  >
                    Imprimer
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    leftIcon={<Download size={14} />}
                  >
                    Facture
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    leftIcon={<Share2 size={14} />}
                  >
                    Partager
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/')}
                    leftIcon={<ShoppingBag size={14} />}
                  >
                    Continuer mes achats
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Conseils / trust */}
            <Card variant="glass" className="border-border">
              <CardContent className="p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Protection acheteur
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Remboursement garanti si article non conforme.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <Truck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Livraison suivie
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suivi GPS en temps réel à Kinshasa et provinces.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-gold-500/10 p-2 text-gold-500">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Support 7j/7
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Une question ? Notre équipe répond en moins de 2 h.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              {/* Résumé */}
              <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText size={18} className="text-gold-500" />
                    Récapitulatif
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">N° commande</span>
                    <span className="font-mono font-semibold text-foreground">
                      {order.numero}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-foreground">{formatDate(order.created_at)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Statut</span>
                    <Badge variant={statusCfg.variant} size="sm">
                      <span className="mr-1">{statusCfg.icon}</span>
                      {statusCfg.label}
                    </Badge>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paiement</span>
                    <span className="capitalize text-foreground">
                      {order.payment_method || 'Mobile Money'}
                    </span>
                  </div>

                  {order.payment_reference && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Réf. transaction</span>
                      <span className="truncate font-mono text-xs text-foreground">
                        {order.payment_reference}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gold-400/20 pt-3">
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        Total
                      </span>
                      <div className="text-right">
                        <p className="text-xl font-extrabold text-gold-600">
                          {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatMoney(totals.secondaryTotal, totals.secondaryCurrency)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Livraison */}
              <Card variant="glass" className="border-gold-400/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck size={18} className="text-gold-500" />
                    Livraison
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-gold-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Adresse</p>
                      <p className="line-clamp-3 text-foreground">
                        {order.adresse_livraison || order.point_retrait?.adresse || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar size={14} className="mt-0.5 shrink-0 text-gold-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Délai estimé</p>
                      <p className="text-foreground">
                        {order.type_livraison === 'express'
                          ? 'Aujourd’hui / demain'
                          : order.type_livraison === 'point_retrait'
                            ? '24h - 48h'
                            : '24h - 72h'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Besoin d'aide */}
              <Card variant="glass" className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-muted p-2 text-gold-500">
                      <HelpCircle size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Une question ?
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Notre support est disponible 7j/7 pour vous accompagner.
                      </p>
                      <Link href="/profile?tab=support" className="mt-3 block">
                        <Button variant="outline-gold" size="sm" fullWidth>
                          Ouvrir un ticket
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Container>

      {/* Barre mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="truncate text-lg font-bold text-gold-600">
              {formatMoney(totals.primaryTotal, totals.primaryCurrency)}
            </p>
          </div>

          {canReview(order.statut) ? (
            <Button
              variant="luxe"
              className="shrink-0"
              onClick={() => setShowReviewModal(true)}
              leftIcon={<Star size={16} />}
            >
              Avis
            </Button>
          ) : (
            <Button
              variant="luxe"
              className="shrink-0"
              onClick={() => router.push('/')}
              leftIcon={<ShoppingBag size={16} />}
            >
              Continuer
            </Button>
          )}
        </div>
      </div>

      {/* Modals */}
      <ReviewModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={(payload) => reviewMutation.mutate(payload)}
        submitting={reviewMutation.isPending}
        order={order}
      />

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Annuler la commande ?"
        description="Cette action est irréversible."
        size="sm"
        accent="red"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              disabled={cancelMutation.isPending}
            >
              Garder la commande
            </Button>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-500 hover:bg-red-500/10"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              leftIcon={
                cancelMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )
              }
            >
              Confirmer l’annulation
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Votre commande #{order.numero} sera annulée. Si un paiement a déjà
          été effectué, le remboursement sera traité sous 3 à 5 jours ouvrés.
        </p>
      </Modal>

      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Demander un retour"
        description="Le support vous contactera pour organiser la reprise."
        size="sm"
        accent="gold"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowReturnModal(false)}
              disabled={returnMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="luxe"
              onClick={() => returnMutation.mutate()}
              disabled={returnMutation.isPending}
              leftIcon={
                returnMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )
              }
            >
              Envoyer la demande
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Assurez-vous que les articles sont dans leur emballage d’origine.
          Un agent vous contactera sous 24 h pour convenir d’un créneau.
        </p>
      </Modal>

      <QrCodeModal
        open={qrModal.open}
        onClose={() => setQrModal({ open: false, code: '', label: '' })}
        code={qrModal.code}
        label={qrModal.label}
      />
    </div>
  )
}