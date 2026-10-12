// components/FooterReassurance.tsx
'use client'

import { motion } from 'framer-motion'
import { Container } from '@/components/layout/Container'
import { Tooltip } from '@/components/ui/Tooltip'
import Link from 'next/link'
import {
  Shield, Truck, RefreshCcw, Headset, CreditCard, BadgeCheck,
  Sparkles, ThumbsUp, Lock, Clock, MapPin, Heart
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========================================================================== */
/*  Configuration (évite les icônes déjà très utilisées ailleurs)              */
/* ========================================================================== */
const reassurances = [
  {
    icon: <Lock size={20} className="text-gold-400" />,
    title: 'Paiement 100 % sécurisé',
    subtitle: 'Cryptage SSL & 3D Secure',
    href: '/securite',
    tooltip: 'Vos données bancaires sont protégées par un cryptage de niveau bancaire.',
  },
  {
    icon: <Clock size={20} className="text-gold-400" />,
    title: 'Livraison express',
    subtitle: '24-48h à Kinshasa',
    href: '/livraison',
    tooltip: 'Expédition rapide le jour même pour toute commande avant 14h.',
  },
  {
    icon: <RefreshCcw size={20} className="text-gold-400" />,
    title: 'Retours gratuits',
    subtitle: 'Sous 15 jours',
    href: '/retours',
    tooltip: 'Changez d’avis ? Retournez votre article sans frais.',
  },
  {
    icon: <Headset size={20} className="text-gold-400" />,
    title: 'Support 7j/7',
    subtitle: 'Par chat, email & téléphone',
    href: '/support',
    tooltip: 'Notre équipe est disponible pour vous aider à tout moment.',
  },
  {
    icon: <BadgeCheck size={20} className="text-gold-400" />,
    title: 'Produits authentiques',
    subtitle: 'Garantis par nos experts',
    href: '/authenticite',
    tooltip: 'Tous nos produits sont vérifiés et accompagnés de leur garantie.',
  },
  {
    icon: <MapPin size={20} className="text-gold-400" />,
    title: 'Click & Collect',
    subtitle: 'Points retrait partout en RDC',
    href: '/points-retrait',
    tooltip: 'Retirez votre commande dans le point de retrait le plus proche.',
  },
  {
    icon: <Heart size={20} className="text-gold-400" />,
    title: 'Satisfaction garantie',
    subtitle: 'Ou remboursé',
    href: '/satisfaction',
    tooltip: '98 % de nos clients recommandent Gercie.',
  },
  {
    icon: <Sparkles size={20} className="text-gold-400" />,
    title: 'Offres exclusives',
    subtitle: 'Promos & ventes flash',
    href: '/deals',
    tooltip: 'Profitez de réductions toute l’année.',
  },
]

/* ========================================================================== */
/*  Composant                                                                  */
/* ========================================================================== */
export default function FooterReassurance() {
  return (
    <div className="border-t border-gold-400/20 bg-gradient-to-r from-midnight-900/50 via-midnight-800/30 to-midnight-900/50 py-8 md:py-10">
      <Container>
        {/* Sur mobile : carrousel horizontal ; sur desktop : grille 4 colonnes */}
        <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-8 gap-4">
          {reassurances.map((item, idx) => (
            <Tooltip key={idx} content={item.tooltip} delay={200}>
              <motion.div
                whileHover={{ y: -3 }}
                className="flex flex-col items-center text-center group cursor-default"
              >
                <Link
                  href={item.href}
                  className="flex flex-col items-center gap-2 hover:no-underline"
                >
                  <div className="p-2.5 rounded-xl bg-gold-400/10 group-hover:bg-gold-400/20 transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-xs font-semibold text-foreground leading-tight">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight hidden lg:block">
                    {item.subtitle}
                  </span>
                </Link>
              </motion.div>
            </Tooltip>
          ))}
        </div>

        {/* Vue mobile : carrousel */}
        <div className="flex md:hidden gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {reassurances.map((item, idx) => (
            <Tooltip key={idx} content={item.tooltip}>
              <Link
                href={item.href}
                className="min-w-[120px] flex-shrink-0 flex flex-col items-center text-center gap-1.5 snap-start"
              >
                <div className="p-2 rounded-lg bg-gold-400/10">
                  {item.icon}
                </div>
                <span className="text-xs font-medium text-foreground leading-tight">
                  {item.title}
                </span>
              </Link>
            </Tooltip>
          ))}
        </div>
      </Container>
    </div>
  )
}