'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  Shield,
  CheckCircle,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  XCircle,
  Package,
  AlertCircle,
  Crown
} from 'lucide-react'

export default function RetoursPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="text-amber-600 hover:underline">&larr; Retour à l'accueil</Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800 mb-2">
            Retours et privilèges
          </h1>
          <p className="text-stone-600 text-lg">
            Chez Gercie, nous plaçons la satisfaction de nos clients au cœur de notre engagement.
            Découvrez vos droits en matière de retour et de remplacement, ainsi que les conditions qui les encadrent.
          </p>

          {/* 1. Délai de rétractation */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Clock className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Délai de rétractation</h2>
                <p className="text-stone-600 mb-2">
                  Conformément à la législation en vigueur en RDC et aux règles de la plateforme, vous disposez d’un délai de <strong>14 jours</strong> à compter de la réception de votre commande pour exercer votre droit de rétractation, sans avoir à justifier de motifs ni à payer de pénalités.
                </p>
                <p className="text-stone-600">
                  Ce délai s’applique à tous les produits, sauf exceptions listées ci‑dessous.
                </p>
              </div>
            </div>
          </section>

          {/* 2. Procédure de retour */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <RefreshCw className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Procédure de retour</h2>
                <ol className="list-decimal list-inside text-stone-600 space-y-2 ml-2">
                  <li>Connectez‑vous à votre espace client, rubrique <strong>“Mes commandes”</strong>.</li>
                  <li>Sélectionnez la commande concernée et cliquez sur <strong>“Demander un retour”</strong>.</li>
                  <li>Choisissez le ou les articles à retourner et précisez le motif (non‑conformité, défaut, simple rétractation).</li>
                  <li>Notre équipe valide la demande et vous envoie une étiquette de retour par email (frais à votre charge sauf en cas de produit défectueux).</li>
                  <li>Déposez le colis dans un point de dépôt partenaire ou organisez un enlèvement à domicile.</li>
                  <li>Une fois le colis reçu et vérifié, nous procédons au remboursement ou à l’échange sous 14 jours.</li>
                </ol>
                <div className="mt-4 bg-stone-50 p-4 rounded-xl">
                  <p className="text-sm text-stone-600 flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 mt-0.5" />
                    <span><strong>Astuce :</strong> Pour accélérer le traitement, conservez l’emballage d’origine et joignez une copie du bon de livraison à l’intérieur du colis.</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Conditions de retour */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Shield className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Conditions de retour</h2>
                <p className="text-stone-600 mb-3">Pour être accepté, le produit retourné doit respecter les conditions suivantes :</p>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Être dans son état d’origine (non porté, non utilisé, non endommagé).</li>
                  <li>Être accompagné de son emballage, de ses accessoires et de sa documentation (étiquettes, notice).</li>
                  <li>Ne pas faire partie des produits exclus (voir liste ci‑dessous).</li>
                </ul>
                <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                  <p className="font-semibold text-red-700 flex items-center gap-2">
                    <XCircle size={18} /> Articles non retournables
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-600 mt-2 space-y-1">
                    <li>Produits personnalisés ou fabriqués sur mesure.</li>
                    <li>Produits d’hygiène (cosmétiques, sous‑vêtements) une fois ouverts.</li>
                    <li>Denrées périssables (alimentation fraîche).</li>
                    <li>Logiciels, jeux vidéo et supports dématérialisés descellés.</li>
                    <li>Articles de sécurité (casques, équipements de protection) après utilisation.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Remboursement */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <CheckCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Remboursement</h2>
                <p className="text-stone-600 mb-2">
                  Dès réception et vérification de votre retour, nous procédons au remboursement selon le mode de paiement initial :
                </p>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li><strong>Portefeuille Gercie</strong> : crédité immédiatement.</li>
                  <li><strong>Carte bancaire / Mobile Money</strong> : sous 3 à 7 jours ouvrés selon votre établissement.</li>
                </ul>
                <p className="text-stone-600 mt-2">
                  Les frais de livraison initiaux ne sont remboursés qu’en cas d’erreur de notre part (produit non conforme, défaut). Pour une simple rétractation, les frais de retour restent à votre charge.
                </p>
              </div>
            </div>
          </section>

          {/* 5. Remplacement (échange) */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Package className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Remplacement (échange)</h2>
                <p className="text-stone-600">
                  Si vous préférez remplacer l’article plutôt que d’être remboursé, vous pouvez choisir l’option <strong>“Échange”</strong> lors de votre demande. Le nouvel article sera expédié dès réception du retour, sous réserve de disponibilité. En cas d’indisponibilité, vous serez remboursé.
                </p>
                <div className="mt-3 bg-stone-50 p-3 rounded-lg">
                  <p className="text-sm text-stone-600">
                    <strong>Note :</strong> Les échanges ne sont possibles que pour le même produit (couleur, taille, etc.) ou un produit de valeur équivalente.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Privilèges des clients fidèles */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Crown className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Privilèges des clients</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li><strong>Clients réguliers</strong> : après 3 commandes validées, bénéficiez de <strong>retours gratuits</strong> pendant 30 jours.</li>
                  <li><strong>Programme de fidélité</strong> : cumulez des points sur chaque achat et échangez‑les contre des retours gratuits ou des réductions sur vos prochaines commandes.</li>
                  <li><strong>Retour prolongé</strong> : pendant les périodes de fêtes, le délai de retour est étendu à 30 jours (détails communiqués par email).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 7. Contact et assistance */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Besoin d’aide ?</h2>
                <p className="text-stone-600">
                  Notre service client est à votre disposition pour répondre à toutes vos questions concernant les retours et remplacements.
                </p>
                <div className="flex flex-wrap gap-4 mt-3">
                  <a href="mailto:gerciemarketplace@gmail.com" className="flex items-center gap-2 text-stone-600 hover:text-amber-600 transition">
                    <Mail size={16} /> gerciemarketplace@gmail.com
                  </a>
                  <a href="https://wa.me/243973868195" target="_blank" className="flex items-center gap-2 text-stone-600 hover:text-amber-600 transition">
                    <MessageCircle size={16} /> WhatsApp +243 973 868 195
                  </a>
                  <a href="tel:+243973868195" className="flex items-center gap-2 text-stone-600 hover:text-amber-600 transition">
                    <Phone size={16} /> +243 973 868 195
                  </a>
                </div>
                <p className="text-stone-500 text-sm mt-2">Horaires : du lundi au samedi, 8h – 18h.</p>
              </div>
            </div>
          </section>

          {/* Conclusion */}
          <div className="bg-stone-100 rounded-2xl p-6 text-center">
            <p className="text-stone-700">
              Nous mettons tout en œuvre pour garantir une expérience de retour simple et transparente. Votre satisfaction est notre priorité.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
