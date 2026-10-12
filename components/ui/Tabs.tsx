// components/ui/Tabs.tsx
'use client'

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  createContext,
  useContext,
  useId,
  forwardRef,
  useImperativeHandle,
  Children,
  isValidElement,
  ReactNode,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Tooltip } from './Tooltip' // composant existant amélioré

/* ========================================================================
   Types publics
   ======================================================================== */
export interface TabItem {
  /** Clé unique (si non fournie, l'index est utilisé) */
  key?: string
  label: string
  /** Contenu de l'onglet (ReactNode) */
  content: ReactNode
  /** Désactive l'onglet */
  disabled?: boolean
  /** Icône (avant le label) */
  icon?: ReactNode
  /** Badge (nombre ou chaîne) */
  badge?: string | number
  /** Tooltip optionnel (si icône seule ou en complément) */
  tooltip?: string
  /** État de chargement (affiche un spinner à la place du contenu) */
  loading?: boolean
}

interface TabsProps {
  /** Tableau des onglets (mode contrôlé ou non) */
  tabs: TabItem[]
  /** Index de l'onglet actif (contrôlé) */
  activeIndex?: number
  /** Index par défaut (non contrôlé) */
  defaultIndex?: number
  /** Callback quand l'onglet change */
  onChange?: (index: number) => void
  /** Callback avant le changement, retourne false pour bloquer */
  onBeforeChange?: (index: number, prevIndex: number) => boolean | void
  className?: string
  /** Variante de style */
  variant?: 'underline' | 'pills' | 'rounded' | 'segmented' | 'card' | 'classic' | 'minimal'
  /** Orientation */
  orientation?: 'horizontal' | 'vertical'
  /** Taille */
  size?: 'sm' | 'md' | 'lg'
  /** Animation de la transition du contenu */
  animated?: boolean
  /** Alignement des onglets (horizontal) */
  align?: 'start' | 'center' | 'end'
  /** Si true, détruit le contenu des onglets non actifs (sinon, le cache avec display:none) */
  destroyOnHide?: boolean
  /** Force le rendu de tous les contenus (utile pour précharger des ressources) */
  forceRenderAll?: boolean
  /** Classes additionnelles pour le conteneur de la barre d'onglets */
  tabsClassName?: string
  /** Classes additionnelles pour chaque bouton d'onglet */
  tabClassName?: string
  /** Classes additionnelles pour le conteneur de contenu */
  contentClassName?: string
  /** Hauteur maximale du contenu (scroll) */
  contentMaxHeight?: string
  /** Affiche des flèches de défilement si les onglets dépassent (horizontal) */
  scrollable?: boolean
  /** Largeur maximale des boutons d'onglets avant le scroll */
  maxTabWidth?: number
  /** Remplacer le bouton d'onglet par un composant personnalisé */
  renderTab?: (tab: TabItem, index: number, isActive: boolean, props: any) => ReactNode
}

/* ========================================================================
   Contexte interne pour partager l'état actif
   ======================================================================== */
interface TabsContextValue {
  activeIndex: number
  setActive: (index: number) => void
  tabs: TabItem[]
  variant: TabsProps['variant']
  size: TabsProps['size']
  orientation: TabsProps['orientation']
  animated: boolean
  destroyOnHide: boolean
  contentMaxHeight?: string
}
const TabsContext = createContext<TabsContextValue | null>(null)

const useTabsContext = () => {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('TabsContext missing')
  return ctx
}

/* ========================================================================
   Sous-composants : TabButton, TabPanel
   ======================================================================== */
const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
}

const TabButton = forwardRef<
  HTMLButtonElement,
  {
    tab: TabItem
    index: number
    isActive: boolean
    variant: string
    size: string
    orientation: string
    align: string
    onSelect: () => void
    className?: string
    style?: React.CSSProperties
  }
