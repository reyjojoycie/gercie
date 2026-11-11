// app/dashboard/livreur/courses/[id]/page.tsx
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

import { Container } from '@/components/layout/Container'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'

import { cn } from '@/lib/utils'

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  ExternalLink,
  ImageOff,
  Key,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  PenLine,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  User,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type CollectStatus = 'en_attente' | 'accepte' | 'refuse'

interface SellerInfo {
  nom: string
  prenom: string
  telephone: string | null
  adresse_boutique: string | null
  latitude?: number | null
  longitude?: number | null
}

interface Article {
  id: string
  produit_id: string
  nom: string
  quantite: number
  specifications?: string | null
  variante?: { attributes: Record<string, string> } | null
  statut_collecte: CollectStatus
  motif_refus?: string | null
  photo_preuve?: string | null
  produits?: {
    id: string
    nom: string
    images: string[]
  }
  vendeur?: SellerInfo | null
}

interface Geoloc {
  latitude: number
  longitude: number
  accuracy?: number | null
}

interface CourseLivraison {
  id: string
  statut: string
  tentativas_code?: number
  created_at?: string | null
  delivered_at?: string | null
  photos_livraison?: string[]
  signature_client?: string | null
  geoloc?: Geoloc | null
}

interface CourseDetail {
  id: string
  numero: string
  type_livraison: string
  adresse: string
  point_retrait_nom: string | null
  commune: string
  code_livraison_client: string
  code_livreur?: string | null
  disponible: boolean
  client: {
    nom: string
    prenom: string
    telephone: string | null
    latitude?: number | null
    longitude?: number | null
  }
  articles: Article[]
  livraison: CourseLivraison | null
}

interface Waypoint {
  id: string
  label: string
  latitude: number
  longitude: number
  type: 'vendeur' | 'client' | 'point_retrait'
}

interface PhotoItem {
  id: string
  file: File
  preview: string
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VALIDATION                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const codeArticleSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Code article invalide (6 chiffres requis)')

const codeClientSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{6}$/i, 'Code client invalide (6 caractères alphanumériques)')

const motifRefusSchema = z
  .string()
  .trim()
  .min(3, 'Motif trop court')
  .max(500, 'Motif trop long')

const signalMessageSchema = z
  .string()
  .trim()
  .min(3, 'Message trop court')
  .max(500, 'Message trop long')

const signalTypeSchema = z.enum([
  'warning',
  'incident',
  'vol',
  'adresse_incorrecte',
  'client_absent',
  'colis_endommage',
  'autre',
])

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTES                                                     */
/* ═══════════════════════════════════════════════════════════════ */

const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const AUTO_REFRESH_INTERVAL_MS = 30_000
const MAX_CODE_ATTEMPTS = 3

const STATUS_ALIASES: Record<string, string> = {
  delivered: 'livree',
  completed: 'livree',
  termine: 'livree',
  terminee: 'livree',

  cancelled: 'annulee',
  canceled: 'annulee',
  refusee: 'annulee',
  echouee: 'annulee',
  failed: 'annulee',

  assigned: 'acceptee',
  accepted: 'acceptee',
  acceptee: 'acceptee',

  picked_up: 'colis_recupere',
  recupere: 'colis_recupere',
  collecte: 'colis_recupere',

  in_transit: 'en_route',
  en_cours: 'en_route',
  route: 'en_route',

  pending: 'en_attente',
  en_attente: 'en_attente',
}

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  acceptee: 'Acceptée',
  colis_recupere: 'Colis récupéré',
  en_route: 'En route',
  livree: 'Livrée',
  annulee: 'Annulée',
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  warning: 'Avertissement',
  incident: 'Incident',
  vol: 'Vol suspecté',
  adresse_incorrecte: 'Adresse incorrecte',
  client_absent: 'Client absent',
  colis_endommage: 'Colis endommagé',
  autre: 'Autre',
}

const STORAGE_BUCKETS = {
  preuve: ['preuves', 'proofs', 'documents', 'media'],
  livraison: ['livraisons', 'preuves', 'documents', 'media'],
  signalement: ['signalements', 'preuves', 'documents', 'media'],
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function notify(
  toast: any,
  type: 'success' | 'error' | 'info' | 'warning',
  message: string
) {
  if (typeof toast?.addToast === 'function') {
    toast.addToast({ type, message })
    return
  }

  if (typeof toast?.show === 'function') {
    toast.show({ type, message })
  }
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false

  const str = String(value ?? '').toLowerCase().trim()

  if (['true', 'oui', 'yes', 'on', 'actif', 'active'].includes(str)) return true
  if (['false', 'non', 'no', 'off', 'inactif', 'inactive'].includes(str)) {
    return false
  }

  return fallback
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  return str ? str : null
}

function toArray(payload: any, keys: string[] = []): any[] {
  if (Array.isArray(payload)) return payload

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }

  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results

  return []
}

function toStringArray(payload: any): string[] {
  if (!payload) return []

  if (Array.isArray(payload)) {
    return payload.map((item) => String(item)).filter(Boolean)
  }

  if (typeof payload === 'string') {
    return payload
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeStatus(value: unknown): string {
  const raw = String(value || 'en_attente')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

  return STATUS_ALIASES[raw] || raw
}

function statusLabel(value: string): string {
  const normalized = normalizeStatus(value)
  return STATUS_LABELS[normalized] || normalized
}

function statusVariant(
  value: string
): 'accent' | 'danger' | 'warm' | 'neutral' | 'gold' {
  const normalized = normalizeStatus(value)

  if (normalized === 'livree') return 'accent'
  if (normalized === 'annulee') return 'danger'
  if (normalized === 'en_route' || normalized === 'colis_recupere') return 'gold'
  if (normalized === 'acceptee') return 'warm'

  return 'neutral'
}

function normalizeCollectStatus(value: unknown): CollectStatus {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')

  if (['accepte', 'valide', 'ok', 'collecte', 'recupere'].includes(raw)) {
    return 'accepte'
  }

  if (['refuse', 'rejete', 'cancel', 'annule'].includes(raw)) {
    return 'refuse'
  }

  return 'en_attente'
}

function formatDate(value?: string | null): string {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

function formatDateTime(value?: string | null): string {
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
    return String(value)
  }
}

function formatRelative(value?: string | null): string {
  if (!value) return '—'

  try {
    const diff = Date.now() - new Date(value).getTime()
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    if (hours < 24) return `il y a ${hours} h`
    if (days < 30) return `il y a ${days} j`

    return formatDate(value)
  } catch {
    return '—'
  }
}

function sanitizeFileName(name: string): string {
  return (
    String(name || 'photo')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100) || 'photo'
  )
}

function getExtension(file: File): string {
  const parts = file.name.split('.')
  return parts.length > 1 ? String(parts.pop()).toLowerCase() : 'jpg'
}

function isValidImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') &&
    ['jpg', 'jpeg', 'png', 'webp'].includes(getExtension(file))
  )
}

