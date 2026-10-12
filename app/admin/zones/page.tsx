'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Globe, MapPin, Building2, Plus, Power, PowerOff, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */
interface Province { id: string; nom: string; actif: boolean }
interface Ville { id: string; nom: string; province_id: string; actif: boolean }
interface Commune { id: string; nom: string; ville_id: string; actif: boolean }

/* ========================================================================== */
/*  Page                                                                       */
/* ========================================================================== */
export default function AdminZonesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'provinces' | 'villes' | 'communes'>('provinces')
  const [newProvince, setNewProvince] = useState('')
  const [newVille, setNewVille] = useState({ nom: '', province_id: '' })
  const [newCommune, setNewCommune] = useState({ nom: '', ville_id: '' })

  // --- Queries ---
  const { data: provinces, isLoading: loadingProvinces } = useQuery<Province[]>({
    queryKey: ['admin-provinces'],
    queryFn: async () => (await fetch('/api/admin/provinces')).json()
  })

  const { data: villes, isLoading: loadingVilles } = useQuery<Ville[]>({
    queryKey: ['admin-villes'],
    queryFn: async () => (await fetch('/api/admin/villes')).json()
  })

  const { data: communes, isLoading: loadingCommunes } = useQuery<Commune[]>({
    queryKey: ['admin-communes'],
    queryFn: async () => (await fetch('/api/admin/communes')).json()
  })

  // --- Mutations ---
  const toggleActif = (type: string, id: string, actif: boolean) => {
    fetch(`/api/admin/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, actif: !actif })
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: [`admin-${type}`] })
      toast.addToast({ type: 'success', message: `${type} mis à jour` })
    })
  }

  const addItem = (type: string, body: any) => {
    fetch(`/api/admin/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(res => res.json()).then(() => {
      queryClient.invalidateQueries({ queryKey: [`admin-${type}`] })
      toast.addToast({ type: 'success', message: `${type} ajouté` })
    }).catch(() => toast.addToast({ type: 'error', message: 'Erreur' }))
  }

  const deleteItem = (type: string, id: string) => {
    fetch(`/api/admin/${type}?id=${id}`, { method: 'DELETE' })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: [`admin-${type}`] })
        toast.addToast({ type: 'success', message: `${type} supprimé` })
      })
  }

  // --- Rendering helpers ---
  const renderItem = (item: any, type: string, extra?: string) => (
    <div key={item.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
      <div>
        <span className={item.actif ? 'font-medium' : 'line-through text-muted-foreground'}>{item.nom}</span>
        {extra && <span className="text-xs text-muted-foreground ml-2">({extra})</span>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => toggleActif(type, item.id, item.actif)}
          className={`p-1.5 rounded-lg transition ${item.actif ? 'text-green-500 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'}`}
          title={item.actif ? 'Désactiver' : 'Activer'}
        >
          {item.actif ? <Power size={16} /> : <PowerOff size={16} />}
        </button>
        <button
          onClick={() => deleteItem(type, item.id)}
          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition"
          title="Supprimer"
        >
          <Plus size={16} className="rotate-45" />
        </button>
      </div>
    </div>
  )

  // --- Main ---
  const tabs = [
    { key: 'provinces', label: 'Provinces', icon: <Globe size={16} /> },
    { key: 'villes', label: 'Villes', icon: <MapPin size={16} /> },
    { key: 'communes', label: 'Communes', icon: <Building2 size={16} /> },
  ]

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold font-serif mb-2">Zones de livraison</h1>
        <p className="text-muted-foreground mb-8">Gérez les provinces, villes et communes disponibles pour la livraison.</p>

        {/* Onglets personnalisés */}
        <div className="flex gap-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition border ${
                activeTab === tab.key
                  ? 'bg-gold-500 text-white border-gold-500 shadow-gold'
                  : 'bg-card border-border text-muted-foreground hover:border-gold-400'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenu des onglets */}
        {activeTab === 'provinces' && (
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Provinces ({provinces?.length || 0})</CardTitle>
              <CardDescription>Activez/désactivez une province pour la rendre disponible ou non à la livraison.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="Nouvelle province" value={newProvince} onChange={(e) => setNewProvince(e.target.value)} />
                <Button variant="luxe" size="sm" onClick={() => { addItem('provinces', { nom: newProvince }); setNewProvince('') }}>Ajouter</Button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadingProvinces ? <Spinner /> : provinces?.map(p => renderItem(p, 'provinces'))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'villes' && (
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Villes ({villes?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="Nom de la ville" value={newVille.nom} onChange={(e) => setNewVille({ ...newVille, nom: e.target.value })} />
                <select
                  value={newVille.province_id}
                  onChange={(e) => setNewVille({ ...newVille, province_id: e.target.value })}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <option value="">Province</option>
                  {provinces?.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
                <Button variant="luxe" size="sm" onClick={() => { addItem('villes', newVille); setNewVille({ nom: '', province_id: '' }) }}>Ajouter</Button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadingVilles ? <Spinner /> : villes?.map(v => {
                  const prov = provinces?.find(p => p.id === v.province_id)
                  return renderItem(v, 'villes', prov?.nom)
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'communes' && (
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Communes ({communes?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="Nom de la commune" value={newCommune.nom} onChange={(e) => setNewCommune({ ...newCommune, nom: e.target.value })} />
                <select
                  value={newCommune.ville_id}
                  onChange={(e) => setNewCommune({ ...newCommune, ville_id: e.target.value })}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <option value="">Ville</option>
                  {villes?.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
                </select>
                <Button variant="luxe" size="sm" onClick={() => { addItem('communes', newCommune); setNewCommune({ nom: '', ville_id: '' }) }}>Ajouter</Button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loadingCommunes ? <Spinner /> : communes?.map(c => {
                  const ville = villes?.find(v => v.id === c.ville_id)
                  return renderItem(c, 'communes', ville?.nom)
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </Container>
  )
}