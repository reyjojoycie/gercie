// components/admin/Charts.tsx
'use client'

import React, { useState, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
} from 'recharts'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCcw,
  AlertTriangle,
  BarChart3,
  Activity,
  PieChart as PieChartIcon,
  Maximize2,
} from 'lucide-react'

/* ========================================================================== */
/*  Palette de couleurs harmonisée                                             */
/* ========================================================================== */

const CHART_COLORS = [
  '#c99a14', // gold
  '#4766f7', // brand
  '#18c78a', // accent
  '#e37d32', // copper
  '#8b5cf6', // luxury
  '#dc3f62', // burgundy
  '#0ea5e9', // sky
  '#6b9a5b', // sage
]

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'composed'

export interface ChartSeries {
  /** Clé du champ dans les données */
  dataKey: string
  /** Nom affiché dans la légende */
  name?: string
  /** Couleur de la série (prioritaire sur la palette) */
  color?: string
  /** Type pour les graphiques composés (line, bar, area) */
  type?: 'line' | 'bar' | 'area'
  /** Remplissage en dégradé (pour area) */
  fillOpacity?: number
  /** Épaisseur du trait */
  strokeWidth?: number
  /** Points visibles */
  dot?: boolean
}

export interface ChartData {
  [key: string]: any
}

export interface ChartCardProps {
  /** Titre de la carte */
  title: string
  /** Description / sous‑titre */
  description?: string
  /** Type de graphique */
  type?: ChartType
  /** Données (tableau d'objets) */
  data: ChartData[]
  /** Séries (une ou plusieurs) */
  series: ChartSeries[]
  /** Clé pour l'axe X (doit être présente dans chaque objet) */
  dataKeyX?: string
  /** Hauteur du graphique (px) */
  height?: number
  /** État de chargement */
  loading?: boolean
  /** Message d'erreur */
  error?: string
  /** Callback pour recharger */
  onRetry?: () => void
  /** Callback pour exporter (si non fourni, export CSV interne) */
  onExport?: () => void
  /** Classes additionnelles */
  className?: string
  /** Afficher les valeurs sur les points (pour les petits jeux de données) */
  showValues?: boolean
  /** Angle intérieur pour le donut (0-360) */
  innerRadius?: number
  /** Agrandir en plein écran */
  expandable?: boolean
}

/* ========================================================================== */
/*  Composant ChartCard                                                        */
/* ========================================================================== */

