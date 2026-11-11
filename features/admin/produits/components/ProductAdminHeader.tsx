// features/admin/produits/components/ProductAdminHeader.tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Copy,
  Eye,
  History,
  Loader2,
  Package,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { formatCdf } from '../lib/product-utils'
import { PRODUCT_STEPS } from '../constants/steps'
import type { ProductDetail, ProductAdminMode } from '../types'

export default function ProductAdminHeader({
  mode,
  product,
  rate,
  rateLoading,
  dirty,
  draftRestored,
  activeStep,
  submitting,
  deletePending,
  duplicatePending,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  mode: ProductAdminMode
  product: ProductDetail | null
  rate: number | null
  rateLoading: boolean
  dirty: boolean
  draftRestored: boolean
  activeStep: number
  submitting: boolean
  deletePending: boolean
  duplicatePending: boolean
  onPreview: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const isEdit = mode === 'edit'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
    >
      {/* Gauche : titre + badges */}
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold text-foreground font-serif md:text-4xl">
          {isEdit ? (
            <Settings2 size={30} className="text-gold-500" />
          ) : (
            <Sparkles size={30} className="text-gold-500" />
          )}
          {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          USD est le prix principal. Le prix CDF est calculé automatiquement
          via le taux de change. Navigue entre les sections pour tout modifier.
        </p>

        {/* Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isEdit && product && (
            <>
              <Badge
                variant={product.est_actif === false ? 'neutral' : 'accent'}
                size="sm"
              >
                {product.est_actif === false ? 'Inactif' : 'Actif'}
              </Badge>
              <Badge variant="neutral" size="sm">
                ID : {product.id.slice(0, 8)}...
              </Badge>
            </>
          )}

          <Badge variant="gold" size="sm">
            Étape {activeStep + 1}/{PRODUCT_STEPS.length} •{' '}
            {PRODUCT_STEPS[activeStep].label}
          </Badge>

          {isEdit && product?.created_at && (
            <Badge variant="neutral" size="sm">
              <History size={12} className="mr-1" />
              Créé le{' '}
              {new Date(product.created_at).toLocaleDateString('fr-FR')}
            </Badge>
          )}
          {isEdit && product?.updated_at && (
            <Badge variant="neutral" size="sm">
              <Clock size={12} className="mr-1" />
              Mis à jour le{' '}
              {new Date(product.updated_at).toLocaleDateString('fr-FR')}
            </Badge>
          )}

          {dirty && (
            <Badge variant="warm" size="sm">
              <AlertTriangle size={12} className="mr-1" />
              Modifications non enregistrées
            </Badge>
          )}
          {draftRestored && (
            <Badge variant="gold" size="sm">
              <Package size={12} className="mr-1" />
              Brouillon chargé
            </Badge>
          )}

          {rateLoading ? (
            <Badge variant="warm" size="sm">
              <Loader2 size={12} className="mr-1 animate-spin" />
              Taux en chargement
            </Badge>
          ) : rate ? (
            <Badge variant="accent" size="sm">
              1 USD ≈ {formatCdf(Number(rate))}
            </Badge>
          ) : (
            <Badge variant="danger" size="sm">
              <AlertTriangle size={12} className="mr-1" />
              Taux indisponible
            </Badge>
          )}
        </div>
      </div>

      {/* Droite : actions */}
      <div className="flex flex-wrap items-center gap-2">
        {isEdit ? (
          <Link href="/admin/produits">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />}>
              Retour
            </Button>
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            leftIcon={<ArrowLeft size={14} />}
          >
            Annuler
          </Button>
        )}

        <Tooltip content="Aperçu avant enregistrement">
          <Button
            variant="outline-gold"
            size="sm"
            onClick={onPreview}
            disabled={submitting}
            leftIcon={<Eye size={14} />}
          >
            Aperçu
          </Button>
        </Tooltip>

        {isEdit && (
          <>
            <Tooltip content="Dupliquer ce produit">
              <Button
                variant="outline"
                size="sm"
                onClick={onDuplicate}
                disabled={submitting || duplicatePending}
                leftIcon={
                  duplicatePending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Copy size={14} />
                  )
                }
              >
                Dupliquer
              </Button>
            </Tooltip>
            <Tooltip content="Supprimer ce produit">
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                onClick={onDelete}
                disabled={submitting || deletePending}
                leftIcon={<Trash2 size={14} />}
              >
                Supprimer
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </motion.div>
  )
}