function mapsCoordsUrl(lat?: number | null, lng?: number | null): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function mapsAddressUrl(parts: Array<string | null | undefined>): string | null {
  const query = parts.filter(Boolean).join(', ').trim()
  if (!query) return null

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function directionsUrl(
  origin?: { latitude: number; longitude: number } | null,
  destination?: { latitude: number; longitude: number } | null
): string | null {
  if (!origin || !destination) return null

  return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}`
}

function telHref(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '')

  if (!digits) return '#'

  const normalized = digits.startsWith('243')
    ? `+${digits}`
    : digits.startsWith('0')
      ? `+243${digits.slice(1)}`
      : `+243${digits}`

  return `tel:${normalized}`
}

function waHref(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '')

  if (!digits) return null

  const normalized = digits.startsWith('243')
    ? digits
    : digits.startsWith('0')
      ? `243${digits.slice(1)}`
      : `243${digits}`

  return `https://wa.me/${normalized}`
}

async function copyText(text: string): Promise<boolean> {
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

/* ═══════════════════════════════════════════════════════════════ */
/*  NORMALIZATION                                                  */
/* ═══════════════════════════════════════════════════════════════ */

function normalizeArticle(raw: any, index = 0): Article {
  const id = String(raw?.id || raw?.article_id || `article-${index}`)
  const produitId = String(raw?.produit_id || raw?.product_id || id)

  const images = toStringArray(
    raw?.produits?.images ?? raw?.product_images ?? raw?.images
  )

  const vendeurRaw = raw?.vendeur ?? raw?.seller ?? raw?.boutique ?? null

  return {
    id,
    produit_id: produitId,
    nom: String(
      raw?.nom ||
        raw?.product_name ||
        raw?.produits?.nom ||
        `Article ${index + 1}`
    ).trim(),
    quantite: toNum(raw?.quantite ?? raw?.quantity, 1),
    specifications: textOrNull(raw?.specifications ?? raw?.specs),
    variante: raw?.variante ?? null,
    statut_collecte: normalizeCollectStatus(
      raw?.statut_collecte ?? raw?.collect_status ?? raw?.statut
    ),
    motif_refus: textOrNull(raw?.motif_refus ?? raw?.refuse_reason),
    photo_preuve: textOrNull(raw?.photo_preuve ?? raw?.proof_photo),
    produits: {
      id: produitId,
      nom: String(raw?.produits?.nom || raw?.nom || '').trim(),
      images,
    },
    vendeur: vendeurRaw
      ? {
          nom: String(vendeurRaw.nom || vendeurRaw.last_name || '').trim(),
          prenom: String(vendeurRaw.prenom || vendeurRaw.first_name || '').trim(),
          telephone: textOrNull(vendeurRaw.telephone ?? vendeurRaw.phone),
          adresse_boutique: textOrNull(
            vendeurRaw.adresse_boutique ??
              vendeurRaw.boutique_address ??
              vendeurRaw.address
          ),
          latitude: toNullableNumber(vendeurRaw.latitude),
          longitude: toNullableNumber(vendeurRaw.longitude),
        }
      : null,
  }
}

function normalizeCourse(payload: any): CourseDetail {
  const src = payload?.data ?? payload?.course ?? payload ?? {}

  const clientRaw = src.client ?? src.acheteur ?? src.customer ?? {}
  const livraisonRaw = src.livraison ?? null

  const articles = toArray(src.articles ?? src.commande_articles ?? src.items).map(
    normalizeArticle
  )

  return {
    id: String(src.id || src.commande_id || src.order_id || ''),
    numero: String(
      src.numero ||
        src.numero_commande ||
        src.order_number ||
        src.id ||
        ''
    ),
    type_livraison: String(src.type_livraison || 'domicile').toLowerCase(),
    adresse:
      textOrNull(
        src.adresse ??
          src.adresse_livraison ??
          src.delivery_address ??
          src.address
      ) || '',
    point_retrait_nom: textOrNull(
      src.point_retrait_nom ??
        src.pickup_point_name ??
        src.point_retrait?.nom
    ),
    commune: textOrNull(src.commune ?? src.ville ?? src.zone) || '',
    code_livraison_client:
      textOrNull(src.code_livraison_client ?? src.code_client) || '',
    code_livreur: textOrNull(src.code_livreur),
    disponible: toBool(src.disponible ?? true, true),
    client: {
      nom: String(
        clientRaw.nom ||
          clientRaw.last_name ||
          src.client_nom ||
          ''
      ).trim(),
      prenom: String(
        clientRaw.prenom ||
          clientRaw.first_name ||
          src.client_prenom ||
          ''
      ).trim(),
      telephone: textOrNull(clientRaw.telephone ?? clientRaw.phone),
      latitude: toNullableNumber(
        clientRaw.latitude ?? src.latitude_livraison ?? src.lat
      ),
      longitude: toNullableNumber(
        clientRaw.longitude ?? src.longitude_livraison ?? src.lng
      ),
    },
    articles,
    livraison: livraisonRaw
      ? {
          id: String(livraisonRaw.id || livraisonRaw.livraison_id || ''),
          statut: normalizeStatus(livraisonRaw.statut ?? livraisonRaw.status),
          tentativas_code: toNum(livraisonRaw.tentativas_code, 0),
          created_at: textOrNull(livraisonRaw.created_at),
          delivered_at: textOrNull(
            livraisonRaw.delivered_at ?? livraisonRaw.date_livraison
          ),
          photos_livraison: toStringArray(
            livraisonRaw.photos_livraison ?? livraisonRaw.delivery_photos
          ),
          signature_client: textOrNull(
            livraisonRaw.signature_client ?? livraisonRaw.client_signature
          ),
          geoloc:
            livraisonRaw.geoloc ??
            (livraisonRaw.latitude !== undefined &&
            livraisonRaw.longitude !== undefined
              ? {
                  latitude: toNum(livraisonRaw.latitude),
                  longitude: toNum(livraisonRaw.longitude),
                  accuracy: toNullableNumber(livraisonRaw.accuracy),
                }
              : null),
        }
      : null,
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  LOCAL UI COMPONENTS                                            */
/* ═══════════════════════════════════════════════════════════════ */

function InfoRow({
  label,
  value,
  icon,
  action,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>

      <span className="min-w-0 text-right font-medium text-foreground">
        {value}
      </span>

      {action}
    </div>
  )
}

function CourseTimeline({
  statut,
  collecteValidee,
  dateAcceptation,
  deliveredAt,
  animated = true,
}: {
  statut: string
  collecteValidee: boolean
  dateAcceptation?: string | null
  deliveredAt?: string | null
  animated?: boolean
}) {
  const reduced = useReducedMotion()
  const normalized = normalizeStatus(statut)

  if (normalized === 'annulee') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
        <p className="flex items-center gap-2 font-semibold">
          <XCircle size={16} />
          Course annulée
        </p>
        <p className="mt-1 text-xs opacity-90">
          Cette course ne peut plus être traitée.
        </p>
      </div>
    )
  }

  const isAccepted = Boolean(dateAcceptation) || normalized !== 'en_attente'
  const isCollected = collecteValidee || ['colis_recupere', 'en_route', 'livree'].includes(normalized)
  const isEnRoute = ['en_route', 'livree'].includes(normalized)
  const isDelivered = normalized === 'livree'

  const steps = [
    {
      label: 'Course acceptée',
      done: isAccepted,
      date: dateAcceptation,
      icon: <CheckCircle size={14} />,
    },
    {
      label: 'Articles collectés',
      done: isCollected,
      date: null,
      icon: <Package size={14} />,
    },
    {
      label: 'En route',
      done: isEnRoute,
      date: null,
      icon: <Truck size={14} />,
    },
    {
      label: 'Livrée',
      done: isDelivered,
      date: deliveredAt,
      icon: <ShieldCheck size={14} />,
    },
  ]

  return (
    <ol className="relative space-y-4 border-l border-gold-400/20 pl-6">
      {steps.map((step, index) => (
        <motion.li
          key={step.label}
          initial={animated && !reduced ? { opacity: 0, x: -8 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.06 }}
          className="relative"
        >
          <span
            className={cn(
              'absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2',
              step.done
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border bg-card text-muted-foreground'
            )}
          >
            {step.icon}
          </span>

          <div className="min-w-0">
            <p
              className={cn(
                'text-sm font-semibold',
                step.done ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </p>

            {step.date && (
              <p className="text-xs text-muted-foreground">
                {formatDateTime(step.date)}
              </p>
            )}
          </div>
        </motion.li>
      ))}
    </ol>
  )
}

function ItineraryCard({
  waypoints,
  destination,
  adresse,
  commune,
  pointRetraitNom,
}: {
  waypoints: Waypoint[]
  destination?: { latitude: number; longitude: number; label: string } | null
  adresse: string
  commune: string
  pointRetraitNom?: string | null
}) {
  const firstOrigin = waypoints[0]
  const destCoords = destination
    ? { latitude: destination.latitude, longitude: destination.longitude }
    : null

  const mainDirections = directionsUrl(firstOrigin, destCoords)
  const addressUrl =
    mapsCoordsUrl(destCoords?.latitude, destCoords?.longitude) ||
    mapsAddressUrl([adresse, commune, pointRetraitNom])

  return (
    <Card className="border-gold-400/20 bg-card/70 shadow-gold">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route size={18} className="text-gold-500" />
          Itinéraire
        </CardTitle>
        <CardDescription>
          Points de collecte et destination finale.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {waypoints.length > 0 ? (
          <div className="space-y-2">
            {waypoints.map((point) => {
              const url = mapsCoordsUrl(point.latitude, point.longitude)

              return (
                <div
                  key={point.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {point.label}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                    </p>
                  </div>

                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition hover:border-gold-400/50 hover:text-gold-500"
                      aria-label="Ouvrir sur Google Maps"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun point de collecte géolocalisé disponible.
          </p>
        )}

        <div className="rounded-xl border border-gold-400/20 bg-gold-500/5 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Destination
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {destination?.label || adresse || commune || 'Adresse non renseignée'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {mainDirections && (
            <a href={mainDirections} target="_blank" rel="noopener noreferrer">
              <Button
                variant="luxe"
                size="sm"
                leftIcon={<Navigation size={14} />}
              >
                Ouvrir l’itinéraire
              </Button>
            </a>
          )}

          {addressUrl && (
            <a href={addressUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline-gold"
                size="sm"
                leftIcon={<MapPin size={14} />}
              >
                Voir la destination
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SignaturePad({
  onChange,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      canvas.width = rect.width * ratio
      canvas.height = height * ratio

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111827'

      ctxRef.current = ctx
    }

    resize()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
    }
  }, [height])

  const getPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const ctx = ctxRef.current
    if (!ctx) return

    drawingRef.current = true
    const pos = getPos(event)

    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return

    const ctx = ctxRef.current
    if (!ctx) return

    const pos = getPos(event)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()

    if (isEmpty) setIsEmpty(false)
  }

  const handlePointerUp = () => {
    drawingRef.current = false
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onChange(null)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return

    onChange(canvas.toDataURL('image/png'))
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="w-full touch-none rounded-2xl border border-border bg-white dark:bg-neutral-100"
        style={{ height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={clear} leftIcon={<X size={14} />}>
          Effacer
        </Button>

        <Button
          variant="luxe"
          size="sm"
          onClick={save}
          disabled={isEmpty}
          leftIcon={<Check size={14} />}
        >
          Enregistrer la signature
        </Button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PAGE                                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const auth = useAuth() as any
  const user = auth?.user
  const authLoading = Boolean(auth?.loading)

  const toast = useToast()
  const prefersReduced = useReducedMotion()

  const refuseFileRef = useRef<HTMLInputElement | null>(null)
  const signalFileRef = useRef<HTMLInputElement | null>(null)
  const livraisonFileRef = useRef<HTMLInputElement | null>(null)

  const [collectCodes, setCollectCodes] = useState<Record<string, string>>({})
  const [validatingArticle, setValidatingArticle] = useState<string | null>(null)

  const [refuseModal, setRefuseModal] = useState<{
    articleId: string
    articleNom: string
  } | null>(null)
  const [refuseMotif, setRefuseMotif] = useState('')
  const [refusePhoto, setRefusePhoto] = useState<File | null>(null)
  const [refusePhotoPreview, setRefusePhotoPreview] = useState<string | null>(null)

  const [livraisonPhotos, setLivraisonPhotos] = useState<PhotoItem[]>([])
  const [showLivraisonPhotoModal, setShowLivraisonPhotoModal] = useState(false)

  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)

  const [clientCode, setClientCode] = useState('')
  const [tentativesRestantes, setTentativesRestantes] = useState(MAX_CODE_ATTEMPTS)

  const [showSignalModal, setShowSignalModal] = useState(false)
  const [signalType, setSignalType] = useState<string>('warning')
  const [signalMessage, setSignalMessage] = useState('')
  const [signalPhoto, setSignalPhoto] = useState<File | null>(null)
  const [signalPhotoPreview, setSignalPhotoPreview] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState(false)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [online, setOnline] = useState(true)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Title                                                       */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Détail de la course | Gercie'
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Auth guard                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace(
        `/login?redirect=${encodeURIComponent(`/dashboard/livreur/courses/${id || ''}`)}`
      )
    }
  }, [authLoading, id, router, user])

  /* ---------------------------------------------------------- */
  /* Online status                                               */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return

    setOnline(navigator.onLine)

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  /* ---------------------------------------------------------- */
  /* Query                                                       */
  /* ---------------------------------------------------------- */

  const courseQuery = useQuery<CourseDetail>({
    queryKey: ['livreur-course', id],
    queryFn: async () => {
      const res = await fetch(`/api/livreur/courses/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          json?.detail || json?.error || 'Impossible de charger la course.'
        )
      }

      return normalizeCourse(json)
    },
    enabled: Boolean(user && !authLoading && id),
    staleTime: 8_000,
    placeholderData: (previous) => previous,
    retry: 1,
  })

  const course = courseQuery.data
  const isFetching = courseQuery.isFetching
  const errorMessage =
    courseQuery.error instanceof Error
      ? courseQuery.error.message
      : 'Erreur inconnue.'

  /* ---------------------------------------------------------- */
  /* Auto refresh                                                */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      courseQuery.refetch()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [autoRefresh, courseQuery])

  /* ---------------------------------------------------------- */
  /* Tentatives                                                  */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    const used = toNum(course?.livraison?.tentativas_code, 0)
    setTentativesRestantes(Math.max(0, MAX_CODE_ATTEMPTS - used))
  }, [course?.livraison?.tentativas_code])

  /* ---------------------------------------------------------- */
  /* Cleanup previews on unmount                                 */
  /* ---------------------------------------------------------- */

  useEffect(() => {
    return () => {
      livraisonPhotos.forEach((photo) => {
        try {
          URL.revokeObjectURL(photo.preview)
        } catch {}
      })

      if (refusePhotoPreview) {
        try {
          URL.revokeObjectURL(refusePhotoPreview)
        } catch {}
      }

      if (signalPhotoPreview) {
        try {
          URL.revokeObjectURL(signalPhotoPreview)
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------- */
  /* Upload helper                                               */
  /* ---------------------------------------------------------- */

  const uploadImage = useCallback(
    async (
      file: File,
      kind: 'preuve' | 'livraison' | 'signalement'
    ): Promise<string | null> => {
      const buckets = STORAGE_BUCKETS[kind]
      const ext = getExtension(file)
      const safeName = sanitizeFileName(file.name)
      const userId = user?.id || 'anon'
      const path = `${kind}s/${userId}/${Date.now()}-${safeName}.${ext}`

      for (const bucket of buckets) {
        try {
          const { error: uploadError } = await supabaseBrowser.storage
            .from(bucket)
            .upload(path, file, {
              cacheControl: '3600',
              contentType: file.type,
              upsert: false,
            })

          if (!uploadError) {
            const { data } = supabaseBrowser.storage
              .from(bucket)
              .getPublicUrl(path)

            if (data?.publicUrl) return data.publicUrl
          }
        } catch {
          // try next bucket
        }
      }

      return null
    },
    [user?.id]
  )

  const getGeolocation = useCallback(async (): Promise<Geoloc | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
          })
        },
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        }
      )
    })
  }, [])

  /* ---------------------------------------------------------- */
  /* Derived data                                                */
  /* ---------------------------------------------------------- */

  const normalizedStatus = normalizeStatus(course?.livraison?.statut || 'en_attente')
  const isDelivered = normalizedStatus === 'livree'
  const isCancelled = normalizedStatus === 'annulee'
  const isAccepted = Boolean(course?.livraison) && !isCancelled

  const articles = course?.articles ?? []

  const acceptedArticles = articles.filter((a) => a.statut_collecte === 'accepte')
  const refusedArticles = articles.filter((a) => a.statut_collecte === 'refuse')
  const pendingArticles = articles.filter((a) => a.statut_collecte === 'en_attente')

  const allArticlesTraited =
    articles.length > 0 && pendingArticles.length === 0

  const canDeliver =
    Boolean(course) &&
    isAccepted &&
    !isDelivered &&
    !isCancelled &&
    allArticlesTraited &&
    tentativesRestantes > 0

  const waypoints: Waypoint[] = useMemo(() => {
    if (!course) return []

    const map = new Map<string, Waypoint>()

    for (const article of course.articles) {
      const seller = article.vendeur
      if (!seller?.latitude || !seller?.longitude) continue

      const key = `${seller.latitude},${seller.longitude}`
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          label:
            [seller.prenom, seller.nom].filter(Boolean).join(' ') ||
            seller.adresse_boutique ||
            'Vendeur',
          latitude: seller.latitude,
          longitude: seller.longitude,
          type: 'vendeur',
        })
      }
    }

    return Array.from(map.values())
  }, [course])

  const destination = useMemo(() => {
    if (!course?.client?.latitude || !course?.client?.longitude) return null

    return {
      latitude: course.client.latitude,
      longitude: course.client.longitude,
      label:
        [course.client.prenom, course.client.nom].filter(Boolean).join(' ') ||
        'Client',
    }
  }, [course])

  const sellers = useMemo(() => {
    if (!course) return []

    const map = new Map<string, SellerInfo & { articleNames: string[] }>()

    for (const article of course.articles) {
      const seller = article.vendeur
      if (!seller) continue

      const key =
        seller.telephone ||
        seller.adresse_boutique ||
        `${seller.prenom} ${seller.nom}`

      const existing = map.get(key)

      if (existing) {
        existing.articleNames.push(article.nom)
      } else {
        map.set(key, {
          ...seller,
          articleNames: [article.nom],
        })
      }
    }

    return Array.from(map.values())
  }, [course])

  const clientFullName = course
    ? [course.client.prenom, course.client.nom].filter(Boolean).join(' ')
    : '—'

  const clientWaHref = waHref(course?.client.telephone)
  const clientAddressUrl =
    mapsCoordsUrl(course?.client.latitude, course?.client.longitude) ||
    mapsAddressUrl([course?.adresse, course?.commune, course?.point_retrait_nom])

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleCopy = useCallback(
    async (text: string, key: string) => {
      if (!text) return

      const ok = await copyText(text)

      if (ok) {
        setCopiedKey(key)
        notify(toast, 'success', 'Copié.')
        setTimeout(() => setCopiedKey(null), 1800)
      } else {
        notify(toast, 'error', 'Copie impossible.')
      }
    },
    [toast]
  )

  const toggleExpandArticle = useCallback((articleId: string) => {
    setExpandedArticles((prev) => {
      const next = new Set(prev)

      if (next.has(articleId)) {
        next.delete(articleId)
      } else {
        next.add(articleId)
      }

      return next
    })
  }, [])

  const acceptCourse = useCallback(async () => {
    if (!course) return

    if (!course.disponible) {
      notify(toast, 'warning', 'Cette course n’est plus disponible.')
      return
    }

    setActionLoading(true)

    try {
      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'accept' }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.detail || json?.error || 'Erreur lors de l’acceptation.')
      }

      notify(toast, 'success', 'Course acceptée.')
      await courseQuery.refetch()
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de l’acceptation.')
    } finally {
      setActionLoading(false)
    }
  }, [course, courseQuery, id, toast])

  const validateArticle = useCallback(
    async (articleId: string) => {
      const code = collectCodes[articleId] || ''
      const parsed = codeArticleSchema.safeParse(code)

      if (!parsed.success) {
        notify(toast, 'error', parsed.error.issues[0]?.message || 'Code invalide.')
        return
      }

      setValidatingArticle(articleId)

      try {
        const res = await fetch(`/api/livreur/courses/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'validate-article',
            article_id: articleId,
            code: parsed.data,
          }),
        })

        const json = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(json?.detail || json?.error || 'Erreur de validation.')
        }

        notify(toast, 'success', 'Article validé.')
        setCollectCodes((prev) => {
          const next = { ...prev }
          delete next[articleId]
          return next
        })

        await courseQuery.refetch()
      } catch (err: any) {
        notify(toast, 'error', err?.message || 'Erreur de validation.')
      } finally {
        setValidatingArticle(null)
      }
    },
    [collectCodes, courseQuery, id, toast]
  )

  const openRefuseModal = useCallback((article: Article) => {
    setRefuseModal({ articleId: article.id, articleNom: article.nom })
    setRefuseMotif('')
    setRefusePhoto(null)
    setRefusePhotoPreview(null)
  }, [])

  const closeRefuseModal = useCallback(() => {
    if (refusePhotoPreview) {
      try {
        URL.revokeObjectURL(refusePhotoPreview)
      } catch {}
    }

    setRefuseModal(null)
    setRefuseMotif('')
    setRefusePhoto(null)
    setRefusePhotoPreview(null)
  }, [refusePhotoPreview])

  const handleRefusePhotoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (!isValidImageFile(file)) {
        notify(toast, 'error', 'Format image requis (JPG, PNG, WEBP).')
        event.target.value = ''
        return
      }

      if (file.size > MAX_PHOTO_BYTES) {
        notify(toast, 'error', 'Taille maximale : 3 Mo.')
        event.target.value = ''
        return
      }

      if (refusePhotoPreview) {
        try {
          URL.revokeObjectURL(refusePhotoPreview)
        } catch {}
      }

      setRefusePhoto(file)
      setRefusePhotoPreview(URL.createObjectURL(file))
      event.target.value = ''
    },
    [refusePhotoPreview, toast]
  )

  const refuseArticle = useCallback(async () => {
    if (!refuseModal) return

    const parsedMotif = motifRefusSchema.safeParse(refuseMotif)

    if (!parsedMotif.success) {
      notify(toast, 'error', parsedMotif.error.issues[0]?.message || 'Motif invalide.')
      return
    }

    setActionLoading(true)

    try {
      let photoUrl: string | null = null

      if (refusePhoto) {
        photoUrl = await uploadImage(refusePhoto, 'preuve')

        if (!photoUrl) {
          notify(toast, 'warning', 'Photo non envoyée, mais le refus est enregistré.')
        }
      }

      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'refuse-article',
          article_id: refuseModal.articleId,
          motif: parsedMotif.data,
          photo_preuve: photoUrl,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.detail || json?.error || 'Erreur lors du refus.')
      }

      notify(toast, 'success', 'Article refusé.')
      closeRefuseModal()
      await courseQuery.refetch()
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors du refus.')
    } finally {
      setActionLoading(false)
    }
  }, [closeRefuseModal, courseQuery, id, refuseModal, refusePhoto, refuseMotif, toast, uploadImage])

  const addLivraisonPhotos = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])

      if (files.length === 0) return

      const validFiles = files.filter((file) => {
        if (!isValidImageFile(file)) {
          notify(toast, 'error', `${file.name} : format non supporté.`)
          return false
        }

        if (file.size > MAX_PHOTO_BYTES) {
          notify(toast, 'error', `${file.name} : taille supérieure à 3 Mo.`)
          return false
        }

        return true
      })

      const newPhotos: PhotoItem[] = validFiles.map((file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
      }))

      setLivraisonPhotos((prev) => [...prev, ...newPhotos])
      event.target.value = ''
    },
    [toast]
  )

  const removeLivraisonPhoto = useCallback((photoId: string) => {
    setLivraisonPhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId)

      if (target) {
        try {
          URL.revokeObjectURL(target.preview)
        } catch {}
      }

      return prev.filter((photo) => photo.id !== photoId)
    })
  }, [])

  const clearLivraisonPhotos = useCallback(() => {
    setLivraisonPhotos((prev) => {
      prev.forEach((photo) => {
        try {
          URL.revokeObjectURL(photo.preview)
        } catch {}
      })

      return []
    })
  }, [])

  const handleSignalPhotoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (!isValidImageFile(file)) {
        notify(toast, 'error', 'Format image requis (JPG, PNG, WEBP).')
        event.target.value = ''
        return
      }

      if (file.size > MAX_PHOTO_BYTES) {
        notify(toast, 'error', 'Taille maximale : 3 Mo.')
        event.target.value = ''
        return
      }

      if (signalPhotoPreview) {
        try {
          URL.revokeObjectURL(signalPhotoPreview)
        } catch {}
      }

      setSignalPhoto(file)
      setSignalPhotoPreview(URL.createObjectURL(file))
      event.target.value = ''
    },
    [signalPhotoPreview, toast]
  )

  const closeSignalModal = useCallback(() => {
    if (signalPhotoPreview) {
      try {
        URL.revokeObjectURL(signalPhotoPreview)
      } catch {}
    }

    setShowSignalModal(false)
    setSignalType('warning')
    setSignalMessage('')
    setSignalPhoto(null)
    setSignalPhotoPreview(null)
  }, [signalPhotoPreview])

  const signalIncident = useCallback(async () => {
    const parsedMessage = signalMessageSchema.safeParse(signalMessage)
    const parsedType = signalTypeSchema.safeParse(signalType)

    if (!parsedType.success) {
      notify(toast, 'error', 'Type de signalement invalide.')
      return
    }

    if (!parsedMessage.success) {
      notify(toast, 'error', parsedMessage.error.issues[0]?.message || 'Message invalide.')
      return
    }

    setActionLoading(true)

    try {
      let photoUrl: string | null = null

      if (signalPhoto) {
        photoUrl = await uploadImage(signalPhoto, 'signalement')

        if (!photoUrl) {
          notify(toast, 'warning', 'Photo non envoyée, mais le signalement est transmis.')
        }
      }

      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'signal',
          type: parsedType.data,
          message: parsedMessage.data,
          photo: photoUrl,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.detail || json?.error || 'Erreur lors du signalement.')
      }

      notify(toast, 'success', 'Signalement envoyé.')
      closeSignalModal()
      await courseQuery.refetch()
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors du signalement.')
    } finally {
      setActionLoading(false)
    }
  }, [closeSignalModal, courseQuery, id, signalMessage, signalPhoto, signalType, toast, uploadImage])

  const deliverCourse = useCallback(async () => {
    if (!course) return

    const parsedCode = codeClientSchema.safeParse(clientCode)

    if (!parsedCode.success) {
      notify(toast, 'error', parsedCode.error.issues[0]?.message || 'Code client invalide.')
      return
    }

    const submittedCode = parsedCode.data.toUpperCase()

    if (
      course.code_livraison_client &&
      submittedCode !== course.code_livraison_client.toUpperCase()
    ) {
      notify(toast, 'error', 'Le code client ne correspond pas.')
      return
    }

    setActionLoading(true)

    try {
      const photoUrls: string[] = []

      for (const photo of livraisonPhotos) {
        const url = await uploadImage(photo.file, 'livraison')

        if (url) {
          photoUrls.push(url)
        } else {
          notify(toast, 'warning', 'Une photo de livraison n’a pas pu être envoyée.')
        }
      }

      const geoloc = await getGeolocation()

      const res = await fetch(`/api/livreur/courses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'deliver',
          code_client: submittedCode,
          photos_livraison: photoUrls,
          signature_client: signatureData,
          geoloc,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.detail || json?.error || 'Erreur lors de la livraison.')
      }

      notify(toast, 'success', 'Livraison validée.')

      clearLivraisonPhotos()
      setSignatureData(null)
      setClientCode('')

      await courseQuery.refetch()

      setTimeout(() => {
        router.push('/dashboard/livreur')
      }, 900)
    } catch (err: any) {
      notify(toast, 'error', err?.message || 'Erreur lors de la livraison.')
      setTentativesRestantes((prev) => Math.max(0, prev - 1))
    } finally {
      setActionLoading(false)
    }
  }, [
    clearLivraisonPhotos,
    clientCode,
    course,
    courseQuery,
    getGeolocation,
    id,
    livraisonPhotos,
    router,
    signatureData,
    toast,
    uploadImage,
  ])

  /* ---------------------------------------------------------- */
  /* Render guards                                               */
  /* ---------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-midnight-950">
        <Spinner size="xl" variant="premium" label="Chargement de la course..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card className="w-full max-w-md border-border bg-card/70">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <User size={40} className="text-muted-foreground" />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Connexion requise
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu dois être connecté pour consulter cette course.
              </p>
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/dashboard/livreur/courses/${id || ''}`)}`}
            >
              <Button variant="luxe">Se connecter</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (courseQuery.isLoading && !course) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
        <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
          <Container className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          </Container>
        </div>

        <Container className="relative z-10 max-w-5xl py-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-40 animate-pulse rounded-3xl bg-muted" />
              <div className="h-80 animate-pulse rounded-3xl bg-muted" />
            </div>
            <div className="space-y-6">
              <div className="h-64 animate-pulse rounded-3xl bg-muted" />
              <div className="h-48 animate-pulse rounded-3xl bg-muted" />
            </div>
          </div>
        </Container>
      </div>
    )
  }

  if (courseQuery.isError && !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-midnight-950">
        <Card className="w-full max-w-md border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertTriangle size={40} className="text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-red-700 dark:text-red-300">
                Course introuvable
              </h1>
              <p className="mt-2 text-sm text-red-700/80 dark:text-red-300/80">
                {errorMessage}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline-gold"
                onClick={() => courseQuery.refetch()}
                leftIcon={<RefreshCw size={14} />}
              >
                Réessayer
              </Button>

              <Link href="/dashboard/livreur">
                <Button variant="ghost">Retour</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!course) return null

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div className="relative min-h-screen bg-neutral-50 pb-16 dark:bg-midnight-950">
      <div className="pattern-dots pointer-events-none absolute inset-0 opacity-5 dark:opacity-10" />

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-gold-400/20 bg-white/70 shadow-soft backdrop-blur-xl dark:bg-midnight-900/70">
        <Container className="flex flex-wrap items-center gap-4 py-4">
          <Link
            href="/dashboard/livreur"
            className="rounded-xl p-2 text-neutral-400 transition hover:bg-gold-400/10 hover:text-gold-500"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft size={20} />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                Commande #{course.numero}
              </h1>

              <Badge variant={statusVariant(normalizedStatus)} size="sm">
                {statusLabel(normalizedStatus)}
              </Badge>

              {!course.disponible && (
                <Badge variant="danger" size="sm">
                  Plus disponible
                </Badge>
              )}
            </div>

            <p className="mt-1 flex items-center gap-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
              <MapPin size={14} className="text-gold-500" />
              {course.commune || 'Commune non renseignée'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip
              content={
                autoRefresh
                  ? 'Désactiver l’actualisation automatique'
                  : 'Activer l’actualisation automatique'
              }
            >
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={cn(
                  'rounded-xl border p-2 transition',
                  autoRefresh
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={autoRefresh}
                aria-label="Actualisation automatique"
              >
                <Activity size={16} className={autoRefresh ? 'animate-spin' : ''} />
              </button>
            </Tooltip>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowSignalModal(true)}
              leftIcon={<AlertTriangle size={14} />}
            >
              Signaler
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => courseQuery.refetch()}
              loading={isFetching}
              leftIcon={<RefreshCw size={14} />}
            >
              Actualiser
            </Button>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 max-w-5xl py-8">
        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
            >
              <WifiOff size={18} className="shrink-0" />
              <p>
                Vous êtes hors ligne. Certaines actions peuvent échouer.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="grid gap-8 lg:grid-cols-3"
        >
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2">
            {!course.disponible && (
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20">
                <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <p>
                    Cette course n’est plus disponible. Elle a peut-être été
                    réassignée ou annulée par le dispatch.
                  </p>
                </CardContent>
              </Card>
            )}

            {course.code_livreur && (
              <Card className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Key size={20} />
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase text-blue-700 dark:text-blue-300">
                        Code livreur
                      </p>
                      <p className="font-mono text-xl font-bold tracking-widest text-blue-900 dark:text-blue-100">
                        {course.code_livreur}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(course.code_livreur!, 'code-livreur')}
                    leftIcon={
                      copiedKey === 'code-livreur' ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} />
                      )
                    }
                  >
                    Copier
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isAccepted && !isCancelled && (
              <Card className="border-gold-400/20 bg-card/70 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck size={18} className="text-gold-500" />
                    Accepter la course
                  </CardTitle>
                  <CardDescription>
                    Confirme ta prise en charge pour générer ton code livreur.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <Button
                    variant="luxe"
                    fullWidth
                    size="lg"
                    onClick={acceptCourse}
                    loading={actionLoading}
                    disabled={!course.disponible}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Accepter cette course
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="border-gold-400/20 bg-card/70 shadow-gold">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList size={18} className="text-gold-500" />
                  Progression
                </CardTitle>
              </CardHeader>

              <CardContent>
                <CourseTimeline
                  statut={normalizedStatus}
                  collecteValidee={allArticlesTraited}
                  dateAcceptation={course.livraison?.created_at}
                  deliveredAt={course.livraison?.delivered_at}
                  animated={!prefersReduced}
                />
              </CardContent>
            </Card>

            <ItineraryCard
              waypoints={waypoints}
              destination={destination}
              adresse={course.adresse}
              commune={course.commune}
              pointRetraitNom={course.point_retrait_nom}
            />

            <Card className="border-gold-400/20 bg-card/70 shadow-gold">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package size={18} className="text-gold-500" />
                    Articles à collecter ({articles.length})
                  </CardTitle>
                  <CardDescription>
                    Saisis le code à 6 chiffres de chaque article ou refuse-le avec un motif.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="accent" size="sm">
                    {acceptedArticles.length} validé(s)
                  </Badge>
                  <Badge variant="danger" size="sm">
                    {refusedArticles.length} refusé(s)
                  </Badge>
                  <Badge variant="neutral" size="sm">
                    {pendingArticles.length} en attente
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {articles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun article associé à cette course.
                  </p>
                ) : (
                  articles.map((article, index) => {
                    const isExpanded = expandedArticles.has(article.id)
                    const isOk = article.statut_collecte === 'accepte'
                    const isRefused = article.statut_collecte === 'refuse'
                    const image = article.produits?.images?.[0]

                    return (
                      <motion.div
                        key={article.id}
                        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.04, 0.3) }}
                        className={cn(
                          'rounded-2xl border p-4 transition-colors',
                          isOk &&
                            'border-emerald-300 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
                          isRefused &&
                            'border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20',
                          !isOk &&
                            !isRefused &&
                            'border-border bg-background/50'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            {image ? (
                              <img
                                src={image}
                                alt={article.nom}
                                className="h-12 w-12 shrink-0 rounded-xl border border-border object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                <Package size={20} />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {article.nom}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Quantité : {article.quantite}
                              </p>

                              {article.vendeur && (
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  Vendeur :{' '}
                                  {[article.vendeur.prenom, article.vendeur.nom]
                                    .filter(Boolean)
                                    .join(' ') || '—'}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isOk ? (
                              <Badge variant="accent" size="sm">
                                <CheckCircle size={12} className="mr-1" />
                                Validé
                              </Badge>
                            ) : isRefused ? (
                              <Badge variant="danger" size="sm">
                                <X size={12} className="mr-1" />
                                Refusé
                              </Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">
                                En attente
                              </Badge>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleExpandArticle(article.id)}
                              className="rounded-lg p-1 text-muted-foreground transition hover:text-gold-500"
                              aria-label={
                                isExpanded
                                  ? 'Réduire les détails'
                                  : 'Afficher les détails'
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                                {article.specifications && (
                                  <p>
                                    <span className="text-muted-foreground">
                                      Spécifications :
                                    </span>{' '}
                                    {article.specifications}
                                  </p>
                                )}

                                {article.vendeur?.adresse_boutique && (
                                  <p>
                                    <span className="text-muted-foreground">
                                      Boutique :
                                    </span>{' '}
                                    {article.vendeur.adresse_boutique}
                                  </p>
                                )}

                                {isRefused && (
                                  <>
                                    <p className="text-red-700 dark:text-red-300">
                                      <span className="font-medium">Motif :</span>{' '}
                                      {article.motif_refus || '—'}
                                    </p>

                                    {article.photo_preuve && (
                                      <img
                                        src={article.photo_preuve}
                                        alt="Preuve de refus"
                                        className="max-h-48 rounded-xl border border-border object-cover"
                                      />
                                    )}
                                  </>
                                )}

                                {!isOk && !isRefused && (
                                  <>
                                    <div className="flex flex-wrap gap-2">
                                      <Input
                                        placeholder="Code article (6 chiffres)"
                                        value={collectCodes[article.id] || ''}
                                        onChange={(e) =>
                                          setCollectCodes((prev) => ({
                                            ...prev,
                                            [article.id]: e.target.value.replace(
                                              /\D/g,
                                              ''
                                            ),
                                          }))
                                        }
                                        maxLength={6}
                                        className="min-w-0 flex-1 font-mono"
                                      />

                                      <Button
                                        variant="accent"
                                        size="sm"
                                        onClick={() => validateArticle(article.id)}
                                        loading={validatingArticle === article.id}
                                        leftIcon={<Check size={14} />}
                                      >
                                        Valider
                                      </Button>
                                    </div>

                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => openRefuseModal(article)}
                                      leftIcon={<X size={14} />}
                                    >
                                      Refuser l’article
                                    </Button>
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {allArticlesTraited && !isDelivered && !isCancelled && (
              <Card className="border-gold-400/20 bg-card/70 shadow-gold">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck size={18} className="text-gold-500" />
                    Finaliser la livraison
                  </CardTitle>
                  <CardDescription>
                    Demande au client son code secret à 6 caractères, puis valide la remise.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <Input
                    label="Code client"
                    placeholder="A1B2C3"
                    value={clientCode}
                    onChange={(e) =>
                      setClientCode(e.target.value.toUpperCase().replace(/\s/g, ''))
                    }
                    maxLength={6}
                    className="font-mono text-xl tracking-widest"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline-gold"
                      size="sm"
                      onClick={() => setShowLivraisonPhotoModal(true)}
                      leftIcon={<Camera size={14} />}
                    >
                      Photos ({livraisonPhotos.length})
                    </Button>

                    <Button
                      variant="outline-gold"
                      size="sm"
                      onClick={() => setShowSignatureModal(true)}
                      leftIcon={<PenLine size={14} />}
                    >
                      Signature client
                    </Button>
                  </div>

                  {signatureData && (
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                        <CheckCircle size={14} className="text-emerald-500" />
                        Signature enregistrée
                      </p>

                      <img
                        src={signatureData}
                        alt="Signature client"
                        className="max-h-32 rounded-xl border border-border bg-white object-contain"
                      />

                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => setSignatureData(null)}
                        leftIcon={<X size={14} />}
                      >
                        Retirer la signature
                      </Button>
                    </div>
                  )}

                  {tentativesRestantes < MAX_CODE_ATTEMPTS && (
                    <p
                      className={cn(
                        'text-sm',
                        tentativesRestantes > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      Tentatives restantes : {tentativesRestantes}
                    </p>
                  )}

                  <Button
                    variant="luxe"
                    fullWidth
                    size="lg"
                    onClick={deliverCourse}
                    loading={actionLoading}
                    disabled={!canDeliver || clientCode.length !== 6}
                    leftIcon={<CheckCircle size={18} />}
                  >
                    Valider la remise
                  </Button>

                  {!allArticlesTraited && (
                    <p className="text-sm text-muted-foreground">
                      Tous les articles doivent être validés ou refusés avant de
                      finaliser la livraison.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {isDelivered && (
              <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle size={22} />
                    <div>
                      <p className="font-bold">Livraison validée</p>
                      <p className="text-sm opacity-90">
                        {formatDateTime(course.livraison?.delivered_at)}
                      </p>
                    </div>
                  </div>

                  {(course.livraison?.photos_livraison?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                        Photos de livraison
                      </p>

                      <div className="grid gap-2 sm:grid-cols-3">
                        {course.livraison?.photos_livraison?.map((url, idx) => (
                          <img
                            key={`${url}-${idx}`}
                            src={url}
                            alt={`Preuve livraison ${idx + 1}`}
                            className="h-32 w-full rounded-xl border border-emerald-200 object-cover dark:border-emerald-900/40"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {course.livraison?.signature_client && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                        Signature client
                      </p>

                      <img
                        src={course.livraison.signature_client}
                        alt="Signature client"
                        className="max-h-32 rounded-xl border border-emerald-200 bg-white object-contain dark:border-emerald-900/40"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User size={18} className="text-gold-500" />
                  Client
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <InfoRow
                  label="Nom"
                  value={clientFullName || '—'}
                  icon={<User size={14} />}
                />

                <InfoRow
                  label="Téléphone"
                  value={course.client.telephone || '—'}
                  icon={<Phone size={14} />}
                />

                <InfoRow
                  label="Commune"
                  value={course.commune || '—'}
                  icon={<MapPin size={14} />}
                />

                <InfoRow
                  label="Type"
                  value={
                    course.type_livraison === 'point_retrait'
                      ? 'Point retrait'
                      : 'Domicile'
                  }
                  icon={<Truck size={14} />}
                />

                {course.point_retrait_nom && (
                  <InfoRow
                    label="Point retrait"
                    value={course.point_retrait_nom}
                    icon={<Package size={14} />}
                  />
                )}

                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-xs text-muted-foreground">Adresse</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {course.adresse || '—'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {course.client.telephone && (
                    <>
                      <a href={telHref(course.client.telephone)}>
                        <Button variant="outline-gold" size="sm" leftIcon={<Phone size={14} />}>
                          Appeler
                        </Button>
                      </a>

                      {clientWaHref && (
                        <a href={clientWaHref} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline-gold" size="sm" leftIcon={<MessageCircle size={14} />}>
                            WhatsApp
                          </Button>
                        </a>
                      )}
                    </>
                  )}

                  {clientAddressUrl && (
                    <a href={clientAddressUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" leftIcon={<Navigation size={14} />}>
                        Maps
                      </Button>
                    </a>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(course.numero, 'numero')}
                    leftIcon={
                      copiedKey === 'numero' ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} />
                      )
                    }
                  >
                    Copier n°
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck size={18} className="text-gold-500" />
                  Course
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <InfoRow
                  label="Statut"
                  value={
                    <Badge variant={statusVariant(normalizedStatus)} size="sm">
                      {statusLabel(normalizedStatus)}
                    </Badge>
                  }
                />

                <InfoRow
                  label="Articles"
                  value={`${articles.length} au total`}
                  icon={<Package size={14} />}
                />

                <InfoRow
                  label="Validés"
                  value={`${acceptedArticles.length}`}
                  icon={<CheckCircle size={14} />}
                />

                <InfoRow
                  label="Refusés"
                  value={`${refusedArticles.length}`}
                  icon={<XCircle size={14} />}
                />

                <InfoRow
                  label="Acceptée le"
                  value={formatDateTime(course.livraison?.created_at)}
                  icon={<Activity size={14} />}
                />

                {course.livraison?.geoloc && (
                  <InfoRow
                    label="Géoloc finale"
                    value={`${course.livraison.geoloc.latitude.toFixed(5)}, ${course.livraison.geoloc.longitude.toFixed(5)}`}
                    icon={<MapPin size={14} />}
                  />
                )}
              </CardContent>
            </Card>

            {sellers.length > 0 && (
              <Card className="border-gold-400/20 bg-card/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package size={18} className="text-gold-500" />
                    Vendeurs
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 text-sm">
                  {sellers.map((seller, index) => {
                    const sellerUrl =
                      mapsCoordsUrl(seller.latitude, seller.longitude) ||
                      mapsAddressUrl([seller.adresse_boutique])

                    return (
                      <div
                        key={`${seller.telephone || seller.adresse_boutique || index}`}
                        className="rounded-2xl border border-border bg-background/50 p-3"
                      >
                        <p className="font-semibold text-foreground">
                          {[seller.prenom, seller.nom].filter(Boolean).join(' ') ||
                            'Vendeur'}
                        </p>

                        {seller.adresse_boutique && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {seller.adresse_boutique}
                          </p>
                        )}

                        <p className="mt-1 text-xs text-muted-foreground">
                          Articles : {Array.from(new Set(seller.articleNames)).join(', ')}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {seller.telephone && (
                            <a href={telHref(seller.telephone)}>
                              <Button variant="ghost" size="sm" leftIcon={<Phone size={14} />}>
                                Appeler
                              </Button>
                            </a>
                          )}

                          {sellerUrl && (
                            <a href={sellerUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" leftIcon={<Navigation size={14} />}>
                                Maps
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            <Card className="border-gold-400/20 bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle size={18} className="text-gold-500" />
                  Actions rapides
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2">
                <Button
                  variant="outline-gold"
                  size="sm"
                  fullWidth
                  onClick={() => setShowLivraisonPhotoModal(true)}
                  leftIcon={<Camera size={14} />}
                >
                  Ajouter des photos
                </Button>

                <Button
                  variant="outline-gold"
                  size="sm"
                  fullWidth
                  onClick={() => setShowSignatureModal(true)}
                  leftIcon={<PenLine size={14} />}
                >
                  Signature client
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  onClick={() => setShowSignalModal(true)}
                  leftIcon={<AlertTriangle size={14} />}
                >
                  Signaler un incident
                </Button>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </Container>

      {/* Refuse article modal */}
      <Modal
        isOpen={Boolean(refuseModal)}
        onClose={closeRefuseModal}
        title="Refuser un article"
        description={refuseModal ? `Article : ${refuseModal.articleNom}` : ''}
        size="md"
        accent="danger"
      >
        {refuseModal && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Motif du refus *
              </label>

              <textarea
                value={refuseMotif}
                onChange={(e) => setRefuseMotif(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Explique précisément pourquoi tu refuses cet article..."
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
              />

              <p className="mt-1 text-right text-xs text-muted-foreground">
                {refuseMotif.length}/500
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                Preuve photo (optionnelle)
              </p>

              <input
                ref={refuseFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleRefusePhotoChange}
              />

              {refusePhotoPreview ? (
                <div className="space-y-2">
                  <img
                    src={refusePhotoPreview}
                    alt="Preuve de refus"
                    className="max-h-48 w-full rounded-xl border border-border object-cover"
                  />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      try {
                        URL.revokeObjectURL(refusePhotoPreview)
                      } catch {}

                      setRefusePhoto(null)
                      setRefusePhotoPreview(null)
                    }}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Retirer la photo
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline-gold"
                  size="sm"
                  onClick={() => refuseFileRef.current?.click()}
                  leftIcon={<Upload size={14} />}
                >
                  Choisir une photo
                </Button>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={closeRefuseModal}>
                Annuler
              </Button>

              <Button
                variant="danger"
                onClick={refuseArticle}
                loading={actionLoading}
                leftIcon={<X size={14} />}
              >
                Confirmer le refus
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Livraison photos modal */}
      <Modal
        isOpen={showLivraisonPhotoModal}
        onClose={() => setShowLivraisonPhotoModal(false)}
        title="Photos de livraison"
        description="Ajoute des preuves visuelles avant de valider la remise."
        size="lg"
        accent="gold"
      >
        <div className="space-y-4">
          <input
            ref={livraisonFileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={addLivraisonPhotos}
          />

          <Button
            variant="outline-gold"
            onClick={() => livraisonFileRef.current?.click()}
            leftIcon={<Upload size={14} />}
          >
            Ajouter des photos
          </Button>

          {livraisonPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              <ImageOff size={32} />
              <p>Aucune photo ajoutée.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {livraisonPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-background/50"
                >
                  <img
                    src={photo.preview}
                    alt="Photo de livraison"
                    className="h-40 w-full object-cover"
                  />

                  <button
                    type="button"
                    onClick={() => removeLivraisonPhoto(photo.id)}
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-600 shadow-md transition hover:bg-red-50 dark:bg-neutral-900/90 dark:text-red-400"
                    aria-label="Supprimer la photo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between gap-3 pt-2">
            {livraisonPhotos.length > 0 && (
              <Button
                variant="ghost"
                onClick={clearLivraisonPhotos}
                leftIcon={<Trash2 size={14} />}
              >
                Tout retirer
              </Button>
            )}

            <Button
              variant="luxe"
              onClick={() => setShowLivraisonPhotoModal(false)}
            >
              Fermer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Signature modal */}
      <Modal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        title="Signature client"
        description="Fais signer le client sur l’écran pour confirmer la réception."
        size="md"
        accent="gold"
      >
        <div className="space-y-4">
          <SignaturePad onChange={setSignatureData} />

          {signatureData && (
            <div className="rounded-2xl border border-border bg-background/50 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle size={14} className="text-emerald-500" />
                Signature enregistrée
              </p>

              <img
                src={signatureData}
                alt="Signature client"
                className="max-h-32 w-full rounded-xl border border-border bg-white object-contain"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="luxe"
              onClick={() => setShowSignatureModal(false)}
              leftIcon={<Check size={14} />}
            >
              Terminer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Signal modal */}
      <Modal
        isOpen={showSignalModal}
        onClose={closeSignalModal}
        title="Signaler un incident"
        description="Transmets une information importante au dispatch."
        size="md"
        accent="danger"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Type d’incident
            </label>

            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value)}
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {Object.entries(SIGNAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Message *
            </label>

            <textarea
              value={signalMessage}
              onChange={(e) => setSignalMessage(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Décris l’incident de façon claire..."
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            <p className="mt-1 text-right text-xs text-muted-foreground">
              {signalMessage.length}/500
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              Photo (optionnelle)
            </p>

            <input
              ref={signalFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleSignalPhotoChange}
            />

            {signalPhotoPreview ? (
              <div className="space-y-2">
                <img
                  src={signalPhotoPreview}
                  alt="Preuve incident"
                  className="max-h-48 w-full rounded-xl border border-border object-cover"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      URL.revokeObjectURL(signalPhotoPreview)
                    } catch {}

                    setSignalPhoto(null)
                    setSignalPhotoPreview(null)
                  }}
                  leftIcon={<Trash2 size={14} />}
                >
                  Retirer la photo
                </Button>
              </div>
            ) : (
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => signalFileRef.current?.click()}
                leftIcon={<Upload size={14} />}
              >
                Choisir une photo
              </Button>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeSignalModal}>
              Annuler
            </Button>

            <Button
              variant="danger"
              onClick={signalIncident}
              loading={actionLoading}
              leftIcon={<AlertTriangle size={14} />}
            >
              Envoyer le signalement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}