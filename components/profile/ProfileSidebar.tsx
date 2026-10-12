// components/profile/ProfileSidebar.tsx
'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Camera, Trash2, Wallet, Package, Heart, Bell, LogOut,
  ShieldCheck, AlertTriangle, Loader2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/admin/testimonials/ConfirmDialog' // réutilisé
import { AvatarCropModal } from './AvatarCropModal'
import { uploadAvatar } from '@/lib/uploadAvatar'
import { useToast } from '@/components/ui/Toast'

interface ProfileSidebarProps {
  user: any
  profile: any
  wallet: { solde_achat: number }
  isVerified: boolean
  isOnboarded: boolean
  onLogout: () => void
  onAvatarUpdated: (url: string) => void
  onAvatarRemoved: () => void
}

export function ProfileSidebar({
  user,
  profile,
  wallet,
  isVerified,
  onLogout,
  onAvatarUpdated,
  onAvatarRemoved,
}: ProfileSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [showCrop, setShowCrop] = useState(false)

  const displayName = profile?.prenom && profile?.nom
    ? `${profile.prenom} ${profile.nom}`
    : user.email

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.addToast({ type: 'error', message: 'Fichier non image' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.addToast({ type: 'error', message: 'Image trop volumineuse (max 5 Mo)' })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setSourceImage(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    // Réinitialiser pour permettre la re-sélection du même fichier
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCropComplete = async (croppedFile: File) => {
    setAvatarLoading(true)
    try {
      const url = await uploadAvatar(user.id, croppedFile)
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: url }),
      })
      onAvatarUpdated(url)
      toast.addToast({ type: 'success', message: 'Photo de profil mise à jour' })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: err.message || 'Erreur upload' })
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleDelete = async () => {
    setAvatarLoading(true)
    try {
      // Supprimer l'ancien fichier si existant
      if (profile?.avatar_url) {
        const path = profile.avatar_url.split('/').slice(-2).join('/')
        await supabaseBrowser.storage.from('avatars').remove([path])
      }
      await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: null }),
      })
      onAvatarRemoved()
      toast.addToast({ type: 'success', message: 'Photo supprimée' })
    } catch (err: any) {
      toast.addToast({ type: 'error', message: 'Erreur suppression' })
    } finally {
      setAvatarLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <>
      <Card variant="glass" className="text-center border-gold-400/20 shadow-gold">
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-32 h-32 rounded-full ring-2 ring-offset-4 ring-gold-400 ring-offset-background overflow-hidden shadow-gold relative">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  sizes="128px"
                  priority
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-4xl text-muted-foreground font-bold">
                  {(profile?.prenom || user.email || 'G').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-gold hover:shadow-glow-gold transition"
            >
              {avatarLoading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
            {profile?.avatar_url && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={avatarLoading}
                className="absolute top-0 right-0 p-1.5 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {isVerified ? (
              <Badge variant="gold" className="mt-1 gap-1"><ShieldCheck size={12} /> Compte vérifié</Badge>
            ) : (
              <Badge variant="accent" className="mt-1 gap-1"><AlertTriangle size={12} /> Non vérifié</Badge>
            )}
          </div>

          <div className="bg-card rounded-xl p-3 w-full border border-border">
            <p className="text-xs text-muted-foreground">Solde Gercie</p>
            <p className="text-2xl font-bold text-foreground">{wallet.solde_achat.toLocaleString()} FC</p>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Link href="/profile/recharge">
              <Button variant="luxe" fullWidth size="sm" leftIcon={<Wallet size={16} />}>Recharger</Button>
            </Link>
            <Link href="/profile/commandes">
              <Button variant="outline-gold" fullWidth size="sm" leftIcon={<Package size={16} />}>Commandes</Button>
            </Link>
            <Link href="/profile/favoris">
              <Button variant="outline-gold" fullWidth size="sm" leftIcon={<Heart size={16} />}>Favoris</Button>
            </Link>
            <Link href="/profile/notifications">
              <Button variant="outline-gold" fullWidth size="sm" leftIcon={<Bell size={16} />}>Notifications</Button>
            </Link>
            <Button variant="ghost" fullWidth size="sm" leftIcon={<LogOut size={16} />} onClick={onLogout}>Déconnexion</Button>
          </div>
        </CardContent>
      </Card>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      <AvatarCropModal
        isOpen={showCrop && !!sourceImage}
        imageSrc={sourceImage!}
        onCropComplete={handleCropComplete}
        onClose={() => { setShowCrop(false); setSourceImage(null) }}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        message="Voulez-vous vraiment supprimer votre photo de profil ?"
        variant="danger"
        confirmLabel="Supprimer"
        isLoading={avatarLoading}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  )
}