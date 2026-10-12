// components/admin/ExportButton.tsx
'use client'

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown'
import { useToast } from '@/components/ui/Toast'
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileJson,
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Settings,
  X,
  Eye,
  Printer,
  type LucideIcon,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export type ExportFormat = 'csv' | 'pdf' | 'json'

export interface ExportColumn {
  /** Clé de la donnée dans l'objet */
  key: string
  /** Libellé de l'en-tête de colonne */
  label: string
  /** Fonction de formatage (optionnelle) */
  format?: (value: any, row: any) => string
  /** Inclure par défaut ? */
  default?: boolean
}

export interface ExportButtonProps {
  /** Données à exporter */
  data: Record<string, any>[]
  /** Définition des colonnes exportables */
  columns: ExportColumn[]
  /** Nom du fichier (sans extension) */
  filename?: string
  /** Titre du document (utilisé pour le PDF) */
  title?: string
  /** Formats d'export disponibles (tous par défaut) */
  formats?: ExportFormat[]
  /** Callback avant export (peut retourner les données modifiées) */
  onBeforeExport?: (format: ExportFormat, data: Record<string, any>[]) => Record<string, any>[]
  /** Callback après export réussi */
  onExport?: (format: ExportFormat) => void
  /** Désactiver le bouton */
  disabled?: boolean
  /** Variante du bouton */
  variant?: 'luxe' | 'outline-gold' | 'ghost'
  /** Taille */
  size?: 'sm' | 'md' | 'lg'
  /** Afficher uniquement l'icône */
  iconOnly?: boolean
  /** Label personnalisé */
  label?: string
  /** Tooltip au survol */
  tooltip?: string
  /** Classes additionnelles */
  className?: string
  /** Permettre à l'utilisateur de sélectionner les colonnes */
  allowColumnSelection?: boolean
  /** Colonnes sélectionnées par défaut (si allowColumnSelection) */
  defaultSelectedColumns?: string[]
  /** Séparateur CSV (',' ou ';') */
  csvSeparator?: ',' | ';'
  /** Ajouter BOM UTF-8 pour compatibilité Excel */
  addBOM?: boolean
}

/* ========================================================================== */
/*  Formatages par type de colonne                                             */
/* ========================================================================== */

