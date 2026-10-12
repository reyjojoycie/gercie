// app/support/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Mail, Phone, MessageCircle, HelpCircle, Send,
  CheckCircle, Clock, MapPin, MessageSquare, ExternalLink,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Container } from '@/components/layout/Container'
// ✅ CORRECTION : Importation par défaut du Footer pour résoudre l'erreur d'export de Next.js
import Footer from '@/components/layout/Footer'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function SupportPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Une erreur est survenue lors du traitement.')
      
      setSent(true)
      setFormData({ name: '', email: '', subject: '', message: '' })
      setTimeout(() => setSent(false), 5000)
      toast.success('Message envoyé avec succès !')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l’envoi')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-between">
      {/* Zone de contenu principale */}
      <Container className="py-12 flex-1">
        <div className="mb-8">
          <Link href="/" className="text-sm text-neutral-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors inline-flex items-center gap-1">
            ← Retour à l&apos;accueil
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-10 max-w-5xl mx-auto"
        >
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3 tracking-tight">
              Service Client Gercie
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto text-sm md:text-base">
              Notre équipe dédiée est à votre disposition pour garantir une expérience d&apos;achat premium et fluide.
            </p>
          </div>

          {/* Cartes de Contacts Rapides (Effets hover CSS natifs et sécurisés pour les composants) */}
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Mail size={24} className="text-brand-600 dark:text-brand-400" />,
                title: 'Email Direct',
                content: 'gerciemarketplace@gmail.com',
                action: 'mailto:gerciemarketplace@gmail.com',
                detail: 'Prise en charge sous 24h',
              },
              {
                icon: <MessageCircle size={24} className="text-green-600 dark:text-green-400" />,
                title: 'WhatsApp Business',
                content: '+243 973 868 195',
                action: 'https://wa.me/243973868195',
                detail: 'Assistance instantanée',
              },
              {
                icon: <Phone size={24} className="text-amber-600 dark:text-amber-400" />,
                title: 'Ligne Téléphonique',
                content: '+243 973 868 195',
                action: 'tel:+243973868195',
                detail: 'Lun – Sam, 8h – 18h',
              },
            ].map((item, idx) => (
              <Card key={idx} className="text-center transition-all duration-200 hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700">
                <CardContent className="p-6 flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center border border-neutral-200/50 dark:border-neutral-800/50">
                    {item.icon}
                  </div>
                  <CardTitle className="text-base font-semibold text-neutral-800 dark:text-neutral-200">{item.title}</CardTitle>
                  <a 
                    href={item.action} 
                    target={item.action.startsWith('http') ? '_blank' : undefined} 
                    rel={item.action.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="text-brand-600 dark:text-brand-400 font-medium text-sm break-all hover:underline"
                  >
                    {item.content}
                  </a>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">{item.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Formulaire de Support Clé-en-main */}
          <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-bold">
                <MessageSquare size={20} className="text-brand-600 dark:text-brand-400" />
                Soumettre un ticket d&apos;assistance
              </CardTitle>
              <CardDescription>Décrivez précisément votre situation, nos conseillers vous recontacteront.</CardDescription>
            </CardHeader>
            <CardContent>
              {sent && (
                <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900">
                  <CheckCircle size={20} className="shrink-0" />
                  <span className="text-sm font-medium">Votre message a été transmis avec succès. Un conseiller Gercie étudie votre demande.</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    label="Nom complet"
                    placeholder="Ex: Patient Mwamba"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  <Input
                    label="Adresse Email"
                    type="email"
                    placeholder="exemple@domaine.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <Input
                  label="Objet de la demande"
                  placeholder="Ex: Statut du règlement Mobile Money ou livraison en attente"
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Détail du message
                  </label>
                  <textarea
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                    required
                    placeholder="Spécifiez votre numéro de commande si applicable..."
                    className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none transition-all duration-150"
                  />
                </div>
                <Button 
                  type="submit" 
                  variant="primary" 
                  fullWidth 
                  size="lg" 
                  loading={submitting} 
                  leftIcon={!submitting ? <Send size={18} /> : undefined}
                >
                  {submitting ? 'Acheminement sécurisé...' : 'Envoyer le message'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Base de connaissances abrégée & Horaires RDC */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border border-neutral-200 dark:border-neutral-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HelpCircle size={20} className="text-brand-600 dark:text-brand-400" />
                  Centre d&apos;aide immédiat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-sm">
                  <li><Link href="/faq" className="text-neutral-600 dark:text-neutral-400 hover:text-brand-500 dark:hover:text-brand-400 hover:underline transition-colors block">→ Suivre l&apos;acheminement de mon colis</Link></li>
                  <li><Link href="/faq" className="text-neutral-600 dark:text-neutral-400 hover:text-brand-500 dark:hover:text-brand-400 hover:underline transition-colors block">→ Résoudre un échec de paiement Orange Money / M-Pesa</Link></li>
                  <li><Link href="/faq" className="text-neutral-600 dark:text-neutral-400 hover:text-brand-500 dark:hover:text-brand-400 hover:underline transition-colors block">→ Politique de retour et remboursement d&apos;articles</Link></li>
                  <li><Link href="/faq" className="text-neutral-600 dark:text-neutral-400 hover:text-brand-500 dark:hover:text-brand-400 hover:underline transition-colors block">→ Processus d&apos;enregistrement des marchands agréés</Link></li>
                </ul>
                <div className="pt-2">
                  <Link href="/faq" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                    Consulter l&apos;intégralité des FAQ <ExternalLink size={14} />
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-neutral-200 dark:border-neutral-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock size={20} className="text-amber-600 dark:text-amber-400" />
                  Heures d&apos;ouverture (Kinshasa)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 text-sm text-neutral-600 dark:text-neutral-300">
                  <li className="flex justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5"><span>Lundi – Vendredi</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">8:00 — 20:00</span></li>
                  <li className="flex justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1.5"><span>Samedi</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">9:00 — 18:00</span></li>
                  <li className="flex justify-between text-neutral-500"><span>Dimanche & jours fériés</span><span className="italic text-xs text-neutral-400">Support d&apos;urgence asynchrone</span></li>
                </ul>
                <div className="mt-5 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                  <MapPin size={14} className="text-brand-500" /> Gercie Inc. • Kinshasa, République Démocratique du Congo
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </Container>
      
      {/* Footer attaché proprement */}
      <Footer />
    </div>
  )
}