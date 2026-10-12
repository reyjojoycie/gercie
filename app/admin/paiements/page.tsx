'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import {
  Pencil,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

interface MoyenPaiement {
  id: string
  nom: string
  code: string
  logo_url: string | null
  actif: boolean
  instructions: string
  ordre: number
  type: 'wallet' | 'card' | 'mobile_money'
}

const TYPE_OPTIONS = [
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'card', label: 'Carte bancaire' },
]

export default function AdminPaiementsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [editing, setEditing] = useState<MoyenPaiement | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{
    nom: string
    code: string
    type: 'wallet' | 'card' | 'mobile_money'
    logo_url: string
    instructions: string
    ordre: number
  }>({
    nom: '',
    code: '',
    type: 'mobile_money',
    logo_url: '',
    instructions: '',
    ordre: 0,
  })

  const {
    data: moyensData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MoyenPaiement[]>({
    queryKey: ['admin-moyens-paiement'],
    queryFn: async () => {
  const res = await fetch('/api/admin/moyens-paiement')
  const json = await res.json()
  if (!res.ok) {
    // Message personnalisé pour l'accès refusé
    if (res.status === 403) {
      throw new Error("Vous n'êtes pas administrateur. Vérifiez votre rôle dans la base de données.")
    }
    throw new Error(json.error || 'Erreur inconnue')
  }
  return Array.isArray(json) ? json : []
}
  })

  const moyens = Array.isArray(moyensData) ? moyensData : []

  const toggleMutation = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      await fetch(`/api/admin/moyens-paiement/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !actif }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message || 'Erreur lors du basculement' }),
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editing
        ? `/api/admin/moyens-paiement/${editing.id}`
        : '/api/admin/moyens-paiement'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      setEditing(null)
      setCreating(false)
      toast.addToast({ type: 'success', message: 'Enregistrement réussi' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/moyens-paiement/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-moyens-paiement'] })
      toast.addToast({ type: 'success', message: 'Supprimé' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message || 'Erreur suppression' }),
  })

  const openCreate = () => {
    setCreating(true)
    setForm({ nom: '', code: '', type: 'mobile_money', logo_url: '', instructions: '', ordre: 0 })
  }

  const openEdit = (m: MoyenPaiement) => {
    setEditing(m)
    setForm({
      nom: m.nom,
      code: m.code,
      type: m.type,
      logo_url: m.logo_url || '',
      instructions: m.instructions || '',
      ordre: m.ordre || 0,
    })
  }

  const handleSave = () => {
    if (!form.nom || !form.code) {
      toast.addToast({ type: 'error', message: 'Le nom et le code sont requis' })
      return
    }
    saveMutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner variant="premium" size="lg" label="Chargement des moyens de paiement..." />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertTriangle size={48} className="text-red-500" />
        <p className="text-red-500 text-center max-w-md">
          {(error as Error)?.message || 'Impossible de charger les moyens de paiement.'}
        </p>
        <Button variant="outline-gold" onClick={() => refetch()}>
          <RefreshCw size={16} className="mr-1" /> Réessayer
        </Button>
      </div>
    )
  }

  return (
    <Container>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold font-serif">Moyens de paiement</h1>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1" /> Ajouter
        </Button>
      </div>

      <div className="grid gap-4">
        {moyens.length === 0 && (
          <Card variant="glass">
            <CardContent className="text-center py-8 text-muted-foreground">
              Aucun moyen de paiement pour le moment.
            </CardContent>
          </Card>
        )}
        {moyens.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card variant="glass" className="border-gold-400/20">
              <CardContent className="flex items-center justify-between p-4 flex-wrap gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {m.logo_url && (
                    <img
                      src={m.logo_url}
                      alt={m.nom}
                      className="w-10 h-10 object-contain rounded"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{m.nom}</p>
                      <Badge variant={m.actif ? 'accent' : 'danger'}>
                        {m.actif ? 'Actif' : 'Inactif'}
                      </Badge>
                      <Badge variant="neutral" size="sm">
                        {TYPE_OPTIONS.find((t) => t.value === m.type)?.label || m.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">Code : {m.code}</p>
                    {m.instructions && (
                      <p className="text-xs text-muted-foreground truncate">
                        Instructions : {m.instructions}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Tooltip content={m.actif ? 'Désactiver' : 'Activer'}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: m.id, actif: m.actif })}
                      disabled={toggleMutation.isPending}
                    >
                      {m.actif ? (
                        <ToggleRight className="text-green-500" size={24} />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                    </Button>
                  </Tooltip>
                  <Tooltip content="Modifier">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                      <Pencil size={16} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Supprimer">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Supprimer ${m.nom} ?`)) deleteMutation.mutate(m.id)
                      }}
                      disabled={deleteMutation.isPending}
                      className="text-red-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Modal création/édition */}
      <Modal
        isOpen={!!editing || creating}
        onClose={() => { setEditing(null); setCreating(false) }}
        title={editing ? 'Modifier le moyen de paiement' : 'Nouveau moyen de paiement'}
        size="md"
        accent="gold"
      >
        <div className="space-y-4">
          <Input
            label="Nom affiché"
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            placeholder="ex: Airtel Money"
          />
          <Input
            label="Code unique"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="ex: airtel_money"
            disabled={!!editing}
          />
          <div>
            <label className="text-sm font-medium mb-1 block">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="w-full border border-border rounded-xl px-3 py-2 bg-card text-sm"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="URL du logo"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://example.com/logo.png"
          />
          <Input
            label="Instructions"
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="ex: Composez le *123# pour confirmer"
          />
          <Input
            label="Ordre d'affichage"
            type="number"
            value={form.ordre}
            onChange={(e) => setForm({ ...form, ordre: parseInt(e.target.value) || 0 })}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="luxe" fullWidth onClick={handleSave} loading={saveMutation.isPending}>
              {editing ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button variant="outline" fullWidth onClick={() => { setEditing(null); setCreating(false) }}>
              Annuler
            </Button>
          </div>
          {editing && (
            <div className="text-center">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Supprimer définitivement ?')) {
                    deleteMutation.mutate(editing.id)
                    setEditing(null)
                  }
                }}
                loading={deleteMutation.isPending}
              >
                <Trash2 size={14} className="mr-1" /> Supprimer ce moyen
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}