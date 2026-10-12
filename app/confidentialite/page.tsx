'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Shield,
  Eye,
  FileText,
  Mail,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
  Database,
  Users,
  Lock,
  Globe
} from 'lucide-react'

export default function ConfidentialitePage() {
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
            Politique de confidentialité
          </h1>
          <p className="text-stone-600 text-lg">
            Gercie s’engage à protéger vos données personnelles. Nous ne collectons que les informations nécessaires à la gestion de votre compte et au traitement de vos commandes.
          </p>

          {/* 1. Données collectées */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Database className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Données collectées</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-1">
                  <li>Nom, prénom, adresse email, téléphone</li>
                  <li>Adresse de livraison</li>
                  <li>Historique des commandes</li>
                  <li>Données de navigation (cookies)</li>
                  <li>Question de sécurité et réponse (hachée)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Utilisation des données */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Eye className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Utilisation des données</h2>
                <p className="text-stone-600">Vos données sont utilisées uniquement pour :</p>
                <ul className="list-disc list-inside text-stone-600 mt-2 space-y-1">
                  <li>Traitement et livraison des commandes</li>
                  <li>Communication avec le service client</li>
                  <li>Amélioration de nos services</li>
                  <li>Prévention de la fraude et sécurité des transactions</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. Partage des données */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Users className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Partage des données</h2>
                <p className="text-stone-600">
                  Nous ne vendons ni ne louons vos données personnelles. Elles peuvent être partagées uniquement avec :
                </p>
                <ul className="list-disc list-inside text-stone-600 mt-2 space-y-1">
                  <li>Les vendeurs : uniquement les informations nécessaires à la livraison (nom, adresse, téléphone).</li>
                  <li>Les partenaires logistiques : le strict nécessaire pour l’acheminement du colis.</li>
                  <li>Les autorités légales : uniquement si requis par la loi.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Sécurité et conservation */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Lock className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Sécurité et conservation</h2>
                <p className="text-stone-600">
                  Toutes les données sont stockées sur des serveurs sécurisés (Supabase) avec chiffrement en transit et au repos.
                  Vos mots de passe sont hachés et vos questions de sécurité également. Les données sont conservées pendant la durée de votre compte,
                  et archivées légalement après fermeture pendant la durée requise par la loi (5 ans pour les données de transaction).
                </p>
              </div>
            </div>
          </section>

          {/* 5. Vos droits */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <FileText className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Vos droits</h2>
                <p className="text-stone-600">
                  Conformément à la réglementation, vous pouvez :
                </p>
                <ul className="list-disc list-inside text-stone-600 mt-2 space-y-1">
                  <li>Accéder à vos données personnelles</li>
                  <li>Rectifier les informations inexactes</li>
                  <li>Demander la suppression de vos données (sauf pour celles nécessaires à la preuve de transaction)</li>
                  <li>Limiter le traitement de vos données</li>
                  <li>Vous opposer au traitement (dans certaines limites)</li>
                  <li>Demander la portabilité de vos données</li>
                </ul>
                <p className="text-stone-600 mt-3">
                  Pour exercer ces droits, contactez notre délégué à la protection des données à l’adresse :
                  <a href="mailto:gerciemarketplace@gmail.com" className="text-amber-600 ml-1 hover:underline">gerciemarketplace@gmail.com</a>.
                </p>
              </div>
            </div>
          </section>

          {/* 6. Cookies */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Globe className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Cookies</h2>
                <p className="text-stone-600">
                  Nous utilisons des cookies fonctionnels (authentification, panier) et des cookies de mesure d’audience (Google Analytics anonymisé).
                  Vous pouvez désactiver les cookies dans les paramètres de votre navigateur, mais certaines fonctionnalités du site pourraient être limitées.
                </p>
              </div>
            </div>
          </section>

          {/* 7. Modifications de la politique */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <FileText className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Modifications de la politique</h2>
                <p className="text-stone-600">
                  Toute modification de la présente politique de confidentialité vous sera notifiée par email ou par une notification sur le site.
                  Votre utilisation continue de la plateforme après modification vaut acceptation.
                </p>
              </div>
            </div>
          </section>

          {/* 8. Contact */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Contact</h2>
                <p className="text-stone-600">Pour toute question relative à vos données personnelles :</p>
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
              Nous nous engageons à respecter la confidentialité de vos données et à les protéger conformément aux lois en vigueur.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
