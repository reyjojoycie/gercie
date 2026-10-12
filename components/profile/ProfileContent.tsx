'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import LocationSelector, { AddressData } from '@/components/LocationSelector'
import { Modal } from '@/components/ui/Modal'
import {
  User, ShieldCheck, MapPin, Plus, Trash2, Edit, Sparkles, Shield, Key, Clock, Mail, Phone, AlertTriangle, CheckCircle2
} from 'lucide-react'

const phoneRegex = /^0[0-9]{9}$/

const SECURITY_QUESTIONS = [
  "Quel était le nom de votre professeur préféré au lycée ?",
  "Comment s'appelait votre meilleur(e) ami(e) d'enfance ?",
  "Quel est le nom de la personne qui vous a donné votre premier baiser ?",
  "Dans quelle ville avez-vous décroché votre premier emploi ?",
  "Dans quel pays avez-vous pris l'avion pour la première fois ?",
  "Quel était le modèle de votre première voiture (ou son surnom) ?",
  "Quel était le nom de votre tout premier animal de compagnie ?",
  "Dans quelle ville vos parents se sont-ils rencontrés ?",
  "Quel était votre surnom quand vous étiez petit(e) ?",
  "Quel est le nom de la rue où vous avez grandi ?",
]

interface Address {
  id: string
  nom: string
  province_id?: number
  ville_id?: number
  commune_id?: number
  quartier?: string
  avenue?: string
  numero?: string
  reference?: string
  telephone?: string
}

interface ProfileContentProps {
  profile: any
  setProfile: (p: any) => void
  user: any
  isOnboarded: boolean
  addresses: Address[]
  setAddresses: (a: Address[]) => void
}