>(({ tab, index, isActive, variant, size, orientation, align, onSelect, className, style }, ref) => {
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Combinaison de refs
  useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement)

  const baseClasses = cn(
    'relative inline-flex items-center gap-2 font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 whitespace-nowrap',
    sizeStyles[size],
    orientation === 'vertical'
      ? 'rounded-r-none rounded-l-lg border-l-2 w-full justify-start'
      : variant === 'rounded' || variant === 'pills'
        ? 'rounded-full'
        : 'rounded-lg',
    tab.disabled && 'opacity-50 cursor-not-allowed',
    className
  )

  // Style actif
  let activeClasses = ''
  let inactiveClasses = ''

  switch (variant) {
    case 'underline':
      activeClasses = orientation === 'vertical'
        ? 'border-l-brand-600 bg-brand-50/50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
        : 'border-b-2 border-brand-600 text-brand-600 dark:text-brand-400 -mb-px'
      inactiveClasses = orientation === 'vertical'
        ? 'border-l-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-midnight-700/50'
        : 'border-b-2 border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      break
    case 'pills':
      activeClasses = 'bg-gradient-to-r from-gold-400 to-gold-600 text-midnight-950 shadow-gold'
      inactiveClasses = 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-midnight-700/50'
      break
    case 'rounded':
      activeClasses = 'bg-gradient-to-r from-brand-500 to-luxury-600 text-white shadow-md'
      inactiveClasses = 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-midnight-700/50'
      break
    case 'segmented':
      activeClasses = 'bg-white dark:bg-midnight-600 text-neutral-900 dark:text-neutral-100 shadow-sm'
      inactiveClasses = 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
      break
    case 'card':
      activeClasses = 'bg-white dark:bg-midnight-800 border-t-2 border-brand-500 shadow-md rounded-t-lg rounded-b-none z-10 -mb-px'
      inactiveClasses = 'bg-neutral-100 dark:bg-midnight-900/50 text-neutral-600 dark:text-neutral-400 hover:bg-white dark:hover:bg-midnight-800 border border-neutral-200 dark:border-midnight-700'
      break
    case 'classic':
      activeClasses = 'bg-white dark:bg-midnight-800 text-neutral-900 dark:text-neutral-100 border border-b-0 border-neutral-200 dark:border-midnight-700 rounded-t-md'
      inactiveClasses = 'bg-neutral-50 dark:bg-midnight-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-midnight-800 border border-neutral-200 dark:border-midnight-700'
      break
    case 'minimal':
      activeClasses = 'text-brand-600 dark:text-brand-400 font-semibold'
      inactiveClasses = 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      break
    default:
      break
  }

  const content = (
    <>
      {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
      <span>{tab.label}</span>
      {tab.badge !== undefined && (
        <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white min-w-[1.25rem] animate-pulse-soft">
          {tab.badge}
        </span>
      )}
    </>
  )

  const button = (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${tab.key || index}`}
      aria-disabled={tab.disabled}
      disabled={tab.disabled}
      onClick={onSelect}
      className={cn(baseClasses, isActive ? activeClasses : inactiveClasses, tab.disabled && 'pointer-events-none')}
      style={style}
      tabIndex={isActive ? 0 : -1}
      id={`tab-${tab.key || index}`}
    >
      {content}
    </button>
  )

  if (tab.tooltip) {
    return <Tooltip content={tab.tooltip} variant="dark" position="top" delay={500}>{button}</Tooltip>
  }

  return button
})
TabButton.displayName = 'TabButton'

const TabPanel = ({
  children,
  active,
  animated,
  destroyOnHide,
  contentMaxHeight,
  id,
}: {
  children: ReactNode
  active: boolean
  animated: boolean
  destroyOnHide: boolean
  contentMaxHeight?: string
  id: string
}) => {
  if (destroyOnHide && !active) return null

  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={id.replace('panel-', 'tab-')}
      hidden={!active && !destroyOnHide}
      className={cn(!active && !destroyOnHide && 'hidden')}
      style={{ maxHeight: contentMaxHeight, overflow: 'auto' }}
    >
      {animated ? (
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        active && children
      )}
    </div>
  )
}

/* ========================================================================
   Composant Tabs principal
   ======================================================================== */
const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      tabs,
      activeIndex: controlledIndex,
      defaultIndex = 0,
      onChange,
      onBeforeChange,
      className,
      variant = 'underline',
      orientation = 'horizontal',
      size = 'md',
      animated = true,
      align = 'start',
      destroyOnHide = false,
      forceRenderAll = false,
      tabsClassName,
      tabClassName,
      contentClassName,
      contentMaxHeight,
      scrollable = true,
      maxTabWidth = 160,
      renderTab,
    },
    ref
  ) => {
    const isControlled = controlledIndex !== undefined
    const [internalIndex, setInternalIndex] = useState(defaultIndex)
    const activeIndex = isControlled ? controlledIndex : internalIndex

    const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
    const containerRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Exposer le container via ref
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

    // Gérer le changement d'onglet
    const setActive = useCallback(
      (index: number) => {
        if (tabs[index]?.disabled) return
        const prev = activeIndex
        if (index === prev) return
        if (onBeforeChange && onBeforeChange(index, prev) === false) return
        if (!isControlled) setInternalIndex(index)
        onChange?.(index)
      },
      [activeIndex, isControlled, onChange, onBeforeChange, tabs]
    )

    // Navigation clavier (flèches)
    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (orientation !== 'horizontal') return
        const enabledIndices = tabs
          .map((tab, idx) => (tab.disabled ? -1 : idx))
          .filter((i) => i !== -1)
        const currentPos = enabledIndices.indexOf(activeIndex)
        if (currentPos === -1) return

        let next = currentPos
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          next = (currentPos + 1) % enabledIndices.length
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          next = (currentPos - 1 + enabledIndices.length) % enabledIndices.length
        } else if (e.key === 'Home') {
          e.preventDefault()
          next = 0
        } else if (e.key === 'End') {
          e.preventDefault()
          next = enabledIndices.length - 1
        }

        if (next !== currentPos) {
          const newIndex = enabledIndices[next]
          setActive(newIndex)
          // Focus sur le bouton
          tabsRef.current[newIndex]?.focus()
        }
      },
      [orientation, activeIndex, tabs, setActive]
    )

    // Gestion du défilement automatique pour l'onglet actif
    useEffect(() => {
      if (!scrollContainerRef.current || orientation !== 'horizontal') return
      const activeButton = tabsRef.current[activeIndex]
      if (!activeButton) return
      const container = scrollContainerRef.current
      const buttonRect = activeButton.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (buttonRect.left < containerRect.left || buttonRect.right > containerRect.right) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }, [activeIndex, orientation])

    // Indicateur animé pour certaines variantes
    const showAnimatedIndicator =
      (variant === 'underline' || variant === 'minimal' || variant === 'classic') && orientation === 'horizontal'

    const indicatorStyle = useMemo(() => {
      if (!showAnimatedIndicator) return {}
      const el = tabsRef.current[activeIndex]
      if (!el) return {}
      return {
        width: el.offsetWidth,
        left: el.offsetLeft,
      }
    }, [activeIndex, showAnimatedIndicator, tabsRef.current])

    const isVertical = orientation === 'vertical'
    const alignClass = isVertical
      ? ''
      : { start: 'justify-start', center: 'justify-center', end: 'justify-end' }[align]

    return (
      <div
        ref={containerRef}
        className={cn('flex', isVertical ? 'flex-row' : 'flex-col', className)}
        onKeyDown={handleKeyDown}
      >
        {/* Barre d'onglets */}
        <div
          className={cn(
            'relative',
            'flex',
            isVertical ? 'flex-col space-y-1' : 'flex-row',
            !isVertical && variant === 'underline' && 'border-b border-neutral-200 dark:border-neutral-800',
            variant === 'segmented' &&
              'bg-neutral-100 dark:bg-midnight-700/40 p-1 rounded-xl',
            variant === 'pills' && 'gap-2',
            variant === 'rounded' && 'gap-2',
            variant === 'minimal' && 'gap-1',
            variant === 'classic' && 'border-b border-neutral-200 dark:border-neutral-800',
            variant === 'card' && 'gap-0',
            alignClass,
            tabsClassName
          )}
          role="tablist"
          aria-orientation={orientation}
        >
          {scrollable && !isVertical ? (
            <div
              ref={scrollContainerRef}
              className="flex overflow-x-auto scrollbar-hide gap-1 pb-1"
            >
              {tabs.map((tab, index) => {
                const isActive = activeIndex === index
                const btn = renderTab ? (
                  renderTab(tab, index, isActive, {
                    onClick: () => setActive(index),
                    className: cn(tabClassName),
                    ref: (el: HTMLButtonElement) => { tabsRef.current[index] = el },
                    key: tab.key || index,
                  })
                ) : (
                  <TabButton
                    key={tab.key || index}
                    ref={(el) => { tabsRef.current[index] = el }}
                    tab={tab}
                    index={index}
                    isActive={isActive}
                    variant={variant}
                    size={size}
                    orientation={orientation}
                    align={align}
                    onSelect={() => setActive(index)}
                    className={tabClassName}
                    style={{ maxWidth: maxTabWidth }}
                  />
                )
                return btn
              })}
            </div>
          ) : (
            tabs.map((tab, index) => {
              const isActive = activeIndex === index
              const btn = renderTab ? (
                renderTab(tab, index, isActive, {
                  onClick: () => setActive(index),
                  className: cn(tabClassName),
                  ref: (el: HTMLButtonElement) => { tabsRef.current[index] = el },
                  key: tab.key || index,
                })
              ) : (
                <TabButton
                  key={tab.key || index}
                  ref={(el) => { tabsRef.current[index] = el }}
                  tab={tab}
                  index={index}
                  isActive={isActive}
                  variant={variant}
                  size={size}
                  orientation={orientation}
                  align={align}
                  onSelect={() => setActive(index)}
                  className={tabClassName}
                />
              )
              return btn
            })
          )}

          {/* Indicateur animé (underline / classic / minimal) */}
          {showAnimatedIndicator && (
            <motion.div
              layoutId="tabs-indicator"
              className="absolute bottom-0 h-0.5 bg-brand-600 dark:bg-brand-400 rounded-full"
              initial={false}
              animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
        </div>

        {/* Contenu des onglets */}
        <div
          className={cn(
            isVertical ? 'flex-1 pl-4' : 'mt-4',
            contentClassName
          )}
        >
          {tabs.map((tab, index) => (
            <TabPanel
              key={tab.key || index}
              active={activeIndex === index || (forceRenderAll && !destroyOnHide)}
              animated={animated}
              destroyOnHide={destroyOnHide}
              contentMaxHeight={contentMaxHeight}
              id={`panel-${tab.key || index}`}
            >
              {tab.loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                </div>
              ) : (
                tab.content
              )}
            </TabPanel>
          ))}
        </div>
      </div>
    )
  }
)
Tabs.displayName = 'Tabs'

export { Tabs }