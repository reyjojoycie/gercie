'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BADGE_DEFINITIONS, BADGE_CATEGORIES, BadgeCategory } from '@/components/badges/badgeConfig'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { Badge } from '@/components/ui/Badge'

interface AdminBadgeSelectorProps {
  selected: string[]
  onChange: (badges: string[]) => void
  max?: number
}

export default function AdminBadgeSelector({ selected, onChange, max = 3 }: AdminBadgeSelectorProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | 'all'>('all')

  const filtered = useMemo(() => {
    let list = BADGE_DEFINITIONS
    if (activeCategory !== 'all') list = list.filter(b => b.category === activeCategory)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(b => b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
    }
    return list
  }, [activeCategory, search])

  const toggleBadge = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else if (selected.length < max) {
      onChange([...selected, id])
    }
  }

  const selectedDefs = BADGE_DEFINITIONS.filter(d => selected.includes(d.id))

  return (
    <div className="space-y-4">
      {/* Badges sélectionnés */}
      <div className="flex flex-wrap gap-2 min-h-[2.5rem] items-center p-3 bg-card border border-border rounded-xl">
        <AnimatePresence>
          {selectedDefs.map(def => (
            <motion.span
              key={def.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
            >
              <Badge
                variant="custom"
                size="sm"
                customColors={def.color}
                leftIcon={def.icon}
                onClose={() => toggleBadge(def.id)}
              >
                {def.label}
              </Badge>
            </motion.span>
          ))}
        </AnimatePresence>
        {selected.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun badge sélectionné (max {max})</p>
        )}
        {selected.length >= max && (
          <p className="text-xs text-amber-600 dark:text-amber-400 ml-2">Maximum {max} badges atteint</p>
        )}
      </div>

      {/* Recherche et filtres */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un badge..."
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/50"
          />
        </div>
        <select
          value={activeCategory}
          onChange={e => setActiveCategory(e.target.value as BadgeCategory | 'all')}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">Toutes les catégories</option>
          {BADGE_CATEGORIES.map(cat => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* Grille de badges disponibles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered.map(def => {
          const sel = selected.includes(def.id)
          return (
            <Tooltip key={def.id} content={def.description || def.label}>
              <button
                onClick={() => toggleBadge(def.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left',
                  sel
                    ? 'bg-gold-100 dark:bg-gold-900/30 border-gold-400 text-gold-800 dark:text-gold-200'
                    : 'bg-card border-border hover:border-gold-400/50 text-foreground',
                  selected.length >= max && !sel && 'opacity-50 cursor-not-allowed'
                )}
                disabled={selected.length >= max && !sel}
              >
                <span className="flex-shrink-0">{def.icon}</span>
                <span className="truncate">{def.label}</span>
                {sel && <Check size={14} className="ml-auto flex-shrink-0 text-gold-500" />}
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}