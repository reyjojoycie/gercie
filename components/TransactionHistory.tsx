// components/TransactionHistory.tsx
'use client'

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import {
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Eye,
  Wallet,
  Smartphone,
  RefreshCw,
  ArrowRightLeft,
  ShoppingBag,
  Gift,
  Banknote,
  CreditCard,
  Info,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types (alignés sur hooks/useWallet.ts)                                    */
/* ========================================================================== */

export interface Transaction {
  id: string
  type:
    | 'recharge'
    | 'achat'
    | 'retrait'
    | 'transfert'
    | 'vente'
    | 'remboursement'
    | 'escrow_in'
    | 'escrow_out'
    | 'commission'
  montant: number
  description: string
  created_at: string
  method?: string
  phone?: string
  status?: 'pending' | 'approved' | 'rejected'
  portefeuille_type?: string
}

interface TransactionHistoryProps {
  /** Liste des transactions à afficher */
  transactions: Transaction[]
  /** Nombre total de transactions (pour la pagination) */
  total?: number
  /** Page actuelle (1-indexed) */
  page?: number
  /** Nombre de transactions par page */
  pageSize?: number
  /** Callback pour changer de page */
  onPageChange?: (page: number) => void
  /** Indique si une requête est en cours */
  loading?: boolean
  /** Erreur éventuelle */
  error?: string | null
  /** Callback pour réessayer après une erreur */
  onRetry?: () => void
  /** Callback pour filtrer par type (remonte le type choisi) */
  onFilterChange?: (type?: string) => void
  /** Type de filtre actif */
  activeFilter?: string
  /** Callback pour exporter (si non fourni, téléchargement CSV) */
  onExport?: (format: 'csv' | 'pdf') => void
  /** Afficher une barre de recherche */
  searchable?: boolean
  /** Placeholder de la recherche */
  searchPlaceholder?: string
  /** Classe additionnelle */
  className?: string
  /** Variante d'affichage */
  variant?: 'default' | 'compact'
  /** Afficher le sélecteur de page size */
  showPageSize?: boolean
  /** Tailles de page disponibles */
  pageSizes?: number[]
}

/* ========================================================================== */
/*  Mappings des types de transaction                                         */
/* ========================================================================== */

const typeLabels: Record<string, string> = {
  recharge: 'Recharge',
  achat: 'Achat',
  retrait: 'Retrait',
  transfert: 'Transfert',
  vente: 'Vente',
  remboursement: 'Remboursement',
  escrow_in: 'Séquestre entrant',
  escrow_out: 'Séquestre sortant',
  commission: 'Commission',
}

const typeIcons: Record<string, LucideIcon> = {
  recharge: Wallet,
  achat: ShoppingBag,
  retrait: ArrowUp,
  transfert: ArrowRightLeft,
  vente: ArrowDown,
  remboursement: RefreshCw,
  escrow_in: ArrowDown,
  escrow_out: ArrowUp,
  commission: DollarSign,
}

const typeColors: Record<string, { text: string; bg: string; badge: 'gold' | 'accent' | 'warm' | 'danger' | 'neutral' }> = {
  recharge: { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'gold' },
  achat: { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', badge: 'accent' },
  retrait: { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'danger' },
  transfert: { text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', badge: 'neutral' },
  vente: { text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'accent' },
  remboursement: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', badge: 'warm' },
  escrow_in: { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', badge: 'neutral' },
  escrow_out: { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', badge: 'neutral' },
  commission: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'gold' },
}

/* ========================================================================== */
/*  Fonctions utilitaires                                                     */
/* ========================================================================== */

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return "À l'instant"
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`
  if (diffHours < 24) return `Il y a ${diffHours} h`
  if (diffDays < 7) return `Il y a ${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function exportToCSV(transactions: Transaction[]) {
  const headers = ['ID', 'Type', 'Description', 'Montant (FC)', 'Date', 'Méthode', 'Statut']
  const rows = transactions.map(tx => [
    tx.id,
    typeLabels[tx.type] || tx.type,
    tx.description,
    tx.montant,
    new Date(tx.created_at).toISOString(),
    tx.method || '',
    tx.status || 'approved',
  ])
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/* ========================================================================== */
/*  Composant TransactionHistory                                              */
/* ========================================================================== */

export const TransactionHistory = forwardRef<HTMLDivElement, TransactionHistoryProps>(
  (
    {
      transactions,
      total = transactions.length,
      page = 1,
      pageSize = 10,
      onPageChange,
      loading = false,
      error,
      onRetry,
      onFilterChange,
      activeFilter,
      onExport,
      searchable = true,
      searchPlaceholder = 'Rechercher une transaction...',
      className,
      variant = 'default',
      showPageSize = true,
      pageSizes = [10, 25, 50],
    },
    ref
  ) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedType, setSelectedType] = useState<string | undefined>(activeFilter)
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [detailModalTx, setDetailModalTx] = useState<Transaction | null>(null)

    const totalPages = Math.ceil(total / pageSize)
    const hasPrev = page > 1
    const hasNext = page < totalPages

    // Synchroniser le filtre local avec le parent
    useEffect(() => {
      setSelectedType(activeFilter)
    }, [activeFilter])

    const handleFilterChange = useCallback(
      (type: string) => {
        const newType = type === selectedType ? undefined : type
        setSelectedType(newType)
        onFilterChange?.(newType)
      },
      [selectedType, onFilterChange]
    )

    const toggleExpand = (id: string) => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    // Filtrage local (si l'API ne renvoie pas déjà filtré)
    const filteredTransactions = useMemo(() => {
      let list = transactions
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        list = list.filter(
          tx =>
            tx.description.toLowerCase().includes(q) ||
            tx.id.toLowerCase().includes(q) ||
            (tx.method && tx.method.toLowerCase().includes(q))
        )
      }
      return list
    }, [transactions, searchQuery])

    const compact = variant === 'compact'

    const renderSkeleton = () => (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 bg-card rounded-xl border border-border">
            <div className="flex items-center gap-4">
              <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" shimmer shimmerVariant="gold" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-1/3 h-4" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-2/3 h-4" shimmer shimmerVariant="gold" />
              </div>
              <Skeleton variant="text" className="w-20 h-5" shimmer shimmerVariant="gold" />
            </div>
          </div>
        ))}
      </div>
    )

    const renderError = () => (
      <div className="flex flex-col items-center py-8 text-center">
        <AlertTriangle size={32} className="text-red-500 mb-2" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        {onRetry && (
          <Button variant="danger" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw size={14} className="mr-1" /> Réessayer
          </Button>
        )}
      </div>
    )

    const renderEmpty = () => (
      <EmptyState
        icon={<FileText size={48} className="text-muted-foreground" />}
        title="Aucune transaction"
        description="Vous n'avez aucune transaction pour le moment."
        actionLabel="Recharger mon compte"
        onAction={() => window.location.href = '/profile/recharge'}
      />
    )

    const renderTransactionRow = (tx: Transaction) => {
      const isExpanded = expandedIds.has(tx.id)
      const Icon = typeIcons[tx.type] || FileText
      const colors = typeColors[tx.type] || { text: 'text-muted-foreground', bg: 'bg-muted', badge: 'neutral' as const }
      const isPositive = tx.montant > 0

      return (
        <div key={tx.id} className="group">
          <div
            className={cn(
              'flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-card-hover transition-all cursor-pointer',
              compact && 'p-3 gap-3'
            )}
            onClick={() => toggleExpand(tx.id)}
          >
            {/* Icône type */}
            <div className={cn('p-2 rounded-lg flex-shrink-0', colors.bg)}>
              <Icon size={20} className={colors.text} />
            </div>

            {/* Détails */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={colors.badge} size="sm">
                  {typeLabels[tx.type] || tx.type}
                </Badge>
                {tx.status === 'pending' && (
                  <Badge variant="warm" size="sm">
                    <Clock size={12} className="mr-1" /> En attente
                  </Badge>
                )}
                {tx.status === 'rejected' && (
                  <Badge variant="danger" size="sm">
                    <AlertTriangle size={12} className="mr-1" /> Refusée
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>{new Date(tx.created_at).toLocaleString()}</span>
                {tx.method && (
                  <span className="px-1.5 py-0.5 rounded-full bg-muted">
                    via {tx.method}
                  </span>
                )}
                {tx.phone && <span>{tx.phone}</span>}
              </div>
            </div>

            {/* Montant */}
            <div className="text-right flex-shrink-0">
              <span
                className={cn(
                  'font-bold',
                  isPositive ? 'text-green-600' : 'text-red-600'
                )}
              >
                {isPositive ? '+' : ''}{tx.montant.toLocaleString()} FC
              </span>
            </div>

            {/* Expand icon */}
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </div>

          {/* Détails expansibles */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 p-4 bg-muted/50 rounded-xl border border-border space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">ID transaction</p>
                      <p className="font-mono text-xs">{tx.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium">{typeLabels[tx.type] || tx.type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p>{new Date(tx.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Montant</p>
                      <p className="font-semibold">{tx.montant.toLocaleString()} FC</p>
                    </div>
                    {tx.method && (
                      <div>
                        <p className="text-xs text-muted-foreground">Méthode</p>
                        <p>{tx.method}</p>
                      </div>
                    )}
                    {tx.phone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Téléphone</p>
                        <p>{tx.phone}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Statut</p>
                      <Badge variant={tx.status === 'pending' ? 'warm' : tx.status === 'rejected' ? 'danger' : 'accent'} size="sm">
                        {tx.status === 'approved' ? 'Approuvée' : tx.status === 'pending' ? 'En attente' : 'Refusée'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip content="Voir les détails complets">
                      <Button variant="ghost" size="sm" onClick={() => setDetailModalTx(tx)}>
                        <Eye size={14} className="mr-1" /> Détails
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )
    }

    return (
      <div ref={ref} className={cn('space-y-4', className)}>
        {/* Barre d'outils */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 flex gap-2 w-full sm:w-auto">
            {searchable && (
              <Input
                leftIcon={<Search size={16} className="text-muted-foreground" />}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                allowClear
                onClear={() => setSearchQuery('')}
                variant="glass"
                size="sm"
                className="flex-1 max-w-xs"
              />
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Filtres par type */}
            <div className="flex flex-wrap gap-1">
              {Object.keys(typeLabels).map(type => (
                <button
                  key={type}
                  onClick={() => handleFilterChange(type)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition border',
                    selectedType === type
                      ? 'bg-gold-400/20 border-gold-400/60 text-gold-600 shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-gold-400'
                  )}
                >
                  {typeLabels[type]}
                </button>
              ))}
              {selectedType && (
                <button
                  onClick={() => handleFilterChange(selectedType!)}
                  className="px-2 py-1 rounded-full text-xs text-red-500 hover:text-red-600"
                >
                  <X size={12} className="inline mr-0.5" /> Réinitialiser
                </button>
              )}
            </div>
            {/* Export */}
            <Tooltip content="Exporter en CSV">
              <Button
                variant="outline-gold"
                size="sm"
                onClick={() => (onExport ? onExport('csv') : exportToCSV(transactions))}
                leftIcon={<Download size={14} />}
              >
                CSV
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Contenu */}
        {loading && transactions.length === 0 ? (
          renderSkeleton()
        ) : error && transactions.length === 0 ? (
          renderError()
        ) : filteredTransactions.length === 0 ? (
          renderEmpty()
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map(tx => renderTransactionRow(tx))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() => onPageChange?.(page - 1)}
                disabled={!hasPrev || loading}
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm text-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline-gold"
                size="icon"
                onClick={() => onPageChange?.(page + 1)}
                disabled={!hasNext || loading}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
            {showPageSize && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Lignes :</span>
                <select
                  value={pageSize}
                  onChange={e => onPageChange?.(1) /* reset page si changement de taille */}
                  className="bg-card border border-border rounded-lg px-2 py-1 text-sm"
                >
                  {pageSizes.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Modal détail */}
        <Modal
          isOpen={!!detailModalTx}
          onClose={() => setDetailModalTx(null)}
          title="Détail de la transaction"
          size="sm"
          accent="gold"
        >
          {detailModalTx && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs">{detailModalTx.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{typeLabels[detailModalTx.type] || detailModalTx.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-bold">{detailModalTx.montant.toLocaleString()} FC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{new Date(detailModalTx.created_at).toLocaleString()}</span>
              </div>
              {detailModalTx.method && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Méthode</span>
                  <span>{detailModalTx.method}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={detailModalTx.status === 'pending' ? 'warm' : 'accent'} size="sm">
                  {detailModalTx.status === 'approved' ? 'Approuvée' : detailModalTx.status === 'pending' ? 'En attente' : 'Refusée'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{detailModalTx.description}</p>
            </div>
          )}
        </Modal>
      </div>
    )
  }
)

TransactionHistory.displayName = 'TransactionHistory'