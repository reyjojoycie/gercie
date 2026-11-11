// features/admin/produits/steps/PricingStep.tsx
'use client'

import { motion } from 'framer-motion'
import {
  DollarSign,
  Percent,
  Sparkles,
  X,
  AlertCircle,
  Zap,
} from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatUsd, formatCdf, positiveNum } from '../lib/product-utils'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

export default function PricingStep() {
  const { form, rate } = useStepContext()
  const {
    register,
    errors,
    watch,
    priceUsd,
    priceCdf,
    originalUsd,
    setPriceUsd,
    setPriceCdf,
    setOriginalUsd,
    priceSuggestion,
    priceSuggestionLoading,
    handlePriceSuggestion,
    applyPriceSuggestion,
    setPriceSuggestion,
    productId,
  } = form

  const currentPriceUsd = positiveNum(priceUsd)
  const currentPriceCdf = positiveNum(priceCdf)

  return (
    <motion.div
      key="pricing"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Prix principal USD */}
      <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <DollarSign size={16} className="text-gold-500" />
          Prix principal : USD
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Prix USD *
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceUsd}
              onChange={(e) => {
                const value = e.target.value
                setPriceUsd(value)
                const n = Number(value)
                if (Number.isFinite(n) && n > 0 && rate) {
                  setPriceCdf(String(Math.round(n * rate)))
                }
              }}
              className={inputBase}
              placeholder="Ex : 49.99"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Prix CDF
            </span>
            <input
              type="number"
              step="1"
              min="0"
              value={priceCdf}
              onChange={(e) => {
                const value = e.target.value
                setPriceCdf(value)
                const n = Number(value)
                if (Number.isFinite(n) && n > 0 && rate) {
                  setPriceUsd((n / rate).toFixed(2))
                }
              }}
              className={inputBase}
              placeholder="Calculé automatiquement"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {rate ? (
            <Badge variant="accent" size="sm">
              1 USD ≈ {formatCdf(Number(rate))}
            </Badge>
          ) : (
            <Badge variant="danger" size="sm">
              <AlertCircle size={12} className="mr-1" />
              Taux indisponible
            </Badge>
          )}
          {currentPriceUsd && currentPriceCdf && (
            <span className="text-muted-foreground">
              {formatUsd(currentPriceUsd)} ≈ {formatCdf(currentPriceCdf)}
            </span>
          )}
        </div>
      </div>

      {/* Prix barré + Remise */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Prix barré USD (optionnel)
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={originalUsd}
            onChange={(e) => setOriginalUsd(e.target.value)}
            className={inputBase}
            placeholder="Ex : 59.99"
          />
          <span className="text-xs text-muted-foreground">
            Si vide, calculé depuis la remise.
          </span>
        </label>
        <Input
          variant="glass"
          label="Remise (%)"
          type="number"
          step="0.1"
          min="0"
          max="90"
          {...register('remise_percent', { valueAsNumber: true })}
          placeholder="Ex : 15"
          leftIcon={<Percent size={14} />}
        />
      </div>

      {/* Suggestion IA */}
      {priceSuggestion && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
          <Sparkles size={16} className="text-purple-500" />
          <div>
            <p className="font-medium">Suggestion IA</p>
            <p className="text-xs opacity-90">
              {priceSuggestion.reasoning || 'Analyse du marché'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-semibold">
              {formatUsd(
                positiveNum(priceSuggestion.suggestedPriceUsd) ??
                  (positiveNum(priceSuggestion.suggestedPrice) && rate
                    ? priceSuggestion.suggestedPrice / rate
                    : null)
              )}
            </span>
            <Button
              type="button"
              size="sm"
              variant="accent"
              onClick={applyPriceSuggestion}
            >
              Appliquer
            </Button>
            <button
              type="button"
              onClick={() => setPriceSuggestion(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {productId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handlePriceSuggestion}
          loading={priceSuggestionLoading}
          leftIcon={<Zap size={14} className="text-purple-500" />}
        >
          Obtenir une suggestion de prix IA
        </Button>
      )}

      {/* Stock + Limite */}
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          variant="glass"
          label="Stock *"
          type="number"
          {...register('stock', { valueAsNumber: true })}
          error={errors.stock?.message}
        />
        <Input
          variant="glass"
          label="Limite par client"
          type="number"
          {...register('limit_per_client', { valueAsNumber: true })}
          placeholder="Optionnel"
        />
      </div>

      {/* Négociable / Vedette */}
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register('negociable')}
            className="rounded text-gold-500 focus:ring-gold-500"
          />
          <span>Produit négociable</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            {...register('featured')}
            className="rounded text-gold-500 focus:ring-gold-500"
          />
          <span>Produit en vedette</span>
        </label>
      </div>
    </motion.div>
  )
}