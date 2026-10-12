'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Lock,
  Users,
  Scale,
  BarChart3,
  Eye,
  Mail,
  Phone,
  MessageCircle,
  FileText,
  Gem,
  Crown,
  Truck,
  Heart
} from 'lucide-react'

export default function GarantiePage() {
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
          {/* Titre principal */}
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800 mb-2">
            Règles, confidentialité et équilibre des parties
          </h1>
          <p className="text-stone-600 text-lg">
            Gercie est une marketplace <span className="font-semibold text-amber-700">haut de gamme</span> qui place la confiance au cœur de chaque transaction.
            Nous avons conçu nos règles pour protéger chaque utilisateur tout en assurant la pérennité et la qualité de notre service.
          </p>

          {/* Section 1 : Garantie d’authenticité */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <ShieldCheck className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Garantie d’authenticité – notre pierre angulaire</h2>
                <p className="text-stone-600 mb-3">
                  <strong>Engagement Gercie :</strong> Nous vérifions que chaque vendeur est une personne physique ou morale légalement identifiable.
                  En cas de litige sur l’authenticité d’un produit, Gercie agit comme médiateur impartial.
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800 mb-2">Pour l’acheteur</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Tous les produits sont présentés avec une mention “Authentifié” lorsque le vendeur a fourni les justificatifs nécessaires.</li>
                      <li>Si un produit s’avère non conforme (contrefaçon, défaut caché non signalé), l’acheteur bénéficie d’une garantie de remboursement intégral après retour du produit, à condition de nous alerter dans les 14 jours suivant la livraison.</li>
                      <li>Le remboursement est effectué sur le portefeuille Gercie ou par virement selon le mode de paiement initial.</li>
                    </ul>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800 mb-2">Pour le vendeur</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Le vendeur doit fournir des photos de qualité et une description fidèle. Il s’engage à ne pas proposer de contrefaçon.</li>
                      <li>En cas de contestation, Gercie examine les preuves des deux parties. Si le vendeur est en tort, il supporte les frais de retour et la transaction est annulée avec remboursement à l’acheteur.</li>
                      <li>En cas de mauvaise foi avérée de l’acheteur, le vendeur est protégé par notre système d’évaluation et peut faire valoir ses droits via le service client.</li>
                    </ul>
                  </div>
                </div>
                <p className="text-stone-500 text-sm mt-4 italic">
                  Avantage pour Gercie : Cette garantie renforce la confiance, attire une clientèle exigeante et fidélise les vendeurs sérieux. Elle nous positionne comme la référence premium en RDC.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 : Sécurité des transactions */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Lock className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Sécurité des transactions – le séquestre (escrow)</h2>
                <p className="text-stone-600 mb-3">
                  <strong>Principe :</strong> Les fonds de l’acheteur sont bloqués sur son portefeuille Gercie dès la validation de la commande.
                  Ils ne sont libérés au vendeur qu’après confirmation de la bonne livraison (code PIN donné par l’acheteur).
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800 mb-2">Pour l’acheteur</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Aucun risque de paiement sans réception du colis.</li>
                      <li>En cas de litige, les fonds restent bloqués jusqu’à résolution.</li>
                    </ul>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800 mb-2">Pour le vendeur</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Paiement garanti dès que la livraison est confirmée.</li>
                      <li>Pas de risque d’impayé.</li>
                    </ul>
                  </div>
                </div>
                <p className="text-stone-500 text-sm mt-4 italic">
                  Avantage pour Gercie : Notre commission (5 % du montant de la transaction) est prélevée automatiquement lors du déblocage des fonds. Ce modèle nous assure des revenus stables et aligne notre intérêt sur celui des deux parties.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 : Gestion des données personnelles */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <FileText className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Gestion des données personnelles – transparence et contrôle</h2>
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-stone-800">Données collectées</h3>
                    <p className="text-stone-600">Nom, prénom, email, téléphone, adresse de livraison. Historique des commandes et des échanges avec le service client. Données de navigation (cookies) pour améliorer l’expérience.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-800">Utilisation</h3>
                    <p className="text-stone-600">Uniquement pour le traitement des commandes, la communication avec le client, l’amélioration du service et les obligations légales. Aucune donnée n’est vendue à des tiers.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-800">Partage limité</h3>
                    <p className="text-stone-600">Avec les vendeurs : uniquement les informations nécessaires à la livraison (nom, adresse, téléphone). Avec les partenaires logistiques : le strict nécessaire pour l’acheminement du colis.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-stone-800">Droits des utilisateurs</h3>
                    <p className="text-stone-600">Accès, rectification, suppression (sauf pour les données nécessaires à la preuve de transaction). Possibilité de désactiver son compte à tout moment (les données commandes restent archivées pour des raisons légales).</p>
                  </div>
                </div>
                <p className="text-stone-500 text-sm mt-4 italic">
                  Avantage pour Gercie : Une gestion claire et éthique des données renforce la confiance et limite les risques juridiques.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 : Équilibre des obligations */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Scale className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Équilibre des obligations entre acheteur et vendeur</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200">
                        <th className="text-left py-2 px-3 font-semibold text-stone-800">Acheteur</th>
                        <th className="text-left py-2 px-3 font-semibold text-stone-800">Vendeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-stone-100"><td className="py-2 px-3">Fournir des informations exactes pour la livraison.</td><td className="py-2 px-3">Décrire fidèlement le produit (photos, état, défauts).</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2 px-3">Payer le montant convenu via le portefeuille Gercie.</td><td className="py-2 px-3">Livrer le colis dans les délais annoncés.</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2 px-3">Ne pas abuser du droit de rétractation (retours abusifs).</td><td className="py-2 px-3">Accepter les retours justifiés (non‑conformité, vice caché).</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2 px-3">Utiliser le système de négociation intégré pour discuter du prix.</td><td className="py-2 px-3">Répondre aux messages dans un délai raisonnable.</td></tr>
                      <tr className="border-b border-stone-100"><td className="py-2 px-3">Signaler tout problème via le service client et non en dehors de la plateforme.</td><td className="py-2 px-3">Ne pas tenter de conclure une transaction en dehors de Gercie (hors‑plateforme).</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-stone-500 text-sm mt-4 italic">
                  Avantage pour Gercie : Cet équilibre réduit les litiges et les coûts de médiation. Il nous permet de concentrer nos efforts sur l’amélioration du service plutôt que sur la gestion de conflits évitables.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 : Rôle de Gercie */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Users className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Rôle de Gercie – ce que nous apportons</h2>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800">Pour les acheteurs</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Paiement sécurisé par portefeuille virtuel.</li>
                      <li>Livraison flexible (domicile ou point retrait) avec suivi en temps réel.</li>
                      <li>Support client réactif (email, WhatsApp, téléphone).</li>
                      <li>Double devise (CDF/USD) pour une expérience adaptée.</li>
                    </ul>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800">Pour les vendeurs</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Visibilité nationale auprès d’une clientèle exigeante.</li>
                      <li>Outils de gestion (produits, commandes, portefeuille) simples et complets.</li>
                      <li>Paiement rapide après livraison.</li>
                      <li>Données d’analyse (vues, ventes) pour optimiser leur catalogue.</li>
                    </ul>
                  </div>
                  <div className="bg-stone-50 p-4 rounded-xl">
                    <h3 className="font-semibold text-stone-800">Pour Gercie</h3>
                    <ul className="list-disc list-inside text-sm text-stone-600 space-y-1">
                      <li>Une commission de <strong>5%</strong> sur chaque transaction, prélevée automatiquement, nous permet de financer les services (paiement sécurisé, support, marketing).</li>
                      <li>Un modèle win‑win : nous ne réussissons que si nos vendeurs vendent et nos acheteurs sont satisfaits.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 : Règles de confidentialité spécifiques */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Eye className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Règles de confidentialité spécifiques</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li><strong>Accès aux données :</strong> Seuls les membres de l’équipe Gercie strictement nécessaires peuvent accéder aux informations personnelles (support, technique).</li>
                  <li><strong>Sécurité :</strong> Toutes les données sont stockées sur des serveurs sécurisés (Supabase) avec chiffrement en transit et au repos.</li>
                  <li><strong>Cookies :</strong> Nous utilisons des cookies fonctionnels (authentification, panier) et des cookies de mesure d’audience. Vous pouvez les désactiver dans votre navigateur, mais certaines fonctionnalités seront limitées.</li>
                  <li><strong>Modification des règles :</strong> Toute modification des présentes règles sera portée à votre connaissance par email ou notification. Votre utilisation continue de la plateforme après modification vaut acceptation.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 7 : Litiges et médiation */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Litiges et médiation</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li>En cas de désaccord, l’utilisateur doit d’abord contacter le support Gercie.</li>
                  <li>Nous agissons en tant que médiateur impartial.</li>
                  <li>Si aucun accord n’est trouvé, l’utilisateur peut faire appel à un médiateur extérieur (conformément à la législation congolaise) ou engager une action en justice.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 8 : Avantages résumés */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <BarChart3 className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Avantages résumés pour Gercie (notre modèle économique)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Commission 5 %</strong><br/>Revenus récurrents et proportionnels aux ventes.</div>
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Séquestre</strong><br/>Fonds bloqués – sécurité maximale, confiance élevée.</div>
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Garantie d’authenticité</strong><br/>Positionnement exclusif, attractivité pour les grandes marques.</div>
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Outils pour vendeurs</strong><br/>Fidélisation des professionnels.</div>
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Notifications & suivi</strong><br/>Expérience client augmentée, réduction du taux d’abandon.</div>
                  <div className="bg-stone-50 p-3 rounded-lg"><strong>Double devise</strong><br/>Élargissement de la clientèle (diaspora, touristes).</div>
                </div>
              </div>
            </div>
          </section>

          {/* Conclusion et contact */}
          <div className="bg-stone-100 rounded-2xl p-6 text-center">
            <p className="text-stone-700">
              Nous pensons que cet équilibre permet à Gercie de se développer durablement tout en offrant une sécurité et une transparence inégalées sur le marché congolais.
              La garantie d’authenticité n’est pas seulement un argument marketing : c’est la fondation de notre marque.
            </p>
            <p className="mt-4 text-stone-600">
              Pour toute question, vous pouvez consulter notre <Link href="/faq" className="text-amber-600 underline">FAQ</Link> ou contacter le service client via{' '}
              <a href="mailto:gerciemarketplace@gmail.com" className="text-amber-600 underline">gerciemarketplace@gmail.com</a>.
            </p>
            <div className="flex justify-center gap-4 mt-4">
              <a href="mailto:gerciemarketplace@gmail.com" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-amber-600"><Mail size={16} /> Email</a>
              <a href="tel:+243973868195" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-amber-600"><Phone size={16} /> Téléphone</a>
              <a href="https://wa.me/243973868195" target="_blank" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-amber-600"><MessageCircle size={16} /> WhatsApp</a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
