// components/admin/testimonials/ResponseEditor.tsx
'use client'

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Link,
  List,
  Eye,
  Edit3,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
export interface ResponseTemplate {
  id: string
  label: string
  content: string
}

interface ResponseEditorProps {
  /** Réponse existante (pour édition) */
  initialResponse?: string
  /** Témoignage auquel on répond (pour affichage en rappel) */
  testimonialText?: string
  /** Nom du client (pour personnalisation) */
  clientName?: string
  /** Templates de réponse disponibles */
  templates?: ResponseTemplate[]
  /** Limite de caractères (défaut 1000) */
  maxLength?: number
  /** Fonction de sauvegarde asynchrone (reçoit le texte de la réponse) */
  onSave: (response: string) => Promise<void> | void
  /** Fonction d'annulation (fermeture) */
  onCancel: () => void
  /** Indique si une sauvegarde est en cours */
  isSaving?: boolean
  /** Message d'erreur éventuel */
  errorMessage?: string
  /** Callback après sauvegarde réussie */
  onSaved?: () => void
}

/* ========================================================================== */
/*  Sous‑composants internes                                                   */
/* ========================================================================== */

/** Convertit un texte avec balises Markdown simples en HTML pour prévisualisation */
function markdownToHtml(text: string): string {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-gold-500 underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
  // Wrapping des <li> dans <ul> s'il y en a
  if (html.includes('<li>')) {
    html = '<ul class="list-disc pl-4 space-y-1">' + html.replace(/<li>/g, '<li class="ml-2">') + '</ul>'
  }
  return html
}

/** Barre d'outils pour insertion Markdown */
function Toolbar({
  onInsert
}: {
  onInsert: (before: string, after?: string) => void
}) {
  const buttons = [
    { icon: Bold, label: 'Gras', before: '**', after: '**' },
    { icon: Italic, label: 'Italique', before: '*', after: '*' },
    { icon: Link, label: 'Lien', before: '[', after: '](url)' },
    { icon: List, label: 'Liste', before: '- ' }
  ]

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 rounded-t-xl border border-border border-b-0">
      {buttons.map(({ icon: Icon, label, before, after }) => (
        <Tooltip key={label} content={label}>
          <button
            type="button"
            onClick={() => onInsert(before, after || '')}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-gold-400/10 hover:text-gold-500 transition-colors"
            aria-label={label}
          >
            <Icon size={16} />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

/** Prévisualisation HTML */
function Preview({ content }: { content: string }) {
  const html = markdownToHtml(content)
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none bg-background rounded-xl border border-border p-4 min-h-[120px]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* ========================================================================== */
/*  Composant principal                                                        */
/* ========================================================================== */
export function ResponseEditor({
  initialResponse = '',
  testimonialText,
  clientName,
  templates,
  maxLength = 1000,
  onSave,
  onCancel,
  isSaving = false,
  errorMessage,
  onSaved
}: ResponseEditorProps) {
  const [response, setResponse] = useState(initialResponse)
  const [previewMode, setPreviewMode] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Synchroniser si la réponse initiale change (cas édition)
  useEffect(() => {
    setResponse(initialResponse)
  }, [initialResponse])

  // Insérer du markdown autour de la sélection
  const insertMarkdown = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = response.substring(start, end)
      const newText =
        response.substring(0, start) +
        before +
        selectedText +
        after +
        response.substring(end)
      setResponse(newText)
      // Rétablir le focus et la position du curseur
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(
          start + before.length,
          start + before.length + selectedText.length
        )
      }, 0)
    },
    [response]
  )

  // Appliquer un template
  const applyTemplate = (template: ResponseTemplate) => {
    let content = template.content
    if (clientName) {
      content = content.replace(/\{clientName\}/g, clientName)
    }
    setResponse(content)
  }

  // Validation
  const validate = (): boolean => {
    if (!response.trim()) {
      setValidationError('La réponse ne peut pas être vide.')
      return false
    }
    if (response.length > maxLength) {
      setValidationError(`Maximum ${maxLength} caractères.`)
      return false
    }
    setValidationError(null)
    return true
  }

  // Soumission
  const handleSave = async () => {
    if (!validate()) return
    await onSave(response.trim())
    onSaved?.()
  }

  // Raccourci clavier
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      {/* Rappel du témoignage */}
      {testimonialText && (
        <div className="bg-gold-50 dark:bg-gold-900/10 border border-gold-400/20 rounded-xl p-3 text-sm text-muted-foreground">
          <p className="font-medium text-gold-700 dark:text-gold-300 mb-1">
            Réponse à {clientName || 'ce client'}
          </p>
          <p className="italic">« {testimonialText} »</p>
        </div>
      )}

      {/* Templates */}
      {templates && templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">Templates :</span>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="text-xs px-2.5 py-1 rounded-full bg-card border border-border hover:bg-gold-400/10 hover:border-gold-400/50 transition"
            >
              <FileText size={12} className="inline mr-1" />
              {tpl.label}
            </button>
          ))}
        </div>
      )}

      {/* Éditeur / Prévisualisation */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Votre réponse</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={cn(
                'text-xs flex items-center gap-1 px-2 py-1 rounded-lg border transition',
                previewMode
                  ? 'bg-gold-400/10 border-gold-400/30 text-gold-600'
                  : 'bg-card border-border text-muted-foreground hover:text-gold-500'
              )}
            >
              {previewMode ? (
                <>
                  <Edit3 size={12} /> Éditer
                </>
              ) : (
                <>
                  <Eye size={12} /> Aperçu
                </>
              )}
            </button>
          </div>
        </div>

        {previewMode ? (
          <Preview content={response} />
        ) : (
          <>
            <Toolbar onInsert={insertMarkdown} />
            <textarea
              ref={textareaRef}
              value={response}
              onChange={(e) => {
                setResponse(e.target.value)
                setValidationError(null) // efface l'erreur dès que l'utilisateur tape
              }}
              onKeyDown={handleKeyDown}
              rows={6}
              maxLength={maxLength}
              className={cn(
                'w-full bg-background border border-border rounded-b-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/50 resize-y',
                validationError ? 'border-red-500 focus:ring-red-400/50' : ''
              )}
              placeholder="Rédigez votre réponse publique..."
            />
          </>
        )}

        {/* Compteur et erreurs */}
        <div className="flex justify-between items-center mt-1">
          {validationError ? (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} /> {validationError}
            </p>
          ) : (
            <span />
          )}
          <span
            className={cn(
              'text-xs',
              response.length > maxLength ? 'text-red-500' : 'text-muted-foreground'
            )}
          >
            {response.length}/{maxLength}
          </span>
        </div>
      </div>

      {/* Message d'erreur global (venant du parent) */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-400/30 rounded-xl p-3 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !!validationError}
          className="bg-gold-500 hover:bg-gold-600 text-white min-w-[120px] justify-center"
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin mr-1" /> Enregistrement...
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="mr-1" /> Publier la réponse
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-right">
        Ctrl+Enter pour enregistrer
      </p>
    </motion.div>
  )
}

export default ResponseEditor