export function ChartCard({
  title,
  description,
  type = 'line',
  data,
  series,
  dataKeyX = 'name',
  height = 300,
  loading = false,
  error,
  onRetry,
  onExport,
  className,
  showValues = false,
  innerRadius = 60,
  expandable = false,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false)

  const exportCSV = useCallback(() => {
    if (onExport) {
      onExport()
      return
    }
    if (!data.length) return
    const keys = [dataKeyX, ...series.map(s => s.dataKey)]
    const headers = keys.map(k => k)
    const rows = data.map(row =>
      keys.map(k => {
        const val = row[k]
        return val !== undefined ? String(val) : ''
      })
    )
    const csvContent = [headers, ...rows]
      .map(r => r.map(c => `"${c}"`).join(','))
      .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, series, dataKeyX, title, onExport])

  // États de la carte
  if (loading) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader>
          <Skeleton variant="text" className="w-48 h-6" shimmer shimmerVariant="gold" />
          <Skeleton variant="text" className="w-32 h-4" shimmer shimmerVariant="gold" />
        </CardHeader>
        <CardContent>
          <Skeleton variant="rectangular" className="w-full rounded-xl" style={{ height }} shimmer shimmerVariant="gold" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle size={32} className="text-red-500 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          {onRetry && (
            <Button variant="outline-gold" size="sm" onClick={onRetry} leftIcon={<RefreshCcw size={14} />}>
              Réessayer
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="text-center">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune donnée disponible</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Styles des tooltips
  const tooltipStyle = {
    backgroundColor: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(201,169,98,0.3)',
    borderRadius: '12px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
    padding: '12px',
    fontSize: '13px',
  }

  // Rendu du graphique selon le type
  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {series.map((s, idx) => (
                  <linearGradient key={s.dataKey} id={`barGrad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.4} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
              <XAxis dataKey={dataKeyX} tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              {series.length > 1 && <Legend />}
              {series.map((s, idx) => (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  fill={`url(#barGrad-${s.dataKey})`}
                  radius={[6, 6, 0, 0]}
                  animationBegin={idx * 100}
                  animationDuration={1200}
                >
                  {showValues && data.length <= 10
                    ? data.map((_, i) => (
                        <Cell key={i} fill={s.color || CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))
                    : null}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {series.map((s, idx) => (
                  <linearGradient key={s.dataKey} id={`areaGrad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
              <XAxis dataKey={dataKeyX} tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              {series.length > 1 && <Legend />}
              {series.map((s, idx) => (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  stroke={s.color || CHART_COLORS[idx % CHART_COLORS.length]}
                  fill={`url(#areaGrad-${s.dataKey})`}
                  strokeWidth={s.strokeWidth || 2}
                  dot={s.dot ?? false}
                  animationBegin={idx * 100}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey={series[0]?.dataKey || 'value'}
                nameKey={dataKeyX}
                cx="50%"
                cy="50%"
                outerRadius={Math.min(height, 300) / 2.5}
                label={showValues ? ({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)` : undefined}
                animationBegin={0}
                animationDuration={1000}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'donut':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey={series[0]?.dataKey || 'value'}
                nameKey={dataKeyX}
                cx="50%"
                cy="50%"
                innerRadius={innerRadius}
                outerRadius={Math.min(height, 300) / 2.5}
                label={showValues ? ({ name, value }) => `${name}: ${value}` : undefined}
                animationBegin={0}
                animationDuration={1000}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'composed':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {series.map((s, idx) => (
                  <linearGradient key={s.dataKey} id={`compGrad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
              <XAxis dataKey={dataKeyX} tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend />
              {series.map((s, idx) => {
                const SeriesComponent = s.type === 'bar' ? Bar : s.type === 'area' ? Area : Line
                return (
                  <SeriesComponent
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    name={s.name || s.dataKey}
                    stroke={s.color || CHART_COLORS[idx % CHART_COLORS.length]}
                    fill={`url(#compGrad-${s.dataKey})`}
                    strokeWidth={s.strokeWidth || 2}
                    dot={s.dot ?? false}
                    animationBegin={idx * 100}
                  />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        )

      case 'line':
      default:
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {series.map((s, idx) => (
                  <linearGradient key={s.dataKey} id={`lineGrad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={s.color || CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,169,98,0.15)" />
              <XAxis dataKey={dataKeyX} tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a8a49b' }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              {series.length > 1 && <Legend />}
              {series.map((s, idx) => (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name || s.dataKey}
                  stroke={s.color || CHART_COLORS[idx % CHART_COLORS.length]}
                  fill={`url(#lineGrad-${s.dataKey})`}
                  strokeWidth={s.strokeWidth || 2}
                  dot={s.dot ?? false}
                  animationBegin={idx * 100}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )
    }
  }

  const chartContent = (
    <>
      {renderChart()}
    </>
  )

  return (
    <>
      <Card className={cn('overflow-hidden', expanded && 'fixed inset-4 z-50 bg-background', className)}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {type === 'bar' && <BarChart3 size={18} className="text-gold-500" />}
              {type === 'area' && <Activity size={18} className="text-gold-500" />}
              {(type === 'pie' || type === 'donut') && <PieChartIcon size={18} className="text-gold-500" />}
              <span>{title}</span>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex gap-1">
            {expandable && (
              <Tooltip content={expanded ? 'Réduire' : 'Plein écran'}>
                <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
                  <Maximize2 size={16} />
                </Button>
              </Tooltip>
            )}
            <Tooltip content="Exporter CSV">
              <Button variant="ghost" size="icon" onClick={exportCSV}>
                <Download size={16} />
              </Button>
            </Tooltip>
            {onRetry && (
              <Tooltip content="Actualiser">
                <Button variant="ghost" size="icon" onClick={onRetry}>
                  <RefreshCcw size={16} />
                </Button>
              </Tooltip>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {chartContent}
        </CardContent>
      </Card>

      {/* Overlay plein écran */}
      {expanded && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setExpanded(false)} />
      )}
    </>
  )
}

/* ========================================================================== */
/*  Sous‑composants prêts à l'emploi                                           */
/* ========================================================================== */

// Alias pratiques pour une utilisation directe
export const LineChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="line" {...props} />
export const BarChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="bar" {...props} />
export const AreaChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="area" {...props} />
export const PieChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="pie" {...props} />
export const DonutChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="donut" {...props} />
export const ComposedChartCard = (props: Omit<ChartCardProps, 'type'>) => <ChartCard type="composed" {...props} />