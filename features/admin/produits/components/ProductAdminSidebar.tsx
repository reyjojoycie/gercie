// features/admin/produits/components/ProductAdminSidebar.tsx
'use client'

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  Loader2,
  Package,
  Percent,
  Save,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { formatUsd, formatCdf } from '../lib/product-utils'
import type { FormSummary, ProductDetail } from '../types'
import { PRODUCT_AUTO_SAVE_INTERVAL_MS } from '../lib/product-utils'

export default function ProductAdminSidebar({
  summary,
  product,
  rate,
  rateLoading,
  dirty,
  draftExists,
  draftRestored,
  autoSave,
  onToggleAutoSave,
  lastSavedAt,
  initialValues,
}: {
  summary: FormSummary
  product: ProductDetail | null
  rate: number | null
  rateLoading: boolean
  dirty: boolean
  draftExists: boolean
  draftRestored: boolean
  autoSave: boolean
  onToggleAutoSave: () => void
  lastSavedAt: string | null
  initialValues?: any
}) {
  return (
    <div className="sticky top-24 space-y-5">
      {/* Résumé en direct */}
      <Card className="overflow-hidden border-gold-400/20 bg-card/70 shadow-gold backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye size={18} className="text-gold-500" />
            Résumé en direct
          </CardTitle>
          <CardDescription>
            Aperçu des informations avant enregistrement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Nom du produit</p>
            <p className="mt-1 line-clamp-2 font-semibold text-foreground">
              {summary.nom || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Slug</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">
              {summary.slug || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Catégorie</p>
            <p className="mt-1 text-foreground">{summary.categorie || '—'}</p>
          </div>

          {/* Prix */}
          <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-3">
            <p className="text-xs text-muted-foreground">Prix principal</p>
            <p className="mt-1 text-xl font-extrabold text-gold-600">
              {formatUsd(summary.prixUsd)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ≈ {formatCdf(summary.prixCdf)}
            </p>
            {rateLoading && summary.prixUsd > 0 && summary.prixCdf <= 0 && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-600">
                <Loader2 size={12} className="animate-spin" />
                Taux CDF en cours de chargement...
              </p>
            )}
            {!rateLoading && !rate && summary.prixUsd > 0 && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-red-500">
                <AlertTriangle size={12} />
                Taux indisponible : le CDF ne peut pas être calculé.
              </p>
            )}
          </div>

          {/* Grille stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">Stock</p>
              <p className="mt-1 font-semibold text-foreground">
                {summary.stock ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">Remise</p>
              <p className="mt-1 font-semibold text-foreground">
                {summary.remisePercent > 0
                  ? `${summary.remisePercent}%`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">Images</p>
              <p className="mt-1 font-semibold text-foreground">
                {summary.imagesCount}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <p className="text-xs text-muted-foreground">Variantes</p>
              <p className="mt-1 font-semibold text-foreground">
                {summary.variantesCount}
              </p>
            </div>
          </div>

          {/* Statut */}
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <p className="text-xs text-muted-foreground">Statut</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={summary.estActif ? 'accent' : 'neutral'}
                size="sm"
              >
                {summary.estActif ? 'Actif' : 'Inactif'}
              </Badge>
              {dirty && (
                <Badge variant="warm" size="sm">
                  <Clock size={12} className="mr-1" />
                  Non enregistré
                </Badge>
              )}
              {draftRestored && (
                <Badge variant="gold" size="sm">
                  <Save size={12} className="mr-1" />
                  Brouillon
                </Badge>
              )}
            </div>
          </div>

          {/* Compteurs */}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <p>Description</p>
              <p className="mt-1 font-medium text-foreground">
                {summary.descriptionLength} car.
              </p>
            </div>
            <div>
              <p>Meta title</p>
              <p className="mt-1 font-medium text-foreground">
                {summary.metaTitleLength}/120
              </p>
            </div>
            <div>
              <p>Meta description</p>
              <p className="mt-1 font-medium text-foreground">
                {summary.metaDescriptionLength}/180
              </p>
            </div>
            <div>
              <p>Ventes</p>
              <p className="mt-1 font-medium text-foreground">
                {product?.total_ventes ?? 0}
              </p>
            </div>
          </div>

          {/* Auto-save */}
          <div className="space-y-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={onToggleAutoSave}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3 text-left transition hover:border-gold-400/40 focus:outline-none focus:ring-2 focus:ring-gold-500"
              aria-pressed={autoSave}
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Sauvegarde auto du brouillon
                </p>
                <p className="text-xs text-muted-foreground">
                  Toutes les {PRODUCT_AUTO_SAVE_INTERVAL_MS / 1000} secondes si
                  modifications.
                </p>
              </div>
              <span
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                  autoSave ? 'bg-gold-500' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    autoSave ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </span>
            </button>
            {lastSavedAt && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 size={12} className="text-emerald-500" />
                Dernière sauvegarde locale :{' '}
                {new Date(lastSavedAt).toLocaleTimeString('fr-FR')}
              </p>
            )}
            {draftExists && !draftRestored && (
              <p className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                <Save size={12} />
                Un brouillon local existe pour ce produit.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Règles prix */}
      <Card variant="glass" className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck size={18} className="text-gold-500" />
            Règles prix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              Prix principal :
            </span>{' '}
            USD.
          </p>
          <p>
            <span className="font-medium text-foreground">Prix CDF :</span>{' '}
            calculé automatiquement si le taux est disponible.
          </p>
          <p>
            <span className="font-medium text-foreground">Wallet :</span>{' '}
            supprimé. Toute clé liée au portefeuille est retirée du payload
            avant enregistrement.
          </p>
          <div className="rounded-xl border border-gold-400/20 bg-gold-500/5 p-3 text-xs">
            <p className="font-medium text-gold-700 dark:text-gold-300">
              Astuce
            </p>
            <p className="mt-1">
              Utilise Ctrl+S / Cmd+S pour enregistrer rapidement. Tu peux
              enregistrer depuis n&apos;importe quelle étape.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Livraison */}
      <Card variant="glass" className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck size={18} className="text-gold-500" />
            Livraison
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Délai :{' '}
            <span className="font-medium text-foreground">
              {initialValues?.delay_livraison || '24h - 72h'}
            </span>
          </p>
          <p>
            Domicile :{' '}
            <span className="font-medium text-foreground">
              {initialValues?.livraison_domicile
                ? formatCdf(Number(initialValues.livraison_domicile))
                : 'Sur devis'}
            </span>
          </p>
          <p>
            Express :{' '}
            <span className="font-medium text-foreground">
              {initialValues?.express_gratuit
                ? 'Gratuit'
                : initialValues?.livraison_express
                ? formatCdf(Number(initialValues.livraison_express))
                : 'Non spécifié'}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}