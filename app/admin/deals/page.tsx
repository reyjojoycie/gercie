'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import Link from 'next/link'
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
  Plus, Pencil, Trash2, Tag, Percent, Clock, Package,
  AlertTriangle, RefreshCw, Search, ChevronLeft, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Promotion {
  id: string
  produit_id: string
  produit_nom?: string
  prix_promo: number
  prix_normal?: number
  date_debut: string
  date_fin: string
  actif: boolean
  created_at: string
}

export default function AdminPromotionsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [form, setForm] = useState({
    produit_id: '',
    prix_promo: 0,
    date_debut: '',
    date_fin: '',
    actif: true,
  })

  const { data: promotionsData, isLoading, isError, refetch } = useQuery<Promotion[]>({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promotions')
      if (!res.ok) throw new Error('Erreur')
      return res.json()
    },
  })

  const promotions = Array.isArray(promotionsData) ? promotionsData : []

  const filtered = promotions.filter(p =>
    p.produit_nom?.toLowerCase().includes(search.toLowerCase())
  )

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editing
        ? `/api/admin/promotions/${editing.id}`
        : '/api/admin/promotions'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      setEditing(null)
      setCreating(false)
      toast.addToast({ type: 'success', message: 'Promotion enregistrée' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })
      toast.addToast({ type: 'success', message: 'Promotion supprimée' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const openCreate = () => {
    setForm({ produit_id: '', prix_promo: 0, date_debut: '', date_fin: '', actif: true })
    setCreating(true)
  }

  const openEdit = (p: Promotion) => {
    setEditing(p)
    setForm({
      produit_id: p.produit_id,
      prix_promo: p.prix_promo,
      date_debut: p.date_debut.slice(0, 16),
      date_fin: p.date_fin.slice(0, 16),
      actif: p.actif,
    })
  }

  const handleSave = () => {
    if (!form.produit_id || !form.prix_promo || !form.date_debut || !form.date_fin) {
      toast.addToast({ type: 'error', message: 'Tous les champs sont requis' })
      return
    }
    saveMutation.mutate(form)
  }

  return (
    <Container>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold font-serif">Promotions & Offres éclair</h1>
        <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Nouvelle promotion</Button>
      </div>

      <div className="flex gap-4 mb-4">
        <Input
          placeholder="Rechercher par produit..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          onClear={() => setSearch('')}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner variant="premium" size="lg" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center py-12 gap-4">
          <AlertTriangle size={48} className="text-red-500" />
          <Button variant="outline-gold" onClick={() => refetch()}>
            <RefreshCw size={16} className="mr-1" /> Réessayer
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="glass"><CardContent className="text-center py-8 text-muted-foreground">Aucune promotion trouvée.</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map(promo => (
            <motion.div key={promo.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card variant="glass" className="border-l-4 border-l-amber-400">
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/20">
                      <Tag size={20} className="text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{promo.produit_nom || 'Produit inconnu'}</span>
                        <Badge variant={promo.actif ? 'accent' : 'danger'}>
                          {promo.actif ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="line-through mr-2">{promo.prix_normal?.toLocaleString()} FC</span>
                        <span className="font-bold text-amber-600">{promo.prix_promo.toLocaleString()} FC</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock size={12} />
                        {format(new Date(promo.date_debut), 'Pp', { locale: fr })} → {format(new Date(promo.date_fin), 'Pp', { locale: fr })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip content="Modifier"><Button variant="ghost" size="sm" onClick={() => openEdit(promo)}><Pencil size={16} /></Button></Tooltip>
                    <Tooltip content="Supprimer"><Button variant="ghost" size="sm" onClick={() => { if (confirm('Supprimer cette promotion ?')) deleteMutation.mutate(promo.id) }} className="text-red-500"><Trash2 size={16} /></Button></Tooltip>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal création/édition */}
      <Modal
        isOpen={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null) }}
        title={editing ? 'Modifier la promotion' : 'Nouvelle promotion'}
        size="md"
        accent="gold"
      >
        <div className="space-y-4">
          <Input
            label="ID du produit"
            value={form.produit_id}
            onChange={e => setForm({ ...form, produit_id: e.target.value })}
            placeholder="UUID du produit"
            disabled={!!editing}
          />
          <Input
            label="Prix promotionnel (FC)"
            type="number"
            value={form.prix_promo}
            onChange={e => setForm({ ...form, prix_promo: parseFloat(e.target.value) || 0 })}
          />
          <Input
            label="Début"
            type="datetime-local"
            value={form.date_debut}
            onChange={e => setForm({ ...form, date_debut: e.target.value })}
          />
          <Input
            label="Fin"
            type="datetime-local"
            value={form.date_fin}
            onChange={e => setForm({ ...form, date_fin: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.actif}
              onChange={e => setForm({ ...form, actif: e.target.checked })}
              id="actif"
            />
            <label htmlFor="actif" className="text-sm">Actif</label>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="luxe" fullWidth onClick={handleSave} loading={saveMutation.isPending}>
              {editing ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button variant="outline" fullWidth onClick={() => { setCreating(false); setEditing(null) }}>Annuler</Button>
          </div>
        </div>
      </Modal>

      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}