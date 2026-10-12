// components/ui/Breadcrumb.tsx
'use client'

import React, {
  createContext,
  useContext,
  forwardRef,
  useMemo,
  useCallback,
  Fragment,
  Children,
  isValidElement,
  ReactNode,
  ButtonHTMLAttributes,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ChevronRight, Home, Slash, Dot, ChevronDown, MoreHorizontal } from 'lucide-react'
import { Dropdown, DropdownItem } from './Dropdown' // composant enrichi existant
import { Tooltip } from './Tooltip'       // composant enrichi existant
import { motion, AnimatePresence } from 'framer-motion'

/* ========================================================================
   Types
   ======================================================================== */
type BreadcrumbSeparator = 'chevron' | 'slash' | 'dot' | 'line' | ReactNode
type BreadcrumbVariant = 'default' | 'outlined' | 'card' | 'minimal'
type BreadcrumbSize = 'sm' | 'md' | 'lg'

interface BreadcrumbProps {
  children: ReactNode
  /** Variante de style */
  variant?: BreadcrumbVariant
  /** Taille */
  size?: BreadcrumbSize
  /** Séparateur entre les éléments */
  separator?: BreadcrumbSeparator
  /** Affiche l'icône Home au début */
  showHomeIcon?: boolean
  /** Lien de l'icône Home */
  homeHref?: string
  /** Nombre maximum d'éléments avant de tronquer (0 = pas de troncature) */
  maxItems?: number
  /** Nombre d'éléments à garder au début lors de la troncature */
  itemsBeforeCollapse?: number
  /** Nombre d'éléments à garder à la fin lors de la troncature */
  itemsAfterCollapse?: number
  /** Label pour le bouton "..." */
  expandLabel?: string
  /** Accessibilité : aria-label */
  ariaLabel?: string
  /** Classe additionnelle */
  className?: string
}

interface BreadcrumbItemProps extends ButtonHTMLAttributes<HTMLElement> {
  children: ReactNode
  /** Lien (si fourni, rend un <Link>) */
  href?: string
  /** Icône (avant le texte) */
  icon?: ReactNode
  /** État actif (dernier élément, non cliquable) */
  isActive?: boolean
  /** Désactiver l'élément */
  disabled?: boolean
  /** Tooltip au survol */
  tooltip?: string
  /** Classe additionnelle */
  className?: string
}

interface BreadcrumbEllipsisProps {
  /** Label pour le bouton */
  label?: string
  /** Éléments cachés à afficher dans un dropdown */
  children?: ReactNode
}

/* ========================================================================
   Contexte interne
   ======================================================================== */
interface BreadcrumbContextValue {
  variant: BreadcrumbVariant
  size: BreadcrumbSize
  separator: BreadcrumbSeparator
  showHomeIcon: boolean
  homeHref: string
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

const useBreadcrumbContext = () => {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error('BreadcrumbContext missing')
  return ctx
}

/* ========================================================================
   Styles & mappings
   ======================================================================== */
const sizeMap: Record<BreadcrumbSize, string> = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1.5',
  lg: 'text-base gap-2',
}

const variantMap: Record<BreadcrumbVariant, string> = {
  default: 'text-neutral-600 dark:text-neutral-400',
  outlined:
    'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2',
  card: 'bg-white dark:bg-neutral-900 shadow-card rounded-xl p-3',
  minimal: 'text-neutral-500 dark:text-neutral-500',
}

const separatorMap: Record<string, ReactNode> = {
  chevron: <ChevronRight size={14} />,
  slash: <Slash size={14} className="text-neutral-400" />,
  dot: <Dot size={14} className="text-neutral-400" />,
  line: (
    <span className="inline-block w-1 h-1 rounded-full bg-neutral-400 dark:bg-neutral-500" />
  ),
}

/* ========================================================================
   Sous-composants
   ======================================================================== */

