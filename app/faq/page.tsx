'use client'

import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, ChevronDown, Search, MessageCircle, Mail, Phone, Sparkles } from 'lucide-react'
import { useState } from 'react'

const faqs = [
  {
    q: "Comment créer un compte Gercie ?",
    a: "Cliquez sur 'Inscription' en haut à droite, remplissez le formulaire (nom, email, mot de passe, question de sécurité) et confirmez votre email. Vous pouvez ensuite vous connecter et commencer à acheter."
  },
  {
    q: "Comment ajouter un produit au panier ?",
    a: "Sur la fiche produit, sélectionnez la taille/couleur si nécessaire, puis cliquez sur 'Ajouter au panier'. Vous pouvez ensuite modifier la quantité dans le panier avant de passer commande."
  },
  {
    q: "Quels sont les modes de paiement acceptés ?",
    a: "Nous acceptons les paiements via votre portefeuille Gercie (recharge mobile money) et directement par mobile money (Orange, Airtel, M-Pesa). Les paiements sont sécurisés et les fonds sont bloqués jusqu'à la livraison."
  },
  {
    q: "Comment suivre ma commande ?",
    a: "Connectez-vous, allez dans 'Mes commandes' et cliquez sur la commande souhaitée. Vous y verrez le statut actuel (en attente, payée, en livraison, livrée) et un lien de suivi en temps réel."
  },
  {
    q: "Que faire si je ne reçois pas mon colis ?",
    a: "Contactez notre service client via le formulaire de contact ou par WhatsApp. Nous vérifierons avec le transporteur et vous tiendrons informé. En cas de perte, vous serez remboursé intégralement."
  },
  {
    q: "Puis-je annuler ou modifier ma commande après validation ?",
    a: "Oui, tant que le colis n'a pas encore été expédié. Connectez-vous à votre espace client, rubrique 'Mes commandes', et cliquez sur 'Annuler'. Pour une modification, contactez-nous rapidement."
  },
  {
    q: "Comment fonctionne la négociation de prix ?",
    a: "Si le produit est marqué 'Négociable', vous pouvez proposer un prix et une quantité via le bouton 'Négocier'. Le vendeur reçoit une notification et peut accepter, refuser ou faire une contre-proposition. Une fois accepté, un code de validation vous est envoyé pour finaliser l'achat au prix convenu."
  },
  {
    q: "Quels sont les frais de livraison ?",
    a: "La livraison à domicile coûte 15 000 FC (≈ 6,67 USD) et le retrait en point relais coûte 6 000 FC (≈ 2,67 USD). Les délais sont de 2 à 5 jours ouvrables selon votre zone."
  },
  {
    q: "Comment devenir vendeur sur Gercie ?",
    a: "Après inscription, allez dans 'Espace vendeur' et suivez le processus d'activation. Vous pouvez activer avec un code d'activation (obtenu auprès de l'équipe Gercie) ou payer 10 000 FC. Une fois activé, vous pouvez ajouter vos produits et gérer vos ventes."
  },
  {
    q: "Comment retirer mes gains ?",
    a: "Dans votre espace vendeur, allez dans 'Mon portefeuille' et cliquez sur 'Demander un retrait'. Les fonds sont transférés vers votre compte mobile money sous 48 heures après validation."
  },
  {
    q: "Puis-je retourner un produit ?",
    a: "Oui, vous disposez de 14 jours à compter de la réception pour retourner un produit, sauf exceptions (articles personnalisés, hygiène). Les frais de retour sont à votre charge sauf en cas de produit défectueux. Voir la page 'Retours et privilèges' pour la procédure."
  },
  {
    q: "Comment contacter le service client ?",
    a: "Vous pouvez nous joindre par email (gerciemarketplace@gmail.com), par WhatsApp (+243 973 868 195) ou par téléphone aux mêmes horaires : du lundi au samedi, 8h – 18h."
  }
]

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredFaqs = faqs.filter(faq =>
    faq.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.a.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          {/* En-tête */}
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-stone-800 mb-2">
              Foire aux questions
            </h1>
            <p className="text-stone-600">
              Trouvez rapidement des réponses à vos questions les plus fréquentes.
            </p>
          </div>

          {/* Barre de recherche */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher une question..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full border border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 outline-none transition"
            />
          </div>

          {/* Liste des FAQ */}
          <div className="bg-white rounded-2xl shadow-md border border-stone-100 overflow-hidden">
            {filteredFaqs.length === 0 ? (
              <div className="p-8 text-center text-stone-500">
                Aucune question ne correspond à votre recherche.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredFaqs.map((faq, i) => (
                  <div key={i} className="last:border-0">
                    <button
                      onClick={() => setOpenIndex(openIndex === i ? null : i)}
                      className="w-full flex justify-between items-center p-5 text-left hover:bg-stone-50 transition-colors group"
                    >
                      <span className="flex items-center gap-3 font-medium text-stone-800">
                        <HelpCircle size={20} className="text-amber-600 flex-shrink-0" />
                        {faq.q}
                      </span>
                      <ChevronDown
                        size={20}
                        className={`text-stone-400 transition-transform duration-200 ${
                          openIndex === i ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <AnimatePresence>
                      {openIndex === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-5 pt-0 text-stone-600 border-t border-stone-100 bg-stone-50/50">
                            {faq.a}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact supplémentaire */}
          <div className="bg-amber-50 rounded-2xl p-6 text-center border border-amber-200">
            <h3 className="font-semibold text-stone-800 mb-2">Vous n'avez pas trouvé votre réponse ?</h3>
            <p className="text-stone-600 text-sm mb-4">
              Notre équipe est à votre disposition pour toute question complémentaire.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href="mailto:gerciemarketplace@gmail.com" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-stone-700 hover:text-amber-600 transition shadow-sm">
                <Mail size={16} /> Email
              </a>
              <a href="https://wa.me/243973868195" target="_blank" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-stone-700 hover:text-amber-600 transition shadow-sm">
                <MessageCircle size={16} /> WhatsApp
              </a>
              <a href="tel:+243973868195" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-stone-700 hover:text-amber-600 transition shadow-sm">
                <Phone size={16} /> Appel
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
