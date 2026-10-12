// app/admin/livraison/page.tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
  Truck, RefreshCw, Search, Package, X, Check,
  DollarSign, Zap, MapPin, Home, AlertTriangle
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'

interface ProduitLivraison {
  id: string
  nom: string
  prix: number
  livraison_domicile: number
  livraison_point_retrait: number
  livraison_express: number
  express_gratuit: boolean
}

export default function AdminLivraisonPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  // Récupération du flag global
  const { data: freeShippingData, isLoading: loadingGlobal } = useQuery({
    queryKey: ['setting', 'global_free_shipping'],
    queryFn: async () => {
      const res = await fetch('/api/settings?key=global_free_shipping')
      if (!res.ok) throw new Error('Erreur')
      const json = await res.json()
      return json.value === true
    }
  })

  // Mutation pour changer le flag
  const toggleMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'global_free_shipping', value: newValue }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setting', 'global_free_shipping'] })
      toast.addToast({ type: 'success', message: 'Paramètre mis à jour' })
    },
    onError: () => toast.addToast({ type: 'error', message: 'Erreur lors de la mise à jour' })
  })

  // Récupération des produits avec leurs tarifs
  const { data: produits, isLoading: loadingProduits } = useQuery<ProduitLivraison[]>({
    queryKey: ['produits-livraison', search],
    queryFn: async () => {
      const res = await fetch(`/api/admin/produits?limit=50&search=${encodeURIComponent(search)}`)
      if (!res.ok) throw new Error('Erreur')
      const json = await res.json()
      return json.data || []
    },
    staleTime: 30_000
  })

  const isFreeShipping = freeShippingData ?? false

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-serif flex items-center gap-3">
              <Truck size={28} className="text-gold-500" />
              Gestion de la livraison
            </h1>
            <p className="text-muted-foreground mt-1">
              Configurez les frais de livraison et activez la gratuité globale pour vos promotions.
            </p>
          </div>
        </div>

        {/* Toggle Global Free Shipping */}
        <Card variant="glass" className="border-gold-400/20 shadow-soft mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} className="text-gold-500" />
              Livraison gratuite globale
            </CardTitle>
            <CardDescription>
              Activez cette option pour offrir la livraison gratuite sur l&apos;ensemble de la boutique.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {loadingGlobal ? (
              <Spinner size="sm" />
            ) : (
              <>
                <button
                  onClick={() => toggleMutation.mutate(!isFreeShipping)}
                  disabled={toggleMutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isFreeShipping ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isFreeShipping ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium ${isFreeShipping ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {isFreeShipping ? 'Activée – Livraison gratuite partout' : 'Désactivée'}
                </span>
                {toggleMutation.isPending && <Spinner size="sm" />}
              </>
            )}
          </CardContent>
        </Card>

        {/* Rappel : configurer par produit */}
        <Card variant="glass" className="border-gold-400/20 shadow-soft mb-8">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Tarifs individuels</p>
                <p className="text-sm text-muted-foreground">
                  Pour définir les frais de livraison spécifiques à un produit, rendez-vous dans la fiche produit
                  (onglet <strong>Livraison</strong> lors de l&apos;ajout ou de la modification).
                </p>
                <Link href="/admin/produits" className="inline-flex items-center gap-1 text-gold-500 text-sm mt-2 hover:underline">
                  <Package size={14} /> Gérer les produits
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste des produits et leurs tarifs */}
        <Card variant="glass" className="border-gold-400/20 shadow-soft">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package size={20} className="text-gold-500" />
              Aperçu des tarifs par produit
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                variant="glass"
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                size="sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loadingProduits ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : !produits || produits.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package size={32} className="mx-auto mb-2 opacity-50" />
                <p>Aucun produit trouvé.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold">Produit</th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <Home size={14} className="inline mr-1" />Domicile
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <MapPin size={14} className="inline mr-1" />Retrait
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <Zap size={14} className="inline mr-1" />Express
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">Express gratuit</th>
                      <th className="text-right py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {produits.map((prod) => (
                      <tr key={prod.id} className="hover:bg-gold-400/5 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-medium">{prod.nom}</span>
                          <p className="text-xs text-muted-foreground">{prod.prix.toLocaleString()} FC</p>
                        </td>
                        <td className="py-3 px-4">
                          {prod.livraison_domicile > 0
                            ? `${prod.livraison_domicile.toLocaleString()} FC`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {prod.livraison_point_retrait > 0
                            ? `${prod.livraison_point_retrait.toLocaleString()} FC`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {prod.livraison_express > 0
                            ? `${prod.livraison_express.toLocaleString()} FC`
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {prod.express_gratuit ? (
                            <Badge variant="accent" size="sm">Oui</Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">Non</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/admin/produits/${prod.id}/modifier`}>
                            <Button variant="outline-gold" size="sm">
                              Modifier
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </Container>
  )
}