function formatCell(value: any, col: ExportColumn, row: Record<string, any>): string {
  if (col.format) return col.format(value, row)
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function escapeCSV(value: string, separator: ',' | ';'): string {
  if (value.includes(separator) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/* ========================================================================== */
/*  Fonctions d'export                                                         */
/* ========================================================================== */

function generateCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  separator: ',' | ';',
  addBOM: boolean
): string {
  const headers = columns.map(c => escapeCSV(c.label, separator))
  const rows = data.map(row =>
    columns.map(c => escapeCSV(formatCell(row[c.key], c, row), separator))
  )
  const content = [headers, ...rows].map(r => r.join(separator)).join('\n')
  return addBOM ? '\uFEFF' + content : content
}

function generateJSON(data: Record<string, any>[], columns: ExportColumn[]): string {
  const filtered = data.map(row => {
    const obj: Record<string, any> = {}
    columns.forEach(c => {
      obj[c.key] = row[c.key]
    })
    return obj
  })
  return JSON.stringify(filtered, null, 2)
}

function generatePrintableHTML(
  data: Record<string, any>[],
  columns: ExportColumn[],
  title: string
): string {
  const headers = columns.map(c => `<th>${c.label}</th>`).join('')
  const rows = data
    .map(
      row =>
        `<tr>${columns.map(c => `<td>${formatCell(row[c.key], c, row)}</td>`).join('')}</tr>`
    )
    .join('')
  return `
    <!DOCTYPE html>
    <html>
    <head><title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 2rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f4f3f0; }
    </style>
    </head>
    <body>
      <h1>${title}</h1>
      <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </body>
    </html>`
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ========================================================================== */
/*  Composant ExportButton                                                     */
/* ========================================================================== */

export const ExportButton = forwardRef<HTMLDivElement, ExportButtonProps>(
  (
    {
      data,
      columns,
      filename = `export_${new Date().toISOString().slice(0, 10)}`,
      title = 'Export',
      formats = ['csv', 'pdf', 'json'],
      onBeforeExport,
      onExport,
      disabled = false,
      variant = 'outline-gold',
      size = 'sm',
      iconOnly = false,
      label = 'Exporter',
      tooltip = 'Exporter les données',
      className,
      allowColumnSelection = true,
      defaultSelectedColumns,
      csvSeparator = ',',
      addBOM = true,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const toast = useToast()

    // État de chargement
    const [loading, setLoading] = useState(false)
    const [exported, setExported] = useState(false)

    // Sélection de colonnes
    const [selectedCols, setSelectedCols] = useState<Set<string>>(
      () =>
        new Set(
          defaultSelectedColumns ||
            columns.filter(c => c.default !== false).map(c => c.key)
        )
    )

    // Panneau de configuration ouvert
    const [configOpen, setConfigOpen] = useState(false)

    // Format préféré (mémorisé)
    const [preferredFormat, setPreferredFormat] = useState<ExportFormat>(() => {
      if (typeof window !== 'undefined') {
        return (localStorage.getItem('export-format') as ExportFormat) || 'csv'
      }
      return 'csv'
    })

    const activeColumns = useMemo(
      () => columns.filter(c => selectedCols.has(c.key)),
      [columns, selectedCols]
    )

    const toggleColumn = (key: string) => {
      setSelectedCols(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          if (next.size > 1) next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    }

    const selectAllColumns = () => setSelectedCols(new Set(columns.map(c => c.key)))
    const unselectAllButFirst = () => {
      if (columns.length > 0) setSelectedCols(new Set([columns[0].key]))
    }

    const handleExport = useCallback(
      async (format: ExportFormat) => {
        if (data.length === 0) {
          toast.addToast({ type: 'warning', message: 'Aucune donnée à exporter' })
          return
        }

        setLoading(true)
        setExported(false)

        try {
          // Callback avant export
          const exportData = onBeforeExport
            ? onBeforeExport(format, data)
            : data

          // Génération du contenu
          let content = ''
          let mime = ''
          let ext = ''

          switch (format) {
            case 'csv':
              content = generateCSV(exportData, activeColumns, csvSeparator, addBOM)
              mime = 'text/csv;charset=utf-8'
              ext = 'csv'
              break
            case 'json':
              content = generateJSON(exportData, activeColumns)
              mime = 'application/json;charset=utf-8'
              ext = 'json'
              break
            case 'pdf': {
              const html = generatePrintableHTML(exportData, activeColumns, title)
              const printWindow = window.open('', '_blank')
              if (printWindow) {
                printWindow.document.write(html)
                printWindow.document.close()
                printWindow.focus()
                setTimeout(() => printWindow.print(), 500)
              } else {
                toast.addToast({ type: 'error', message: 'Impossible d\'ouvrir la fenêtre d\'impression' })
              }
              setLoading(false)
              setExported(true)
              setTimeout(() => setExported(false), 3000)
              onExport?.(format)
              return
            }
          }

          // Téléchargement
          downloadBlob(content, `${filename}.${ext}`, mime)

          setExported(true)
          setTimeout(() => setExported(false), 3000)

          // Mémoriser le format
          localStorage.setItem('export-format', format)
          setPreferredFormat(format)

          toast.addToast({
            type: 'success',
            message: `${activeColumns.length} colonnes exportées en ${format.toUpperCase()}`,
          })

          onExport?.(format)
        } catch (err: any) {
          toast.addToast({
            type: 'error',
            message: err.message || 'Erreur lors de l\'export',
          })
        } finally {
          setLoading(false)
          setConfigOpen(false)
        }
      },
      [
        data,
        activeColumns,
        filename,
        title,
        csvSeparator,
        addBOM,
        onBeforeExport,
        onExport,
        toast,
      ]
    )

    // Raccourci clavier Ctrl+E
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault()
          if (!disabled && data.length > 0) {
            handleExport(preferredFormat)
          }
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [disabled, data, preferredFormat, handleExport])

    const formatIcons: Record<ExportFormat, LucideIcon> = {
      csv: FileSpreadsheet,
      pdf: FileText,
      json: FileJson,
    }

    const formatLabels: Record<ExportFormat, string> = {
      csv: 'CSV (Excel)',
      pdf: 'PDF (Impression)',
      json: 'JSON',
    }

    const exportContent = (
      <div ref={containerRef} className={cn('inline-flex', className)}>
        {/* Bouton principal (export rapide au format préféré) */}
        <Tooltip content={tooltip}>
          <Button
            variant={variant}
            size={size}
            disabled={disabled || data.length === 0 || loading}
            onClick={() => handleExport(preferredFormat)}
            loading={loading}
            leftIcon={exported ? <Check size={16} /> : <Download size={16} />}
            className={cn(iconOnly && 'px-2')}
          >
            {exported ? 'Exporté !' : iconOnly ? null : label}
          </Button>
        </Tooltip>

        {/* Dropdown pour choisir un autre format + configuration */}
        <Dropdown
          trigger={
            <Button
              variant={variant}
              size={size}
              disabled={disabled || data.length === 0}
              className="px-2 -ml-px rounded-l-none"
            >
              <ChevronDown size={14} />
            </Button>
          }
          align="right"
          className="min-w-[220px]"
        >
          {/* Formats disponibles */}
          {formats.map(format => (
            <DropdownItem
              key={format}
              onClick={() => handleExport(format)}
              icon={React.createElement(formatIcons[format], { size: 16 })}
              shortcut={
                format === preferredFormat ? 'Ctrl+E' : undefined
              }
            >
              {formatLabels[format]}
              {format === preferredFormat && (
                <Badge variant="gold" size="sm" className="ml-2">
                  Défaut
                </Badge>
              )}
            </DropdownItem>
          ))}

          {/* Séparateur + configuration des colonnes */}
          {allowColumnSelection && (
            <>
              <DropdownSeparator />
              <DropdownItem
                icon={<Settings size={16} />}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfigOpen(!configOpen)
                }}
              >
                Choisir les colonnes ({activeColumns.length}/{columns.length})
              </DropdownItem>

              {/* Panneau de sélection (affiché dans le dropdown) */}
              <AnimatePresence>
                {configOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-2 space-y-1 max-h-48 overflow-y-auto border-t border-border">
                      {columns.map(col => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCols.has(col.key)}
                            onChange={() => toggleColumn(col.key)}
                            className="text-gold-500 rounded focus:ring-gold-400"
                          />
                          <span className="flex-1">{col.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-1 px-3 py-2 border-t border-border">
                      <button
                        onClick={selectAllColumns}
                        className="text-xs text-gold-600 hover:underline"
                      >
                        Tout sélectionner
                      </button>
                      <button
                        onClick={unselectAllButFirst}
                        className="text-xs text-muted-foreground hover:underline ml-auto"
                      >
                        Réduire
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </Dropdown>
      </div>
    )

    return exportContent
  }
)

ExportButton.displayName = 'ExportButton'