export function ProfileContent({ profile, setProfile, user, isOnboarded, addresses, setAddresses }: ProfileContentProps) {
  const toast = useToast()

  // Édition infos perso
  const [editForm, setEditForm] = useState({ nom: profile?.nom || '', prenom: profile?.prenom || '', telephone: profile?.telephone || '' })
  const [editing, setEditing] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Sécurité
  const [securityForm, setSecurityForm] = useState({ question_secrete: profile?.question_secrete || '', reponse_secrete: '' })
  const [editingSecurity, setEditingSecurity] = useState(false)
  const [securitySubmitting, setSecuritySubmitting] = useState(false)
  const [security, setSecurity] = useState({ question_secrete: profile?.question_secrete || '', reponse_secrete: '' })

  // Mot de passe
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showPwForm, setShowPwForm] = useState(false)
  const [pwSub, setPwSub] = useState(false)

  // Adresses
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [addressForm, setAddressForm] = useState<Partial<Address>>({ nom: '' })
  const [savingAddress, setSavingAddress] = useState(false)

  // Handlers (similaires à l'original)
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editForm.nom || !editForm.prenom) { toast.addToast({ type: 'error', message: 'Nom et prénom requis' }); return }
    if (editForm.telephone && !phoneRegex.test(editForm.telephone)) { toast.addToast({ type: 'error', message: 'Numéro invalide' }); return }
    setEditSubmitting(true)
    try {
      const res = await fetch('/api/user/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
      if (!res.ok) throw new Error()
      setProfile({ ...profile, ...editForm })
      setEditing(false)
      toast.addToast({ type: 'success', message: 'Profil mis à jour' })
    } catch { toast.addToast({ type: 'error', message: 'Erreur' }) }
    finally { setEditSubmitting(false) }
  }

  const handleSecurityUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!securityForm.question_secrete || !securityForm.reponse_secrete) { toast.addToast({ type: 'error', message: 'Champs requis' }); return }
    setSecuritySubmitting(true)
    try {
      const res = await fetch('/api/user/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(securityForm) })
      if (!res.ok) throw new Error()
      setSecurity({ question_secrete: securityForm.question_secrete, reponse_secrete: '' })
      setEditingSecurity(false)
      toast.addToast({ type: 'success', message: 'Question mise à jour' })
    } catch { toast.addToast({ type: 'error', message: 'Erreur' }) }
    finally { setSecuritySubmitting(false) }
  }

  const handlePwUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.addToast({ type: 'error', message: 'Les mots de passe ne correspondent pas' }); return }
    if (pwForm.newPassword.length < 6) { toast.addToast({ type: 'error', message: '6 caractères minimum' }); return }
    setPwSub(true)
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pwForm) })
      if (!res.ok) throw new Error()
      setShowPwForm(false)
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.addToast({ type: 'success', message: 'Mot de passe modifié' })
    } catch { toast.addToast({ type: 'error', message: 'Erreur' }) }
    finally { setPwSub(false) }
  }

  const handleAddressChange = (data: AddressData) => {
    setAddressForm(prev => ({ ...prev, ...data }))
  }

  const saveAddress = async () => {
    if (!addressForm.nom || !addressForm.commune_id || !addressForm.quartier || !addressForm.avenue || !addressForm.numero) {
      toast.addToast({ type: 'error', message: 'Veuillez remplir tous les champs' }); return
    }
    setSavingAddress(true)
    try {
      const url = '/api/user/addresses'
      const method = editingAddress ? 'PATCH' : 'POST'
      const body = editingAddress ? { id: editingAddress.id, ...addressForm } : { ...addressForm }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (editingAddress) {
        setAddresses(prev => prev.map(a => a.id === editingAddress.id ? { ...a, ...addressForm } : a))
      } else {
        setAddresses(prev => [...prev, data])
      }
      setShowAddressForm(false); setEditingAddress(null); setAddressForm({ nom: '' })
      toast.addToast({ type: 'success', message: editingAddress ? 'Adresse modifiée' : 'Adresse ajoutée' })
    } catch (err: any) { toast.addToast({ type: 'error', message: err.message }) }
    finally { setSavingAddress(false) }
  }

  const deleteAddress = async (id: string) => {
    if (!confirm('Supprimer cette adresse ?')) return
    try {
      await fetch(`/api/user/addresses/${id}`, { method: 'DELETE' })
      setAddresses(prev => prev.filter(a => a.id !== id))
      toast.addToast({ type: 'success', message: 'Adresse supprimée' })
    } catch { toast.addToast({ type: 'error', message: 'Erreur' }) }
  }

  const tabs = [
    {
      id: 'general',
      label: 'Général',
      icon: <User size={18} />,
      content: (
        <div className="space-y-8">
          {/* Infos personnelles */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader><CardTitle className="flex items-center gap-2"><User size={18} className="text-gold-500" /> Informations personnelles</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input variant="glass" label="Nom" value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })} />
                    <Input variant="glass" label="Prénom" value={editForm.prenom} onChange={e => setEditForm({ ...editForm, prenom: e.target.value })} />
                  </div>
                  <Input variant="glass" label="Téléphone" value={editForm.telephone} onChange={e => setEditForm({ ...editForm, telephone: e.target.value })} />
                  <div className="flex gap-2">
                    <Button type="submit" variant="luxe" loading={editSubmitting}>Enregistrer</Button>
                    <Button variant="outline-gold" onClick={() => { setEditing(false); setEditForm({ nom: profile?.nom || '', prenom: profile?.prenom || '', telephone: profile?.telephone || '' }) }}>Annuler</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Nom complet</span><span className="font-medium">{profile?.prenom && profile?.nom ? `${profile.prenom} ${profile.nom}` : user.email}</span></div>
                  <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Téléphone</span><span className="font-medium">{profile?.telephone || '—'}</span></div>
                  <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Email</span><span className="font-medium">{user.email}</span></div>
                  <div className="flex justify-between py-2"><span className="text-muted-foreground">Membre depuis</span><span className="font-medium">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span></div>
                  <Button variant="outline-gold" size="sm" onClick={() => setEditing(true)} leftIcon={<Edit size={14} />}>Modifier</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vérification & Onboarding */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={18} className="text-gold-500" /> Vérification</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center"><span className="text-sm">Email</span>{profile?.email_verified ? <Badge variant="gold" size="sm"><CheckCircle2 size={12} className="mr-1" /> Vérifié</Badge> : <Link href="/auth/verify-email"><Button variant="outline-gold" size="sm"><Mail size={14} className="mr-1" /> Vérifier</Button></Link>}</div>
              <div className="flex justify-between items-center"><span className="text-sm">Téléphone</span>{profile?.phone_verified ? <Badge variant="gold" size="sm"><CheckCircle2 size={12} className="mr-1" /> Vérifié</Badge> : <Link href="/auth/verify-phone"><Button variant="outline-gold" size="sm"><Phone size={14} className="mr-1" /> Vérifier</Button></Link>}</div>
              {!isOnboarded && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2"><AlertTriangle size={16} /><span>Finalisez votre compte.</span><Link href="/onboarding" className="underline font-medium ml-auto">Continuer</Link></div>}
            </CardContent>
          </Card>

          {/* Sécurité */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield size={18} className="text-gold-500" /> Sécurité</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!editingSecurity ? (
                <div className="flex justify-between items-center"><span className="text-sm">{security.question_secrete || 'Aucune question de sécurité'}</span><Button variant="ghost" size="sm" onClick={() => setEditingSecurity(true)} className="text-gold-500"><Edit size={14} /></Button></div>
              ) : (
                <form onSubmit={handleSecurityUpdate} className="space-y-3">
                  <select value={securityForm.question_secrete} onChange={e => setSecurityForm({ ...securityForm, question_secrete: e.target.value })} className="w-full border border-border rounded-xl px-4 py-2 text-sm bg-card text-foreground">
                    <option value="">Choisir une question</option>
                    {SECURITY_QUESTIONS.map((q, i) => <option key={i} value={q}>{q}</option>)}
                  </select>
                  <Input variant="glass" placeholder="Votre réponse" value={securityForm.reponse_secrete} onChange={e => setSecurityForm({ ...securityForm, reponse_secrete: e.target.value })} />
                  <div className="flex gap-2"><Button type="submit" variant="luxe" size="sm" loading={securitySubmitting}>Enregistrer</Button><Button variant="outline-gold" size="sm" onClick={() => setEditingSecurity(false)}>Annuler</Button></div>
                </form>
              )}
              <hr className="border-border" />
              {showPwForm ? (
                <form onSubmit={handlePwUpdate} className="space-y-3">
                  <Input type="password" placeholder="Mot de passe actuel" value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} variant="glass" />
                  <Input type="password" placeholder="Nouveau mot de passe" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} variant="glass" />
                  <Input type="password" placeholder="Confirmer" value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} variant="glass" />
                  <div className="flex gap-2"><Button type="submit" variant="luxe" size="sm" loading={pwSub}>Modifier</Button><Button variant="outline-gold" size="sm" onClick={() => setShowPwForm(false)}>Annuler</Button></div>
                </form>
              ) : (
                <Button variant="outline-gold" size="sm" onClick={() => setShowPwForm(true)} leftIcon={<Key size={14} />}>Changer le mot de passe</Button>
              )}
              <Link href="/profile/security/sessions"><Button variant="outline-gold" size="sm" leftIcon={<Clock size={14} />}>Sessions actives</Button></Link>
            </CardContent>
          </Card>

          {/* Adresses */}
          <Card variant="glass" className="border-gold-400/20">
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin size={18} className="text-gold-500" /> Adresses de livraison</CardTitle></CardHeader>
            <CardContent>
              <AnimatePresence>
                {addresses.map(addr => (
                  <motion.div key={addr.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-between items-start py-3 border-b border-border last:border-0">
                    <div><p className="font-medium">{addr.nom}</p><p className="text-xs text-muted-foreground">{addr.quartier}, {addr.avenue}, n°{addr.numero}</p></div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingAddress(addr); setAddressForm(addr); setShowAddressForm(true) }} className="text-gold-500"><Edit size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteAddress(addr.id)}><Trash2 size={14} className="text-red-500" /></Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button variant="outline-gold" size="sm" className="mt-4" onClick={() => { setEditingAddress(null); setAddressForm({ nom: '' }); setShowAddressForm(true) }} leftIcon={<Plus size={14} />}>Ajouter une adresse</Button>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      id: 'preferences',
      label: 'Préférences',
      icon: <Sparkles size={18} />,
      content: (
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles size={18} className="text-gold-500" /> Centres d'intérêt</CardTitle></CardHeader>
          <CardContent>
            {profile?.preferences?.categories?.length > 0 ? (
              <div className="flex flex-wrap gap-2">{profile.preferences.categories.map((cat: string) => <Badge key={cat} variant="accent" size="sm">{cat}</Badge>)}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune préférence définie.</p>
            )}
            <Link href="/onboarding/preferences" className="inline-block mt-4"><Button variant="outline-gold" size="sm" leftIcon={<Edit size={14} />}>Modifier</Button></Link>
          </CardContent>
        </Card>
      ),
    },
  ]

  return (
    <>
      <Tabs tabs={tabs} variant="pills" size="md" animated />
      {/* Modal adresse */}
      <Modal isOpen={showAddressForm} onClose={() => setShowAddressForm(false)} title={editingAddress ? "Modifier l'adresse" : 'Nouvelle adresse'} size="lg" accent="gold">
        <div className="space-y-4">
          <Input variant="glass" placeholder="Nom (ex: Domicile)" value={addressForm.nom || ''} onChange={e => setAddressForm({ ...addressForm, nom: e.target.value })} />
          <LocationSelector onAddressChange={handleAddressChange} initialAddress={editingAddress || undefined} compact />
          <div className="flex gap-2">
            <Button variant="luxe" fullWidth onClick={saveAddress} loading={savingAddress}>Enregistrer</Button>
            <Button variant="outline-gold" fullWidth onClick={() => setShowAddressForm(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}