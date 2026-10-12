// components/ProductReviewSummary.tsx
'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, MessageSquareText } from 'lucide-react'

interface Props {
  productId: string
}

export default function ProductReviewSummary({ productId }: Props) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    const fetchSummary = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/ai/product-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        })
        if (!cancelled && res.ok) {
          const data = await res.json()
          setSummary(data.summary)
        }
      } catch (err) {
        // silencieux
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchSummary()
    return () => { cancelled = true }
  }, [productId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 size={14} className="animate-spin" /> Analyse des avis en cours...
      </div>
    )
  }

  if (!summary) return null

  return (
    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 my-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareText size={18} className="text-purple-600" />
        <span className="font-semibold text-sm text-purple-800 dark:text-purple-200">Résumé des avis</span>
        <Sparkles size={14} className="text-purple-500" />
      </div>
      <p className="text-sm text-neutral-700 dark:text-neutral-300">{summary}</p>
    </div>
  )
}