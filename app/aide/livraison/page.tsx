'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Truck,
  MapPin,
  Clock,
  AlertCircle,
  Shield,
  Phone,
  Mail,
  MessageCircle,
  RefreshCw,
  CheckCircle
} from 'lucide-react'

export default function LivraisonPage() {
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
            Retrait & Livraison
          </h1>
          <p className="text-stone-600 text-lg">
            Chez Gercie, nous avons conçu un service de livraison flexible et sécurisé pour que vous receviez vos achats dans les meilleures conditions, où que vous soyez en République Démocratique du Congo.
          </p>

          {/* 1. Deux modes de livraison */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <h2 className="text-xl font-semibold text-stone-800 mb-4 flex items-center gap-2">
              <Truck className="text-amber-600" size={24} />
              Deux modes de livraison selon vos préférences
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Livraison à domicile */}
              <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
                <div className="flex items-center gap-2 mb-3">
                  <Truck className="text-amber-600" size={20} />
                  <h3 className="font-bold text-stone-800">🚚 Livraison à domicile</h3>
                </div>
                <ul className="list-disc list-inside text-sm text-stone-600 space-y-2">
                  <li><strong>Frais</strong> : <span className="font-bold">15 000 FC</span> (≈ 6,67 USD)</li>
                  <li><strong>Délai</strong> : 2 à 5 jours ouvrables (selon zone)</li>
                  <li><strong>Suivi</strong> : lien par email/SMS, le livreur vous contacte</li>
                  <li><strong>Réception</strong> : code PIN à saisir dans votre espace client après réception</li>
                </ul>
              </div>
              {/* Point de retrait */}
              <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="text-amber-600" size={20} />
                  <h3 className="font-bold text-stone-800">📍 Point de retrait</h3>
                </div>
                <ul className="list-disc list-inside text-sm text-stone-600 space-y-2">
                  <li><strong>Frais</strong> : <span className="font-bold">6 000 FC</span> (≈ 2,67 USD)</li>
                  <li><strong>Délai</strong> : 2 à 4 jours ouvrables</li>
                  <li><strong>Retrait</strong> : code PIN à 6 chiffres + pièce d’identité</li>
                  <li><strong>Horaires</strong> : généralement 8h‑18h en semaine</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Suivi de votre commande */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Clock className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Suivi de votre commande</h2>
                <p className="text-stone-600">
                  Dès que votre commande est expédiée, vous recevez un email et un SMS avec :
                </p>
                <ul className="list-disc list-inside text-stone-600 mt-2 space-y-1">
                  <li>Le numéro de suivi</li>
                  <li>Un lien pour suivre le trajet en temps réel</li>
                  <li>Le nom du livreur (le cas échéant)</li>
                </ul>
                <p className="text-stone-600 mt-2">
                  Vous pouvez également suivre l’évolution de votre commande depuis votre espace client, rubrique <strong>“Mes commandes”</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Que faire en cas de retard ou de problème */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Que faire en cas de retard ou de problème ?</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li><strong>Retard de livraison</strong> : contactez notre service client. Nous relançons le transporteur.</li>
                  <li><strong>Colis endommagé</strong> : refusez le colis si l’emballage est détérioré. Prenez des photos et contactez‑nous immédiatement.</li>
                  <li><strong>Absence lors du passage du livreur</strong> : le livreur laisse un avis de passage. Une nouvelle date peut être fixée via votre espace client. Après deux tentatives infructueuses, le colis est retourné et vous serez remboursé (hors frais de livraison).</li>
                  <li><strong>Point de retrait fermé ou indisponible</strong> : nous vous redirigeons vers un point partenaire à proximité.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Responsabilités et assurances */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Shield className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Responsabilités et assurances</h2>
                <ul className="list-disc list-inside text-stone-600 space-y-2">
                  <li>Gercie assure le colis jusqu’à sa remise en main propre ou au point de retrait.</li>
                  <li>En cas de vol ou de perte pendant le transport, vous êtes intégralement remboursé.</li>
                  <li>Les frais de livraison ne sont remboursables qu’en cas d’erreur de notre part (retard excessif, colis perdu).</li>
                  <li>Pour les points de retrait, la responsabilité de Gercie s’arrête au moment où le colis est confié au partenaire. Le code PIN unique garantit que le colis ne peut être remis sans votre accord.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Zones de livraison */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MapPin className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Zones de livraison</h2>
                <p className="text-stone-600">
                  Nous livrons actuellement dans <strong>toutes les communes de Kinshasa</strong> et <strong>les principales villes du pays</strong> (Lubumbashi, Goma, Bukavu, Kisangani, Mbuji‑Mayi, etc.). 
                  Pour les zones plus reculées, le délai peut être légèrement plus long. Une estimation précise vous est donnée lors de la validation de votre commande.
                </p>
              </div>
            </div>
          </section>

          {/* 6. Questions fréquentes */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Questions fréquentes</h2>
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-stone-800">Puis‑je modifier mon adresse de livraison après validation de la commande ?</p>
                    <p className="text-stone-600">Oui, tant que le colis n’a pas été expédié. Contactez‑nous dès que possible via le formulaire de contact ou par téléphone.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-stone-800">Que faire si je n’ai pas reçu mon code PIN ?</p>
                    <p className="text-stone-600">Vérifiez vos spams. Si vous ne le trouvez pas, connectez‑vous à votre espace client, rubrique “Mes commandes”, le code y est également affiché.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-stone-800">Puis‑je faire livrer chez un tiers ?</p>
                    <p className="text-stone-600">Oui, il suffit de renseigner ses coordonnées lors de la commande. Le code PIN sera envoyé à votre numéro, pas à celui du destinataire, pour garantir la sécurité.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 7. Contact */}
          <section className="bg-white rounded-2xl shadow-md p-6 border border-stone-100">
            <div className="flex items-start gap-4">
              <Phone className="text-amber-600 mt-1 flex-shrink-0" size={28} />
              <div>
                <h2 className="text-xl font-semibold text-stone-800 mb-2">Contact</h2>
                <p className="text-stone-600">Pour toute question relative à la livraison :</p>
                <div className="flex flex-wrap gap-4 mt-3">
                  <a href="mailto:gerciemarketplace@gmail.com" className="flex items-center gap-2 text-stone-600 hover:text-amber-600 transition">
                    <Mail size={16} /> gerciemarketplace@gmail.com
                  </a>
                  <a href="https://wa.me/243973868195" target="_blank" className="flex items-center gap-2 text-stone-600 hover:text-amber-600 transition">
                    <MessageCircle size={16} /> WhatsApp +243 973 868 195
                  </a>
                  <span className="flex items-center gap-2 text-stone-600">
                    <Clock size={16} /> Service client : du lundi au samedi, 8h‑18h
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Conclusion */}
          <div className="bg-stone-100 rounded-2xl p-6 text-center">
            <p className="text-stone-700">
              Nous mettons tout en œuvre pour que votre expérience de livraison soit aussi agréable que votre découverte des produits.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
