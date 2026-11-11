// features/admin/produits/hooks/use-product-draft.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { ProductAdminMode, DraftProduct } from '../types'
import {
  getProductDraftStorageKey,
  readProductDraft,
  writeProductDraft,
  removeProductDraft,
  safeLocalStorageGet,
  safeLocalStorageSet,
  PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY,
  PRODUCT_AUTO_SAVE_INTERVAL_MS,
} from '../lib/product-utils'

export interface UseProductDraftOptions {
  mode: ProductAdminMode
  productId?: string | null
  getValues: () => any
  dirty: boolean
  enabled?: boolean
}

export function useProductDraft(options: UseProductDraftOptions) {
  const { mode, productId, getValues, dirty, enabled = true } = options
  const toast = useToast()

  const storageKey = getProductDraftStorageKey(mode, productId)

  const [draftExists, setDraftExists] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [autoSave, setAutoSave] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  /* ---------------------------------------------------------- */
  /* Charger préférence auto-save                                */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    const saved = safeLocalStorageGet<boolean>(
      PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY,
      false
    )
    setAutoSave(saved)
  }, [])

  const toggleAutoSave = useCallback(() => {
    setAutoSave((prev) => {
      const next = !prev
      safeLocalStorageSet(PRODUCT_AUTO_SAVE_ENABLED_STORAGE_KEY, next)
      return next
    })
  }, [])

  /* ---------------------------------------------------------- */
  /* Détecter brouillon existant                                 */
  /* ---------------------------------------------------------- */
  const detectDraft = useCallback((): DraftProduct | null => {
    const draft = readProductDraft<DraftProduct>(storageKey)
    if (draft) {
      setDraftExists(true)
      setShowDraftBanner(true)
      setLastSavedAt(draft._saved_at || null)
    }
    return draft
  }, [storageKey])

  /* ---------------------------------------------------------- */
  /* Sauvegarder brouillon                                       */
  /* ---------------------------------------------------------- */
  const saveDraft = useCallback(
    (showToast = true) => {
      if (!enabled) return
      const values = getValues()
      if (!values || Object.keys(values).length === 0) {
        if (showToast) {
          toast.addToast({
            type: 'error',
            message: 'Aucune donnée à sauvegarder.',
          })
        }
        return
      }
      const payload: DraftProduct = {
        ...values,
        _saved_at: new Date().toISOString(),
      }
      const ok = writeProductDraft(storageKey, payload)
      if (ok) {
        setDraftExists(true)
        setLastSavedAt(payload._saved_at)
        if (showToast) {
          toast.addToast({
            type: 'success',
            message: 'Brouillon enregistré localement.',
          })
        }
      } else if (showToast) {
        toast.addToast({
          type: 'error',
          message: 'Impossible d\'enregistrer le brouillon.',
        })
      }
    },
    [enabled, getValues, storageKey, toast]
  )

  /* ---------------------------------------------------------- */
  /* Restaurer brouillon                                         */
  /* ---------------------------------------------------------- */
  const restoreDraft = useCallback((): DraftProduct | null => {
    const draft = readProductDraft<DraftProduct>(storageKey)
    if (!draft) {
      toast.addToast({ type: 'error', message: 'Aucun brouillon trouvé.' })
      return null
    }
    setDraftRestored(true)
    setShowDraftBanner(false)
    toast.addToast({ type: 'info', message: 'Brouillon local restauré.' })
    return draft
  }, [storageKey, toast])

  /* ---------------------------------------------------------- */
  /* Ignorer brouillon                                           */
  /* ---------------------------------------------------------- */
  const ignoreDraft = useCallback(() => {
    setShowDraftBanner(false)
  }, [])

  /* ---------------------------------------------------------- */
  /* Supprimer brouillon                                         */
  /* ---------------------------------------------------------- */
  const discardDraft = useCallback(() => {
    removeProductDraft(storageKey)
    setDraftExists(false)
    setDraftRestored(false)
    setShowDraftBanner(false)
    setLastSavedAt(null)
    toast.addToast({ type: 'info', message: 'Brouillon supprimé.' })
  }, [storageKey, toast])

  /* ---------------------------------------------------------- */
  /* Auto-save périodique                                        */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!autoSave || !dirty || !enabled) return
    const interval = setInterval(() => {
      saveDraft(false)
    }, PRODUCT_AUTO_SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoSave, dirty, enabled, saveDraft])

  /* ---------------------------------------------------------- */
  /* Comparer brouillon vs serveur                               */
  /* ---------------------------------------------------------- */
  const draftIsNewerThan = useCallback(
    (serverUpdatedAt?: string): boolean => {
      const draft = readProductDraft<DraftProduct>(storageKey)
      if (!draft?._saved_at) return false
      const draftTime = new Date(draft._saved_at).getTime()
      const serverTime = serverUpdatedAt
        ? new Date(serverUpdatedAt).getTime()
        : 0
      return draftTime > serverTime
    },
    [storageKey]
  )

  return {
    storageKey,
    draftExists,
    draftRestored,
    showDraftBanner,
    autoSave,
    lastSavedAt,
    toggleAutoSave,
    detectDraft,
    saveDraft,
    restoreDraft,
    ignoreDraft,
    discardDraft,
    draftIsNewerThan,
    setDraftRestored,
    setShowDraftBanner,
  }
}