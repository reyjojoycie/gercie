// components/admin/GenerateDescriptionButton.tsx
'use client'

import { useState } from 'react'
import { BrainCircuit, Loader2, Check, X } from 'lucide-react'

interface GenerateDescriptionButtonProps {
  productName: string
  category?: string
  attributes?: string
  onGenerated: (description: string) => void
  className?: string
}

export default function GenerateDescriptionButton({
  productName,
  category,
  attributes,
  onGenerated,
  className = '',
}: GenerateDescriptionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!productName.trim()) {
      setError('Le nom du produit est requis.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/admin/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, category, attributes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur de génération')
      const generated = data.description || ''
      if (!generated) throw new Error('Description vide.')
      setPreview(generated)
      onGenerated(generated)
    } catch (err: any) {
      setError(err.message)
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !productName.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium shadow-md hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
          {loading ? 'Génération...' : 'Générer description IA'}
        </button>
        {preview && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check size={14} /> Générée
          </span>
        )}
      </div>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg flex items-center gap-2">
          <X size={14} /> {error}
        </div>
      )}
      {preview && (
        <div className="relative bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-200 max-h-32 overflow-y-auto italic">
          {preview}
        </div>
      )}
    </div>
  )
}