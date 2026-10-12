// components/ProductVariants.tsx
'use client'

import React, { useMemo, useCallback, forwardRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'
import { useExchangeRate } from '@/hooks/useExchangeRate'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface Variant {
  id: string
  attributes: Record<string, string>
  stock: number
  prix_specifique?: number   // prix alternatif pour cette variante
  image?: string             // image éventuelle (couleur)
}

export interface ProductVariantsProps {
  /** Liste de toutes les variantes */
  variants: Variant[]
  /** Attributs sélectionnés (ex: { Couleur: 'Noir', Taille: 'M' }) */
  selectedAttributes: Record<string, string>
  /** Callback lorsqu'un attribut change */
  onAttributeChange: (attributeName: string, value: string) => void
  /** Prix de base du produit (hors variante) */
  basePrice?: number
  /** Afficher le prix spécifique de la variante sélectionnée */
  showPrice?: boolean
  /** Afficher le stock restant */
  showStock?: boolean
  /** Taille des boutons */
  size?: 'sm' | 'md' | 'lg'
  /** Classe additionnelle */
  className?: string
  /** Fonction pour obtenir les options disponibles pour un attribut (gère le grisage) */
  getAvailableOptions?: (attributeName: string, currentSelections: Record<string, string>) => string[]
  /** Afficher uniquement les attributs sélectionnés (mode compact) */
  compact?: boolean
  /** Nombre maximum d'options avant de basculer en select natif */
  maxOptionsBeforeSelect?: number
}

/* ========================================================================== */
/*  Utilitaires internes                                                      */
/* ========================================================================== */

// Détection automatique d'un attribut de type couleur
const isColorAttribute = (name: string): boolean => {
  const lower = name.toLowerCase()
  return lower.includes('couleur') || lower.includes('color') || lower.includes('teinte')
}

// Mapping des noms de couleurs vers des codes hex (extensible)
const colorNameToHex: Record<string, string> = {
  noir: '#000000',
  blanc: '#ffffff',
  rouge: '#dc2626',
  bleu: '#2563eb',
  vert: '#16a34a',
  jaune: '#facc15',
  orange: '#f97316',
  violet: '#8b5cf6',
  rose: '#f472b6',
  gris: '#6b7280',
  marron: '#78350f',
  or: '#f59e0b',
  argent: '#cbd5e1',
}

// Obtient la couleur d'affichage pour une option de type couleur
const getColorPreview = (option: string): string | null => {
  const lower = option.toLowerCase()
  return colorNameToHex[lower] || null
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */

export const ProductVariants = forwardRef<HTMLDivElement, ProductVariantsProps>(
  (
    {
      variants,
      selectedAttributes,
      onAttributeChange,
      basePrice,
      showPrice = true,
      showStock = true,
      size = 'md',
      className,
      getAvailableOptions,
      compact = false,
      maxOptionsBeforeSelect = 6,
    },
    ref
  ) => {
    const { rate } = useExchangeRate()

    // Extraire les noms d'attributs uniques (dans l'ordre d'apparition)
    const attributeNames = useMemo(() => {
      const names = new Set<string>()
      variants.forEach(v => Object.keys(v.attributes).forEach(k => names.add(k)))
      return Array.from(names)
    }, [variants])

    // Trouver la variante courante correspondant aux sélections
    const currentVariant = useMemo(() => {
      return variants.find(v =>
        Object.entries(selectedAttributes).every(([k, val]) => v.attributes[k] === val)
      ) || null
    }, [variants, selectedAttributes])

    // Calculer le prix final et l'économie
    const finalPrice = currentVariant?.prix_specifique ?? basePrice
    const priceDifference = basePrice ? (finalPrice ?? basePrice) - basePrice : 0

    // Gestion du clic sur une option
    const handleOptionClick = useCallback(
      (attrName: string, value: string) => {
        onAttributeChange(attrName, value)
      },
      [onAttributeChange]
    )

    // Taille des boutons
    const sizeClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base',
    }

    if (variants.length === 0) return null

    return (
      <div ref={ref} className={cn('space-y-4', className)}>
        {attributeNames.map(attrName => {
          // Récupérer toutes les valeurs possibles pour cet attribut (dédupliquées)
          const allValues = useMemo(() => {
            const vals = new Set<string>()
            variants.forEach(v => {
              if (v.attributes[attrName]) vals.add(v.attributes[attrName])
            })
            return Array.from(vals)
          }, [variants, attrName])

          // Options disponibles (tenant compte des sélections actuelles)
          const availableValues = useMemo(() => {
            if (getAvailableOptions) {
              return getAvailableOptions(attrName, selectedAttributes)
            }
            // Comportement par défaut : une option est indisponible si aucune variante ne la supporte avec les autres sélections actuelles
            return allValues.filter(val => {
              return variants.some(v => {
                const match = Object.entries(selectedAttributes).every(([k, sel]) => {
                  if (k === attrName) return true // on ignore l'attribut courant
                  return v.attributes[k] === sel
                })
                return match && v.attributes[attrName] === val
              })
            })
          }, [allValues, attrName, selectedAttributes, variants, getAvailableOptions])

          const isColor = isColorAttribute(attrName)
          const useNativeSelect = allValues.length > maxOptionsBeforeSelect

          if (compact && allValues.length <= 1) return null

          return (
            <div key={attrName}>
              <p className="text-sm font-medium text-foreground mb-2 capitalize">
                {attrName}
                {selectedAttributes[attrName] && (
                  <span className="text-gold-600 ml-1">: {selectedAttributes[attrName]}</span>
                )}
              </p>

              {useNativeSelect ? (
                <select
                  value={selectedAttributes[attrName] || ''}
                  onChange={e => handleOptionClick(attrName, e.target.value)}
                  className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full sm:w-auto"
                >
                  <option value="">Choisir {attrName}</option>
                  {allValues.map(val => (
                    <option key={val} value={val} disabled={!availableValues.includes(val)}>
                      {val}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allValues.map(val => {
                    const available = availableValues.includes(val)
                    const selected = selectedAttributes[attrName] === val
                    const colorHex = isColor ? getColorPreview(val) : null

                    // Prix spécifique si cette option correspond à une variante avec prix modifié
                    const variantWithAttr = variants.find(v =>
                      v.attributes[attrName] === val &&
                      Object.entries(selectedAttributes).every(([k, sel]) => k === attrName || v.attributes[k] === sel)
                    )
                    const attrPrice = variantWithAttr?.prix_specifique

                    return (
                      <Tooltip
                        key={val}
                        content={
                          !available
                            ? 'Indisponible'
                            : attrPrice && showPrice
                              ? `${attrPrice.toLocaleString()} FC`
                              : ''
                        }
                        position="top"
                        delay={300}
                      >
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          whileHover={{ scale: available ? 1.05 : 1 }}
                          disabled={!available}
                          onClick={() => handleOptionClick(attrName, val)}
                          className={cn(
                            'relative inline-flex items-center gap-2 rounded-full border-2 font-medium transition-all duration-200',
                            sizeClasses[size],
                            selected
                              ? 'border-gold-400 bg-gold-400/10 text-gold-700 dark:text-gold-300 shadow-gold'
                              : available
                                ? 'border-border text-foreground hover:border-gold-400 hover:bg-gold-400/5'
                                : 'border-transparent bg-neutral-100 dark:bg-midnight-700 text-muted-foreground opacity-50 cursor-not-allowed',
                          )}
                          aria-pressed={selected}
                          aria-label={`${attrName}: ${val}${!available ? ' (indisponible)' : ''}`}
                        >
                          {isColor && colorHex && (
                            <span
                              className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: colorHex }}
                            />
                          )}
                          <span>{val}</span>
                          {selected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-gold-500 rounded-full flex items-center justify-center"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            </motion.span>
                          )}
                        </motion.button>
                      </Tooltip>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Affichage du prix et du stock de la variante sélectionnée */}
        <AnimatePresence>
          {currentVariant && showPrice && finalPrice !== undefined && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex flex-wrap items-center gap-3 pt-2 border-t border-border"
            >
              <div>
                <span className="text-2xl font-bold text-foreground">
                  {finalPrice.toLocaleString()} FC
                </span>
                {rate && (
                  <span className="text-sm text-muted-foreground ml-1">
                    ≈ ${(finalPrice / rate).toFixed(2)} USD
                  </span>
                )}
              </div>
              {priceDifference !== 0 && (
                <Badge variant={priceDifference < 0 ? 'success' : 'danger'} size="sm">
                  {priceDifference < 0 ? '-' : '+'}{Math.abs(priceDifference).toLocaleString()} FC
                </Badge>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {showStock && currentVariant && (
          <p className="text-sm text-muted-foreground">
            {currentVariant.stock > 0 ? (
              currentVariant.stock <= 5 ? (
                <span className="text-amber-500">Plus que {currentVariant.stock} en stock</span>
              ) : (
                <span className="text-green-500">En stock</span>
              )
            ) : (
              <span className="text-red-500">Rupture de stock</span>
            )}
          </p>
        )}
      </div>
    )
  }
)

ProductVariants.displayName = 'ProductVariants'