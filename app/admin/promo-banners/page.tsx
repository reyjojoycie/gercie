'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Container } from '@/components/layout/Container'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { ScrollToTop } from '@/components/ui/ScrollToTop'
import { Save, Plus, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Megaphone } from 'lucide-react'

interface PromoBanner {
  id: string
  message: string
  lien: string | null
  ordre: number
  actif: boolean
  date_debut: string | null
  date_fin: string | null
}

export default function AdminPromoBannersPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [items, setItems] = useState<PromoBanner[]>([])

  // Récupération des données depuis l'API
  const { data: banners, isLoading } = useQuery<PromoBanner[]>({
    queryKey: ['admin-promo-banners'],
    queryFn: () => fetch('/api/admin/promo-banners').then(r => r.json()),
  })

  // Synchronisation sécurisée des données
  useEffect(() => { 
    if (banners && Array.isArray(banners)) {
      setItems([...banners].sort((a, b) => a.ordre - b.ordre)) 
    } else if (banners) {
      console.error("L'API n'a pas retourné un tableau valide :", banners)
      setItems([])
    }
  }, [banners])

  // Mutation pour la mise à jour des bannières existantes
  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<PromoBanner>[]) => {
      const response = await fetch('/api/admin/promo-banners', {
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Erreur lors de la mise à jour')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-promo-banners'] })
      toast.addToast({ type: 'success', message: 'Configurations enregistrées avec succès !' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  // Ajouter un nouvel élément localement (id commence par temp-)
  const addBanner = () => {
    const newBanner: PromoBanner = {
      id: `temp-${crypto.randomUUID()}`, 
      message: '',
      lien: null,
      ordre: items.length + 1,
      actif: true,
      date_debut: null,
      date_fin: null,
    }
    setItems(prev => [...prev, newBanner])
  }

  // Modifier un champ localement
  const updateItem = (id: string, field: keyof PromoBanner, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  // Réordonner les bannières
  const moveItem = (index: number, dir: 'up' | 'down') => {
    const newItems = [...items]
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= newItems.length) return
    ;[newItems[index], newItems[target]] = [newItems[target], newItems[index]]
    newItems.forEach((item, i) => item.ordre = i + 1)
    setItems(newItems)
  }

  // Sauvegarde globale (PUT pour les existants, POST individuels pour les nouveaux)
  const handleSave = async () => {
    const existing = items.filter(i => !i.id.startsWith('temp-'))
    const newOnes = items.filter(i => i.id.startsWith('temp-'))

    // 1. Sauvegarde en masse des existants
    if (existing.length > 0) {
      saveMutation.mutate(existing.map(({ id, message, lien, ordre, actif, date_debut, date_fin }) => ({
        id, message, lien, ordre, actif, date_debut, date_fin,
      })))
    }

    // 2. Création individuelle des nouveaux
    if (newOnes.length > 0) {
      try {
        const creationPromises = newOnes.map(async (banner) => {
          // On retire l'id temporaire "temp-..." pour laisser Supabase en générer un vrai
          const { id, ...payload } = banner
          const response = await fetch('/api/admin/promo-banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!response.ok) throw new Error('Erreur de création d’une nouvelle bannière')
        })

        await Promise.all(creationPromises)
        queryClient.invalidateQueries({ queryKey: ['admin-promo-banners'] })
        if (existing.length === 0) {
          toast.addToast({ type: 'success', message: 'Nouvelles bannières créées !' })
        }
      } catch (err: any) {
        toast.addToast({ type: 'error', message: err.message || 'Erreur lors de la création' })
      }
    }
  }

  if (isLoading) return <Spinner size="lg" variant="premium" />

  return (
    <Container className="py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
            <Megaphone size={26} className="text-amber-500" /> Bannières promotionnelles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les messages défilants et les bandeaux d’informations du site.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addBanner} variant="outline">
            <Plus size={16} className="mr-1" /> Ajouter une bannière
          </Button>
          <Button variant="luxe" onClick={handleSave} loading={saveMutation.isPending}>
            <Save size={16} className="mr-1" /> Enregistrer
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {items.length === 0 ? (
          <Card variant="glass" className="p-8 text-center text-muted-foreground">
            Aucune bannière active. Cliquez sur "Ajouter une bannière" pour commencer.
          </Card>
        ) : (
          items.map((banner, idx) => (
            <Card key={banner.id} variant="glass">
              <CardContent className="flex items-center gap-4 p-4 flex-wrap md:flex-nowrap">
                <div className="flex-1 space-y-3 min-w-0">
                  <Input
                    label="Message affiché"
                    value={banner.message}
                    onChange={e => updateItem(banner.id, 'message', e.target.value)}
                    placeholder="Livraison offerte dès 50$ d'achat !"
                  />
                  <Input
                    label="Lien de redirection (optionnel)"
                    value={banner.lien || ''}
                    onChange={e => updateItem(banner.id, 'lien', e.target.value || null)}
                    placeholder="/promotions"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Date de début (optionnel)"
                      type="datetime-local"
                      value={banner.date_debut?.slice(0, 16) || ''}
                      onChange={e => updateItem(banner.id, 'date_debut', e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                    <Input
                      label="Date de fin (optionnel)"
                      type="datetime-local"
                      value={banner.date_fin?.slice(0, 16) || ''}
                      onChange={e => updateItem(banner.id, 'date_fin', e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Tooltip content={banner.actif ? 'Active (Visible)' : 'Masquée'}>
                    <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => updateItem(banner.id, 'actif', !banner.actif)}>
                      {banner.actif ? <Eye size={18} className="text-green-500" /> : <EyeOff size={18} className="text-neutral-400" />}
                    </Button>
                  </Tooltip>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => moveItem(idx, 'up')} disabled={idx === 0}>
                    <ArrowUp size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1}>
                    <ArrowDown size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setItems(prev => prev.filter(i => i.id !== banner.id))}>
                    <Trash2 size={16} />
                  </Button>
                  <Badge variant="neutral" className="ml-1 font-mono">
                    #{banner.ordre}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ScrollToTop variant="circle" showProgress />
    </Container>
  )
}