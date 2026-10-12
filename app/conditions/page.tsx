'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  FileText,
  User,
  ShoppingBag,
  DollarSign,
  Truck,
  RefreshCw,
  Shield,
  Scale,
  AlertCircle,
  Mail,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
  Clock,
  Wallet
} from 'lucide-react'

export default function ConditionsPage() {
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
            Conditions générales d'utilisation
          </h1>
          <p className="text-stone-600 text-lg">
            En utilisant la plateforme Gercie, vous acceptez les présentes conditions. 
            Nous vous invitons à les lire attentivement avant de passer commande ou de créer un compte.
          </p>

          {/* 1. Compte utilisateur */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <User className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Compte utilisateur</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Vous êtes responsable de la confidentialité de vos identifiants de connexion.</li>
                  <li>Vous devez fournir des informations exactes et à jour lors de votre inscription.</li>
                  <li>Gercie se réserve le droit de suspendre ou supprimer un compte en cas de non‑respect des CGU.</li>
                  <li>Chaque utilisateur ne peut détenir qu’un seul compte actif.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Commandes */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <ShoppingBag className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Commandes</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Les offres de produits sont valables tant qu’elles sont visibles sur le site.</li>
                  <li>Gercie se réserve le droit de refuser ou d’annuler une commande en cas de litige, de suspicion de fraude ou d’indisponibilité.</li>
                  <li>Une fois la commande validée, vous recevez un email de confirmation. Aucune modification n’est possible après expédition.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. Prix et paiement */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <DollarSign className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Prix et paiement</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Les prix sont indiqués en Francs Congolais (CDF) et en Dollars US (USD) à titre indicatif.</li>
                  <li>Le paiement s’effectue en CDF via votre portefeuille Gercie ou par mobile money (Orange, Airtel, M‑Pesa).</li>
                  <li>Une commission de <strong>5 %</strong> est prélevée sur chaque transaction pour le fonctionnement de la plateforme.</li>
                  <li>Le portefeuille Gercie est crédité en temps réel ; les retraits sont possibles sous 48 heures.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Livraison */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Truck className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Livraison</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Les délais de livraison sont donnés à titre indicatif. Gercie ne pourra être tenu responsable des retards indépendants de sa volonté (grève, intempéries, etc.).</li>
                  <li>La livraison est assurée par des partenaires logistiques agréés. Un code PIN est requis pour confirmer la réception.</li>
                  <li>En cas d’absence, un avis de passage est laissé ; le colis est conservé 48 heures avant retour à l’entrepôt.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Droit de rétractation */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <RefreshCw className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Droit de rétractation</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Vous disposez d’un délai de <strong>14 jours</strong> à compter de la réception pour retourner un produit (hors articles personnalisés, produits d’hygiène ouverts, denrées périssables).</li>
                  <li>Les frais de retour sont à votre charge sauf en cas de produit défectueux ou non conforme.</li>
                  <li>Le remboursement est effectué sur le mode de paiement initial dans les 14 jours suivant la réception du retour.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 6. Garanties */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Shield className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Garanties</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li><strong>Authenticité certifiée</strong> : Gercie vérifie les vendeurs et garantit l’authenticité des produits vendus.</li>
                  <li><strong>Garantie légale de conformité</strong> : 2 ans pour les défauts cachés ou non‑conformités.</li>
                  <li><strong>Garantie de remboursement</strong> : en cas de non‑livraison ou de produit non conforme, l’acheteur est remboursé intégralement.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 7. Responsabilité et litiges */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Scale className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Responsabilité et litiges</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Gercie agit comme intermédiaire et n’est pas responsable du contenu des produits vendus par les vendeurs.</li>
                  <li>En cas de litige, nous proposons une médiation avant toute action judiciaire.</li>
                  <li>La loi applicable est celle de la République Démocratique du Congo, et les tribunaux de Kinshasa sont seuls compétents.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 8. Modification des CGU */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <FileText className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Modification des CGU</h2>
                <p className="text-stone-600">
                  Gercie se réserve le droit de modifier ces conditions à tout moment. Les nouvelles versions seront publiées sur cette page et, pour les modifications importantes, un email vous sera envoyé.
                  Votre utilisation continue de la plateforme après modification vaut acceptation.
                </p>
              </div>
            </div>
          </section>

          {/* 9. Contact */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Contact</h2>
                <p className="text-stone-600">Pour toute question relative aux présentes conditions :</p>
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
              Nous vous remercions de votre confiance et vous souhaitons une excellente expérience sur Gercie.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
