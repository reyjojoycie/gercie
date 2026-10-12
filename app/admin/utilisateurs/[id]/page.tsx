// app/admin/utilisateurs/[id]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  ArrowLeft, User, Mail, Phone, Shield, Ban, Trash2, Key, Pencil, Save,
  Clock, ShoppingBag, RefreshCcw, CheckCircle, X, AlertTriangle, Activity,
  Layers, DollarSign, ExternalLink,
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface UserDetail {
  profile: {
    id: string
    email: string
    nom: string
    prenom: string
    telephone: string | null
    type_user: string
    is_admin: boolean
    est_actif: boolean
    created_at: string
    derniere_connexion: string | null
  }
  commandes: any[]
  transactions: any[]
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: {
      nom: '',
      prenom: '',
      email: '',
      telephone: '',
    },
  })

  const { data, isLoading, error, refetch } = useQuery<UserDetail>({
    queryKey: ['admin-user-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/utilisateurs/${id}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur')
      return res.json()
    },
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, updates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', id] })
      toast.addToast({ type: 'success', message: 'Informations mises à jour' })
      setEditMode(false)
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const banMutation = useMutation({
    mutationFn: async (actif: boolean) => {
      const res = await fetch('/api/admin/utilisateurs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, updates: { est_actif: !actif } }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', id] })
      toast.addToast({ type: 'success', message: 'Statut du compte mis à jour' })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/utilisateurs?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => {
      toast.addToast({ type: 'success', message: 'Utilisateur supprimé' })
      router.push('/admin/utilisateurs')
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/utilisateurs/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return res.json()
    },
    onSuccess: (data) => {
      toast.addToast({ type: 'success', message: `Nouveau mot de passe : ${data.newPassword}` })
    },
    onError: (err: any) => toast.addToast({ type: 'error', message: err.message }),
  })

  const handleEditSubmit = (formData: any) => {
    updateMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="xl" variant="premium" label="Chargement de l'utilisateur..." />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Container className="py-8">
        <div className="text-center p-12">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <p className="text-red-500">{(error as Error)?.message || 'Utilisateur introuvable'}</p>
          <Link href="/admin/utilisateurs">
            <Button variant="outline-gold" className="mt-4">Retour à la liste</Button>
          </Link>
        </div>
      </Container>
    )
  }

  const user = data.profile

  return (
    <Container className="py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {/* Fil d'ariane */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link href="/admin/utilisateurs" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-gold-500">
            <ArrowLeft size={16} /> Utilisateurs
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground">{user.prenom} {user.nom}</span>
        </div>

        {/* En-tête avec actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-serif">
              {user.prenom} {user.nom}
            </h1>
            <p className="text-muted-foreground mt-1">
              {user.email}
              {user.telephone && ` • ${user.telephone}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!editMode && (
              <>
                <Tooltip content="Modifier les informations">
                  <Button variant="outline-gold" size="sm" onClick={() => {
                    setEditMode(true)
                    reset({ nom: user.nom, prenom: user.prenom, email: user.email, telephone: user.telephone || '' })
                  }}>
                    <Pencil size={16} className="mr-1" /> Modifier
                  </Button>
                </Tooltip>
                <Tooltip content={user.est_actif ? 'Bannir' : 'Débannir'}>
                  <Button variant={user.est_actif ? 'danger' : 'accent'} size="sm" onClick={() => banMutation.mutate(user.est_actif)} loading={banMutation.isPending}>
                    <Ban size={16} className="mr-1" /> {user.est_actif ? 'Bannir' : 'Débannir'}
                  </Button>
                </Tooltip>
                <Tooltip content="Réinitialiser le mot de passe">
                  <Button variant="outline-gold" size="sm" onClick={() => resetPasswordMutation.mutate()} loading={resetPasswordMutation.isPending}>
                    <Key size={16} className="mr-1" /> Reset mot de passe
                  </Button>
                </Tooltip>
                <Tooltip content="Supprimer l'utilisateur">
                  <Button variant="danger" size="sm" onClick={() => { if (confirm('Supprimer définitivement cet utilisateur ?')) deleteMutation.mutate() }} loading={deleteMutation.isPending}>
                    <Trash2 size={16} className="mr-1" /> Supprimer
                  </Button>
                </Tooltip>
              </>
            )}
            <Button variant="outline-gold" size="sm" onClick={() => refetch()}>
              <RefreshCcw size={16} className="mr-1" /> Actualiser
            </Button>
          </div>
        </div>

        {/* Statut badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant={user.est_actif ? 'accent' : 'danger'}>{user.est_actif ? 'Actif' : 'Banni'}</Badge>
          <Badge variant={user.is_admin ? 'luxury' : 'brand'}>{user.is_admin ? 'Admin' : user.type_user === 'vendeur' ? 'Vendeur' : 'Acheteur'}</Badge>
          <Badge variant="neutral">ID : {user.id.slice(0, 8)}...</Badge>
          <Badge variant="neutral">Créé le {new Date(user.created_at).toLocaleDateString('fr-FR')}</Badge>
          {user.derniere_connexion && <Badge variant="neutral">Dernière connexion : {new Date(user.derniere_connexion).toLocaleDateString('fr-FR')}</Badge>}
        </div>

        {/* Formulaire d'édition (si activé) */}
        {editMode && (
          <Card variant="glass" className="mb-8 border-gold-400/20">
            <CardHeader>
              <CardTitle>Modifier les informations</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Prénom" {...register('prenom', { required: 'Prénom requis' })} error={formState.errors.prenom?.message} variant="glass" />
                  <Input label="Nom" {...register('nom', { required: 'Nom requis' })} error={formState.errors.nom?.message} variant="glass" />
                  <Input label="Email" type="email" {...register('email', { required: 'Email requis' })} error={formState.errors.email?.message} variant="glass" />
                  <Input label="Téléphone" {...register('telephone')} variant="glass" />
                </div>
                <div className="flex gap-3">
                  <Button variant="luxe" type="submit" loading={updateMutation.isPending}>Enregistrer</Button>
                  <Button variant="outline-gold" onClick={() => setEditMode(false)}>Annuler</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Commandes récentes */}
        <Card variant="glass" className="mb-8 border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingBag size={18} className="text-gold-500" />Dernières commandes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.commandes.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune commande trouvée.</p>
            ) : (
              <div className="space-y-2">
                {data.commandes.map((cmd: any) => (
                  <div key={cmd.id} className="flex justify-between items-center p-3 rounded-xl bg-card border border-border">
                    <div>
                      <span className="font-mono text-sm">#{cmd.numero?.slice(-6) || cmd.id.slice(0, 8)}</span>
                      <Badge variant="gold" size="sm" className="ml-2">{cmd.statut}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gold-600">{cmd.total_global?.toLocaleString() || 0} FC</p>
                      <p className="text-xs text-muted-foreground">{new Date(cmd.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions récentes */}
        <Card variant="glass" className="mb-8 border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity size={18} className="text-gold-500" />Dernières transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Aucune transaction trouvée.</p>
            ) : (
              <div className="space-y-2">
                {data.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between items-center p-3 rounded-xl bg-card border border-border">
                    <div>
                      <span className="text-sm">{tx.description}</span>
                      <Badge variant={tx.montant > 0 ? 'accent' : 'danger'} size="sm" className="ml-2">{tx.montant > 0 ? '+' : ''}{tx.montant.toLocaleString()} FC</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </Container>
  )
}