// features/admin/produits/components/ProductPreviewModal.tsx
'use client'

import { useMemo } from 'react'
import { AlertTriangle, Loader2, Percent, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  sanitizePayload,
  toImageArray,
  toStringArray,
  formatUsd,
  formatCdf,
  EMPTY_SUMMARY,
} from '../lib/product-utils'
import type { ProductDraft } from '../types'

export default function ProductPreviewModal({
  open,
  onClose,
  values,
  rate,
  saving,
  onSave,
  mode,
}: {
  open: boolean
  onClose: () => void
  values: ProductDraft | null
  rate: number | null
  saving: boolean
  onSave: () => void
  mode: 'create' | 'edit'
}) {
  const prepared = useMemo(
    () => (values ? sanitizePayload(values, rate) : null),
    [rate, values]
  )
  const summary = prepared?.summary ?? EMPTY_SUMMARY
  const images = toImageArray(values)

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Aperçu du produit"
      description={
        mode === 'edit'
          ? "Vérifie l'affichage avant d'enregistrer."
          : "Vérifie l'affichage avant publication."
      }
      size="lg"
      accent="gold"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Fermer
          </Button>
          <Button
            variant="luxe"
            onClick={onSave}
            disabled={saving || (prepared?.errors.length ?? 0) > 0}
            leftIcon={
              saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )
            }
          >
            {mode === 'edit' ? 'Enregistrer' : 'Publier maintenant'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {prepared && prepared.errors.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} />
              Points à corriger avant{' '}
              {mode === 'edit' ? 'enregistrement' : 'publication'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {prepared.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {/* Images */}
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-muted">
              {images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[0]}
                  alt={summary.nom || 'Aperçu produit'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Aucune image
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {images.slice(1, 7).map((image, idx) => (
                  <div
                    key={`${image}-${idx}`}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Infos */}
          <div className="space-y-4">
            <div>
              <Badge variant="gold" size="sm">
                {summary.categorie || 'Catégorie'}
              </Badge>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                {summary.nom || 'Nom du produit'}
              </h2>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                /produits/{summary.slug || 'slug'}
              </p>
            </div>

            <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
              <p className="text-xs text-muted-foreground">Prix principal</p>
              <p className="mt-1 text-3xl font-extrabold text-gold-600">
                {formatUsd(summary.prixUsd)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ≈ {formatCdf(summary.prixCdf)}
              </p>
              {summary.remisePercent > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600">
                  <Percent size={12} />
                  -{summary.remisePercent}%
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Stock</p>
                <p className="mt-1 font-semibold text-foreground">
                  {summary.stock ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Variantes</p>
                <p className="mt-1 font-semibold text-foreground">
                  {summary.variantesCount}
                </p>
              </div>
            </div>

            {values?.description && (
              <div>
                <p className="text-sm font-medium text-foreground">
                  Description
                </p>
                <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm text-muted-foreground">
                  {values.description}
                </p>
              </div>
            )}

            {toStringArray(values?.tags).length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {toStringArray(values?.tags).map((tag) => (
                    <Badge key={tag} variant="neutral" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}