// --- Élément du fil d'ariane ---
const BreadcrumbItem = forwardRef<HTMLLIElement, BreadcrumbItemProps>(
  (
    {
      children,
      href,
      icon,
      isActive = false,
      disabled = false,
      tooltip,
      className,
      ...rest
    },
    ref
  ) => {
    const { size } = useBreadcrumbContext()

    const content = (
      <div
        className={cn(
          'flex items-center gap-1.5',
          sizeMap[size],
          isActive
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="truncate max-w-[180px]">{children}</span>
      </div>
    )

    const wrappedContent = tooltip ? (
      <Tooltip content={tooltip} delay={500} position="top">
        {content}
      </Tooltip>
    ) : (
      content
    )

    // Rendu conditionnel
    if (href && !isActive && !disabled) {
      return (
        <li ref={ref} className="flex items-center">
          <Link href={href} className="no-underline" {...rest}>
            {wrappedContent}
          </Link>
        </li>
      )
    }

    return (
      <li
        ref={ref}
        className="flex items-center"
        aria-current={isActive ? 'page' : undefined}
      >
        {wrappedContent}
      </li>
    )
  }
)
BreadcrumbItem.displayName = 'BreadcrumbItem'

// --- Points de suspension (ellipsis) avec dropdown ---
const BreadcrumbEllipsis = forwardRef<HTMLLIElement, BreadcrumbEllipsisProps>(
  ({ label = 'Plus', children }, ref) => {
    const { size } = useBreadcrumbContext()

    if (!children) {
      return (
        <li ref={ref} className="flex items-center">
          <span className="px-2 text-muted-foreground">...</span>
        </li>
      )
    }

    return (
      <li ref={ref} className="flex items-center">
        <Dropdown
          trigger={
            <button
              className={cn(
                'flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors p-1',
                'text-muted-foreground hover:text-foreground'
              )}
              aria-label={label}
              title={label}
            >
              <MoreHorizontal size={14} />
              <ChevronDown size={12} className="ml-1 opacity-50" />
            </button>
          }
          align="left"
          className="min-w-[160px]"
        >
          {children}
        </Dropdown>
      </li>
    )
  }
)
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis'

// --- Séparateur ---
const BreadcrumbSeparatorComponent = ({ separator }: { separator: BreadcrumbSeparator }) => {
  if (separator === 'chevron' || separator === 'slash' || separator === 'dot' || separator === 'line') {
    return <li className="flex items-center text-muted-foreground">{separatorMap[separator]}</li>
  }
  return <li className="flex items-center">{separator}</li>
}

/* ========================================================================
   Composant Breadcrumb principal
   ======================================================================== */
const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(
  (
    {
      children,
      variant = 'default',
      size = 'md',
      separator = 'chevron',
      showHomeIcon = true,
      homeHref = '/',
      maxItems = 0,
      itemsBeforeCollapse = 1,
      itemsAfterCollapse = 1,
      expandLabel = 'Afficher plus',
      ariaLabel = 'Fil d\'ariane',
      className,
    },
    ref
  ) => {
    const contextValue = useMemo(
      () => ({
        variant,
        size,
        separator,
        showHomeIcon,
        homeHref,
      }),
      [variant, size, separator, showHomeIcon, homeHref]
    )

    // Récupération des éléments enfants
    const items = useMemo(() => {
      const childArray = Children.toArray(children)
      return childArray.filter(
        (child) =>
          isValidElement(child) &&
          (child.type === BreadcrumbItem || child.type === BreadcrumbEllipsis)
      )
    }, [children])

    // Application de la troncature
    const visibleItems = useMemo(() => {
      if (maxItems <= 0 || items.length <= maxItems) return items

      const before = items.slice(0, itemsBeforeCollapse)
      const after = items.slice(-itemsAfterCollapse)
      const middle = items.slice(itemsBeforeCollapse, -itemsAfterCollapse)

      return [
        ...before,
        <BreadcrumbEllipsis key="ellipsis" label={expandLabel}>
          {middle}
        </BreadcrumbEllipsis>,
        ...after,
      ]
    }, [items, maxItems, itemsBeforeCollapse, itemsAfterCollapse, expandLabel])

    // Génération du schéma structuré pour le SEO (schema.org)
    const structuredData = useMemo(() => {
      if (typeof window === 'undefined') return null
      const url = window.location.href
      const itemListElement = visibleItems
        .filter(
          (child) => isValidElement(child) && child.type === BreadcrumbItem && child.props.href
        )
        .map((child: any, index) => ({
          '@type': 'ListItem' as const,
          position: index + 1,
          name: child.props.children,
          item: child.props.href,
        }))
      return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement,
      }
    }, [visibleItems])

    return (
      <BreadcrumbContext.Provider value={contextValue}>
        <nav
          ref={ref as any}
          aria-label={ariaLabel}
          className={cn('flex items-center', variantMap[variant], className)}
        >
          <ol
            className={cn(
              'flex items-center flex-wrap',
              sizeMap[size]
            )}
          >
            {/* Icône Home */}
            {showHomeIcon && (
              <>
                <li className="flex items-center">
                  <Link
                    href={homeHref}
                    className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Accueil"
                  >
                    <Home size={size === 'sm' ? 14 : 16} />
                  </Link>
                </li>
                {visibleItems.length > 0 && (
                  <BreadcrumbSeparatorComponent separator={separator} />
                )}
              </>
            )}

            {/* Éléments */}
            {visibleItems.map((child, index) => {
              const isLast = index === visibleItems.length - 1
              return (
                <Fragment key={index}>
                  {child}
                  {!isLast && (
                    <BreadcrumbSeparatorComponent separator={separator} />
                  )}
                </Fragment>
              )
            })}
          </ol>

          {/* Données structurées SEO (injectées côté client) */}
          {structuredData && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
          )}
        </nav>
      </BreadcrumbContext.Provider>
    )
  }
)
Breadcrumb.displayName = 'Breadcrumb'

export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbEllipsis,
  type BreadcrumbProps,
  type BreadcrumbItemProps,
}