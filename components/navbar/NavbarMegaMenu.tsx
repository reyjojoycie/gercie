'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { getCategoryIconComponent } from '@/lib/categories'
import {
  Menu,
  ChevronDown,
  Percent,
  TrendingUp,
  Gift,
  Sparkles,
} from 'lucide-react'
import React from 'react'

/* ------------------------------------------------------------------ */
/*  Types récursifs                                                    */
/* ------------------------------------------------------------------ */
export interface MegaMenuCategory {
  id: string
  name: string
  icon: React.ReactNode
  href: string
  description?: string
  badge?: string
  badgeVariant?: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral'
  children?: MegaMenuCategory[]
  featured?: boolean
}

export interface NavbarMegaMenuProps {
  categories: MegaMenuCategory[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onLinkClick?: () => void
  columns?: 3 | 4 | 5
  className?: string
  label?: string
  compact?: boolean
  hoverDelay?: number
}

/* ------------------------------------------------------------------ */
/*  Sous‑composant récursif pour les sous‑catégories                    */
/* ------------------------------------------------------------------ */
function SubCategoryList({
  items,
  depth,
  onLinkClick,
}: {
  items: MegaMenuCategory[]
  depth: number
  onLinkClick: () => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (!items || items.length === 0) return null

  return (
    <>
      {items.map((item) => {
        const hasChildren = item.children && item.children.length > 0
        const Icon = getCategoryIconComponent(item.icon?.toString())

        return (
          <div
            key={item.id}
            className={cn('relative', depth > 0 ? '' : '')}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <Link
              href={item.href}
              onClick={onLinkClick}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors',
                'text-neutral-600 dark:text-neutral-400',
                'hover:bg-gold-400/10 hover:text-gold-600 dark:hover:text-gold-400',
                hoveredId === item.id && 'bg-gold-400/10 text-gold-600 dark:text-gold-400'
              )}
            >
              <Icon size={12} className="text-gold-500/60 flex-shrink-0" />
              <span className="flex-1 truncate">{item.name}</span>
              {item.badge && (
                <Badge variant={item.badgeVariant || 'gold'} size="sm" className="text-[10px] px-1.5 py-0">
                  {item.badge}
                </Badge>
              )}
              {hasChildren && (
                <ChevronDown size={12} className="rotate-[-90deg] text-neutral-400" />
              )}
            </Link>

            {/* Sous‑niveau (type / détail) */}
            {hasChildren && hoveredId === item.id && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-full top-0 w-48 bg-white/95 dark:bg-midnight-800/95 backdrop-blur-xl rounded-xl shadow-strong border border-gold-400/20 p-2 z-10"
                >
                  <SubCategoryList
                    items={item.children!}
                    depth={depth + 1}
                    onLinkClick={onLinkClick}
                  />
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ================================================================== */
/*  Composant principal NavbarMegaMenu                                   */
/* ================================================================== */
export function NavbarMegaMenu({
  categories = [],
  open: controlledOpen,
  onOpenChange,
  onLinkClick,
  columns = 4,
  className,
  label = 'Catalogue',
  compact = false,
  hoverDelay = 200,
}: NavbarMegaMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

  const [activeMainIndex, setActiveMainIndex] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const openMenu = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      if (controlledOpen !== undefined) onOpenChange?.(true)
      else setInternalOpen(true)
    }, 80)
  }, [controlledOpen, onOpenChange])

  const closeMenu = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      if (controlledOpen !== undefined) onOpenChange?.(false)
      else setInternalOpen(false)
      setActiveMainIndex(null)
    }, hoverDelay)
  }, [controlledOpen, onOpenChange, hoverDelay])

  const toggleMenu = useCallback(() => {
    if (isOpen) closeMenu()
    else openMenu()
  }, [isOpen, openMenu, closeMenu])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeMenu])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const handleLinkClick = () => {
    if (controlledOpen !== undefined) onOpenChange?.(false)
    else setInternalOpen(false)
    setActiveMainIndex(null)
    onLinkClick?.()
  }

  return (
    <div
      ref={containerRef}
      className={cn('hidden lg:flex items-center relative', className)}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      {/* Bouton déclencheur */}
      <button
        onClick={toggleMenu}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
          isOpen
            ? 'bg-gold-400/10 text-gold-600 dark:text-gold-400'
            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-midnight-700/40',
          compact && 'px-2'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Menu size={18} className={cn(isOpen && 'text-gold-500')} />
        {!compact && (
          <>
            <span className="hidden xl:inline">{label}</span>
            <ChevronDown
              size={14}
              className={cn(
                'transition-transform duration-300',
                isOpen && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {/* Panneau principal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'absolute top-full left-0 mt-2 rounded-2xl shadow-strong border border-gold-400/20 p-6 z-30',
              'bg-white/95 dark:bg-midnight-800/95 backdrop-blur-xl',
              'w-[960px]'
            )}
          >
            <div className="grid grid-cols-4 gap-4">
              {/* Colonne des catégories principales */}
              <div className="space-y-1">
                {categories.map((mainCat, idx) => {
                  const MainIcon = getCategoryIconComponent(mainCat.icon?.toString())
                  return (
                    <div
                      key={mainCat.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                        'text-neutral-700 dark:text-neutral-300',
                        activeMainIndex === idx
                          ? 'bg-gold-400/10 text-gold-600 dark:text-gold-400'
                          : 'hover:bg-gold-400/5'
                      )}
                      onMouseEnter={() => setActiveMainIndex(idx)}
                    >
                      <MainIcon size={16} className="text-gold-500 flex-shrink-0" />
                      <span className="flex-1 font-medium truncate">{mainCat.name}</span>
                      {mainCat.children && mainCat.children.length > 0 && (
                        <ChevronDown size={14} className="rotate-[-90deg] text-neutral-400" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Zone des sous‑catégories / types / détails */}
              <div className="col-span-3">
                {activeMainIndex !== null && categories[activeMainIndex]?.children && (
                  <SubCategoryList
                    items={categories[activeMainIndex].children!}
                    depth={0}
                    onLinkClick={handleLinkClick}
                  />
                )}
              </div>
            </div>

            {/* Pied */}
            <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-midnight-500/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link
                  href="/categories"
                  onClick={handleLinkClick}
                  className="text-sm text-gold-600 hover:text-gold-700 dark:text-gold-400 font-medium flex items-center gap-1"
                >
                  Toutes les catégories <ChevronDown size={14} className="rotate-[-90deg]" />
                </Link>
                <Link
                  href="/promotions"
                  onClick={handleLinkClick}
                  className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                >
                  <Percent size={14} /> Promotions
                </Link>
                <Link
                  href="/meilleures-ventes"
                  onClick={handleLinkClick}
                  className="text-sm text-amber-500 hover:text-amber-600 font-medium flex items-center gap-1"
                >
                  <TrendingUp size={14} /> Meilleures ventes
                </Link>
                <Link
                  href="/carte-cadeau"
                  onClick={handleLinkClick}
                  className="text-sm text-luxury-600 hover:text-luxury-700 font-medium flex items-center gap-1"
                >
                  <Gift size={14} /> Cartes cadeaux
                </Link>
              </div>
              <div className="hidden xl:flex items-center gap-2 text-xs text-neutral-400">
                <Sparkles size={14} className="text-gold-400" />
                <span>{categories.reduce((acc, c) => acc + (c.children?.length || 0), 0)} sous‑catégories</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}