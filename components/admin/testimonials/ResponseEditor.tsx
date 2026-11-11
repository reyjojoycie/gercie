// components/admin/testimonials/ResponseEditor.tsx
'use client'

import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface ResponseTemplate {
  id: string
  label: string
  content: string
}

interface ResponseEditorProps {
  initialResponse?: string
  testimonialText?: string
  clientName?: string
  templates?: ResponseTemplate[]
  onSave: (response: string) => Promise<void> | void
  onCancel: () => void
  isSaving?: boolean
  onSaved?: () => void
}

export function ResponseEditor({
  initialResponse = '',
  testimonialText = '',
  clientName = 'client',
  templates = [],
  onSave,
  onCancel,
  isSaving,
  onSaved,
}: ResponseEditorProps) {
  const [response, setResponse] = useState(initialResponse)
  const [error, setError] = useState<string | null>(null)

  const applyTemplate = (content: string) => {
    const filled = content
      .replace(/{clientName}/g, clientName)
      .replace(/{testimonial}/g, testimonialText)

    setResponse(filled)
  }

  const handleSubmit = async () => {
    setError(null)

    const trimmed = response.trim()

    if (!trimmed) {
      setError('La réponse ne peut pas être vide.')
      return
    }

    try {
      await onSave(trimmed)
      onSaved?.()
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la réponse.')
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {testimonialText && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Avis client
          </p>
          <p className="text-sm italic text-muted-foreground">
            « {testimonialText} »
          </p>
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTemplate(template.content)}
              className={cn(
                'rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition',
                'hover:border-gold-400/50 hover:text-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500'
              )}
            >
              {template.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageSquare size={14} />
          Réponse publique
        </label>

        <textarea
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          rows={5}
          placeholder="Rédige ta réponse à ce client..."
          className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>

        <Button
          variant="luxe"
          onClick={handleSubmit}
          loading={isSaving}
          leftIcon={<Send size={14} />}
        >
          Publier la réponse
        </Button>
      </div>
    </div>
  )
}