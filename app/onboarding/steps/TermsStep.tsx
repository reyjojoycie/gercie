'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Loader2,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const TERMS_TEXT = `
Conditions Générales d'Utilisation de Gercie

1. Acceptation des conditions
En utilisant la plateforme Gercie, vous acceptez les présentes conditions générales. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser le service.

2. Services proposés
Gercie est une marketplace universelle en République Démocratique du Congo permettant l'achat et la vente de biens et services.

3. Compte utilisateur
Vous devez fournir des informations exactes et les maintenir à jour. Vous êtes responsable de la confidentialité de vos identifiants.

4. Commandes et paiements
Toutes les commandes sont soumises à disponibilité. Les prix sont affichés en francs congolais (CDF) ou en dollars américains (USD). Les paiements sont sécurisés via des partenaires agréés.

5. Livraison et retours
Les modalités de livraison et de retour sont précisées dans notre politique de livraison. Certains produits peuvent être soumis à des conditions spécifiques.

6. Protection des données
Vos données personnelles sont traitées conformément à notre Politique de Confidentialité. Nous ne les vendons ni ne les partageons sans votre consentement.

7. Responsabilités
Gercie ne saurait être tenu responsable des dommages indirects liés à l'utilisation du service. En cas de litige, la loi congolaise s'applique.

8. Modification des conditions
Nous nous réservons le droit de modifier ces conditions à tout moment. Les utilisateurs seront informés des changements.

En cochant la case ci‑dessous, vous reconnaissez avoir pris connaissance de ces Conditions Générales d'Utilisation et de notre Politique de Confidentialité, et vous les acceptez sans réserve.
`

export default function TermsStep() {
  const router = useRouter()
  const { user, refreshRoles } = useAuth()

  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  /* ---------------------------------------------------------------- */
  /*  Chargement initial                                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!user) return

    const loadProfile = async () => {
      try {
        const { error } = await supabaseBrowser
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single()

        if (error) throw error
      } catch (err: any) {
        console.error('[TermsStep] Erreur chargement:', err)
      } finally {
        setIsLoadingProfile(false)
      }
    }

    loadProfile()
  }, [user])

  /* ---------------------------------------------------------------- */
  /*  ✅ SOLUTION DIRECTE : Sauvegarde via Supabase client (RLS OK)    */
  /*  Contourne le bug de /api/user/update qui strip terms_accepted_at */
  /* ---------------------------------------------------------------- */

  const handleAccept = async () => {
    if (!accepted) {
      setError('Veuillez accepter les conditions pour continuer.')
      return
    }

    if (!user) {
      setError('Session expirée. Veuillez vous reconnecter.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const termsDate = new Date().toISOString()

      console.log('[TermsStep] 📤 Sauvegarde directe Supabase:', {
        userId: user.id,
        terms_accepted_at: termsDate,
      })

      // ✅ Sauvegarde DIRECTE via Supabase client (passe le RLS owner)
      const { error: updateError } = await supabaseBrowser
        .from('profiles')
        .update({
          terms_accepted_at: termsDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('[TermsStep] ❌ Erreur Supabase:', updateError)
        throw new Error(updateError.message || 'Erreur lors de l\'enregistrement')
      }

      // ✅ Vérification immédiate que la valeur a bien été sauvegardée
      const { data: verifyData } = await supabaseBrowser
        .from('profiles')
        .select('terms_accepted_at')
        .eq('id', user.id)
        .single()

      console.log('[TermsStep] ✅ Vérification:', verifyData)

      if (!verifyData?.terms_accepted_at) {
        throw new Error('La sauvegarde a échoué. Réessayez.')
      }

      console.log('[TermsStep] ✅ terms_accepted_at SAUVEGARDÉ avec succès')

      if (refreshRoles) await refreshRoles()

      // Redirection vers l'étape finale
      router.push('/onboarding/done')
    } catch (err: any) {
      console.error('[TermsStep] Erreur:', err)
      setError(err.message || 'Impossible d\'enregistrer votre acceptation.')
    } finally {
      setLoading(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Skeleton                                                         */
  /* ---------------------------------------------------------------- */

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-gold-500" aria-hidden="true" />
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Rendu principal                                                  */
  /* ---------------------------------------------------------------- */

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-neutral-500 mb-1">
            <span>Étape 4 sur 5</span>
            <span>Conditions</span>
          </div>
          <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gold-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: '80%' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
              <FileText size={32} className="text-gold-600 dark:text-gold-400" aria-hidden="true" />
            </div>
            <CardTitle className="text-3xl font-serif text-neutral-900 dark:text-neutral-100">
              Conditions Générales
            </CardTitle>
            <CardDescription className="text-neutral-500 dark:text-neutral-400 mt-2">
              Veuillez lire et accepter nos conditions d&apos;utilisation et notre politique de confidentialité.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div
              className="bg-neutral-100 dark:bg-neutral-800/50 rounded-xl p-4 max-h-64 overflow-y-auto text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line"
              role="region"
              aria-label="Conditions générales d'utilisation"
              tabIndex={0}
            >
              {TERMS_TEXT}
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 rounded-xl text-sm flex items-center gap-2"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 text-gold-500 border-2 border-gold-400/30 rounded focus:ring-gold-400"
                aria-describedby="terms-description"
              />
              <span id="terms-description" className="text-sm text-neutral-600 dark:text-neutral-400">
                J&apos;ai lu et j&apos;accepte les{' '}
                <strong>Conditions Générales d&apos;Utilisation</strong> ainsi que la{' '}
                <strong>Politique de Confidentialité</strong> de Gercie.
              </span>
            </label>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/onboarding/preferences')}
                className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <ArrowLeft size={16} className="mr-1" aria-hidden="true" />
                Précédent
              </Button>
              <Button
                type="button"
                variant="luxe"
                size="lg"
                onClick={handleAccept}
                loading={loading}
                disabled={!accepted || loading}
                className="shadow-gold hover:shadow-glow-gold"
              >
                Accepter et continuer
                <ArrowRight size={16} className="ml-1" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}