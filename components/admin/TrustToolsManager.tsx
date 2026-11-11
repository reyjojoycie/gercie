// components/admin/TrustToolsManager.tsx
'use client'

import { useRef, useState } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'

import { Button } from '@/components/ui/Button'

import type { TrustData } from '@/lib/trust'

interface TrustToolsManagerProps {
  data: TrustData
  loading?: boolean
  onImport: (mode: 'replace' | 'merge', payload: any) => Promise<void>
  onReset: () => Promise<void>
}

export function TrustToolsManager({
  data,
  loading,
  onImport,
  onReset,
}: TrustToolsManagerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [jsonText, setJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gercie-trust-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSuccess('Export généré.')
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’export.')
    }
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      setJsonText(String(reader.result || ''))
      setSuccess('Fichier chargé. Tu peux lancer l’import.')
      setError(null)
    }

    reader.onerror = () => {
      setError('Impossible de lire le fichier.')
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  const handleImport = async () => {
    setError(null)
    setSuccess(null)

    if (!jsonText.trim()) {
      setError('Colle un JSON ou charge un fichier.')
      return
    }

    let parsed: any

    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setError('JSON invalide.')
      return
    }

    setImporting(true)

    try {
      await onImport(mode, parsed)
      setSuccess('Import réussi.')
      setJsonText('')
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’import.')
    } finally {
      setImporting(false)
    }
  }

  const handleReset = async () => {
    if (
      !window.confirm(
        'Réinitialiser toutes les données de confiance avec les valeurs par défaut ? Cette action remplacera stats, témoignages et réglages actuels.'
      )
    ) {
      return
    }

    setResetting(true)
    setError(null)
    setSuccess(null)

    try {
      await onReset()
      setSuccess('Données réinitialisées.')
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réinitialisation.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-2 text-base font-bold text-foreground">
          Export JSON
        </h3>

        <p className="mb-4 text-sm text-muted-foreground">
          Télécharge une sauvegarde complète des statistiques, témoignages et réglages.
        </p>

        <Button
          variant="outline-gold"
          onClick={handleExport}
          leftIcon={<Download size={16} />}
        >
          Exporter les données
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-2 text-base font-bold text-foreground">
          Import JSON
        </h3>

        <p className="mb-4 text-sm text-muted-foreground">
          Restaure ou fusionne des données depuis un fichier JSON exporté.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-foreground">Mode</label>

          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as any)}
            className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="replace">Remplacer</option>
            <option value="merge">Fusionner</option>
          </select>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            leftIcon={<Upload size={14} />}
          >
            Charger un fichier
          </Button>
        </div>

        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          rows={10}
          placeholder='{ "stats": [], "testimonials": [], "settings": {} }'
          className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
        />

        <div className="mt-4 flex justify-end">
          <Button
            variant="luxe"
            onClick={handleImport}
            loading={importing}
            leftIcon={<Upload size={16} />}
          >
            Importer
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
        <h3 className="mb-2 text-base font-bold text-red-700 dark:text-red-300">
          Réinitialisation
        </h3>

        <p className="mb-4 text-sm text-red-700/90 dark:text-red-300/90">
          Restaure les statistiques, témoignages et réglages par défaut.
        </p>

        <Button
          variant="danger"
          onClick={handleReset}
          loading={resetting}
          leftIcon={<RotateCcw size={16} />}
        >
          Réinitialiser aux valeurs par défaut
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {success}
        </div>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">
          Chargement des outils...
        </p>
      )}
    </div>
  )
}