'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Shield,
  Truck,
  Heart,
  Users,
  Globe,
  Award,
  Star,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  MapPin,
  Gem,
  Crown
} from 'lucide-react'

export default function AProposPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-1 text-[#C9A962] hover:underline">
            <span className="text-sm">&larr;</span> Retour à l'accueil
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-stone-800 mb-2">
            À propos de Gercie
          </h1>
          <p className="text-stone-600 text-lg">
            Gercie est la marketplace <span className="font-semibold text-[#C9A962]">haut de gamme</span> de la République Démocratique du Congo. 
            Notre mission est de connecter les acheteurs exigeants aux vendeurs de confiance, dans un environnement sécurisé et élégant.
          </p>

          {/* Notre mission */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <Sparkles className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Notre mission</h2>
                <p className="text-stone-600">
                  Créer un espace de confiance où chaque transaction est sécurisée, chaque produit authentifié et chaque client satisfait. 
                  Nous voulons faire de Gercie la référence de l’achat‑vente en ligne en RDC, en alliant innovation, sécurité et élégance.
                </p>
              </div>
            </div>
          </section>

          {/* Nos valeurs */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <Heart className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Nos valeurs</h2>
                <div className="grid md:grid-cols-2 gap-4 mt-3">
                  <div className="flex items-start gap-2">
                    <Gem className="text-[#C9A962] mt-1 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-semibold text-stone-800">Excellence</p>
                      <p className="text-sm text-stone-600">Une sélection rigoureuse de produits d’exception.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield className="text-[#C9A962] mt-1 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-semibold text-stone-800">Sécurité</p>
                      <p className="text-sm text-stone-600">Paiements sécurisés, fonds bloqués jusqu’à livraison.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Truck className="text-[#C9A962] mt-1 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-semibold text-stone-800">Livraison</p>
                      <p className="text-sm text-stone-600">Domicile ou point relais, suivi en temps réel.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="text-[#C9A962] mt-1 flex-shrink-0" size={18} />
                    <div>
                      <p className="font-semibold text-stone-800">Communauté</p>
                      <p className="text-sm text-stone-600">Valoriser les talents congolais et créer du lien.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Notre engagement */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <Crown className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Notre engagement</h2>
                <p className="text-stone-600">
                  Nous soutenons l’économie locale en mettant en avant les talents congolais et en garantissant une expérience d’achat digne des plus grandes places de marché internationales. 
                  Chaque vendeur est vérifié, chaque transaction est sécurisée.
                </p>
              </div>
            </div>
          </section>

          {/* Pourquoi Gercie ? */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <Award className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Pourquoi choisir Gercie ?</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li><strong>Authenticité certifiée</strong> – Pas de contrefaçon.</li>
                  <li><strong>Paiement 100 % sécurisé</strong> – Fonds bloqués jusqu’à livraison.</li>
                  <li><strong>Double devise</strong> – Payez en CDF ou USD.</li>
                  <li><strong>Support client réactif</strong> – 7j/7 par email, WhatsApp et téléphone.</li>
                  <li><strong>Livraison flexible</strong> – À domicile ou en point relais.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Équipe */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <Users className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Notre équipe</h2>
                <p className="text-stone-600">
                  Derrière Gercie, une équipe passionnée d’experts en e‑commerce, en logistique et en sécurité informatique. 
                  Nous sommes basés à Kinshasa et travaillons avec des partenaires dans tout le pays pour vous offrir le meilleur service.
                </p>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-[#E5D4A8]">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-[#C9A962] mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Contactez‑nous</h2>
                <p className="text-stone-600">Une question ? Un projet ? Nous sommes à votre écoute.</p>
                <div className="flex flex-wrap gap-4 mt-3">
                  <a href="mailto:gerciemarketplace@gmail.com" className="flex items-center gap-2 text-stone-600 hover:text-[#C9A962] transition">
                    <Mail size={16} /> gerciemarketplace@gmail.com
                  </a>
                  <a href="https://wa.me/243973868195" target="_blank" className="flex items-center gap-2 text-stone-600 hover:text-[#C9A962] transition">
                    <MessageCircle size={16} /> WhatsApp +243 973 868 195
                  </a>
                  <a href="tel:+243973868195" className="flex items-center gap-2 text-stone-600 hover:text-[#C9A962] transition">
                    <Phone size={16} /> +243 973 868 195
                  </a>
                </div>
                <div className="flex items-center gap-2 mt-2 text-stone-500 text-sm">
                  <MapPin size={14} /> Kinshasa, République Démocratique du Congo
                </div>
                <div className="flex items-center gap-2 mt-1 text-stone-500 text-sm">
                  <Clock size={14} /> Service client : du lundi au samedi, 8h – 18h
                </div>
              </div>
            </div>
          </section>

          {/* Conclusion */}
          <div className="bg-stone-100 rounded-2xl p-6 text-center">
            <p className="text-stone-700">
              Merci de faire confiance à Gercie. Nous sommes fiers de contribuer à l’essor du commerce en ligne en RDC.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
