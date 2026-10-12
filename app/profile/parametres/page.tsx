// app/profile/parametres/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, Bell, Shield, User, Smartphone, Save } from 'lucide-react'
import Link from 'next/link'

export default function ParametresPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const toastRef = useToast()

  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState({
    email_notifications: true,
    push_notifications: true,
    theme: 'dark'
  })

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  const handleSave = async () => {
    setSaving(true)
    // Simulation d'appel API
    await new Promise(resolve => setTimeout(resolve, 1000))
    toastRef.addToast({ type: 'success', message: 'Paramètres enregistrés avec succès' })
    setSaving(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner size="xl" /></div>

  return (
    <Container className="py-8 max-w-3xl">
      <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-gold-500 mb-6">
        <ArrowLeft size={18} /> Retour au profil
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <h1 className="text-3xl font-bold font-serif">Paramètres</h1>

        {/* Préférences Notifications */}
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell size={18} className="text-gold-500" /> Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notifications Email</p>
                <p className="text-sm text-muted-foreground">Recevoir des updates par email</p>
              </div>
              <input type="checkbox" checked={prefs.email_notifications} onChange={(e) => setPrefs({...prefs, email_notifications: e.target.checked})} className="toggle toggle-gold" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notifications Push</p>
                <p className="text-sm text-muted-foreground">Recevoir des alertes sur votre appareil</p>
              </div>
              <input type="checkbox" checked={prefs.push_notifications} onChange={(e) => setPrefs({...prefs, push_notifications: e.target.checked})} className="toggle toggle-gold" />
            </div>
          </CardContent>
        </Card>

        {/* Sécurité */}
        <Card variant="glass" className="border-gold-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield size={18} className="text-gold-500" /> Sécurité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline-gold" fullWidth leftIcon={<Smartphone size={16} />}>
              Gérer la double authentification (2FA)
            </Button>
            <Button variant="outline-gold" fullWidth leftIcon={<User size={16} />}>
              Voir les sessions actives
            </Button>
          </CardContent>
        </Card>

        {/* Action principale */}
        <div className="flex justify-end">
          <Button variant="luxe" onClick={handleSave} loading={saving} leftIcon={<Save size={16} />}>
            Enregistrer tout
          </Button>
        </div>
      </motion.div>
    </Container>
  )
}