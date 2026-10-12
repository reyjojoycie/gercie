// components/badges/badgeConfig.ts
import React from 'react'
import {
  Sparkles, RefreshCw, ThumbsUp, Monitor, Wrench, Tag, Percent,
  Layers, Zap, Gift, Truck, Clock, Store, Globe, Undo2, MapPin,
  TrendingUp, Star, Heart, BarChart3, Award, Eye, Shield, AlertTriangle,
  Hourglass, Calendar, RotateCcw, BadgeCheck, ShieldCheck, Leaf,
  FileCheck, Tractor, FlaskConical, Package,
} from 'lucide-react'

export type BadgeCategory =
  | 'etat'
  | 'offre'
  | 'logistique'
  | 'popularite'
  | 'exclusivite'
  | 'confiance'

export interface BadgeDefinition {
  id: string
  label: string
  category: BadgeCategory
  icon: React.ReactNode
  color: {
    bg: string
    text: string
    border: string
    bgDark: string
    textDark: string
    borderDark: string
  }
  priority: number
  auto?: boolean
  description?: string
}

// Liste complète des 36 badges
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // État & Condition
  { id: 'neuf', label: 'Neuf', category: 'etat', icon: React.createElement(Sparkles, { size: 12 }), color: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', bgDark: 'dark:bg-blue-900/30', textDark: 'dark:text-blue-300', borderDark: 'dark:border-blue-800' }, priority: 10, description: 'Produit sorti d\'usine, jamais déballé.' },
  { id: 'reconditionne', label: 'Reconditionné', category: 'etat', icon: React.createElement(RefreshCw, { size: 12 }), color: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200', bgDark: 'dark:bg-indigo-900/30', textDark: 'dark:text-indigo-300', borderDark: 'dark:border-indigo-800' }, priority: 10, description: 'Remis à neuf et testé avec garantie.' },
  { id: 'occasion-comme-neuf', label: 'Occasion - Comme neuf', category: 'etat', icon: React.createElement(ThumbsUp, { size: 12 }), color: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', bgDark: 'dark:bg-green-900/30', textDark: 'dark:text-green-300', borderDark: 'dark:border-green-800' }, priority: 10 },
  { id: 'occasion-bon-etat', label: 'Occasion - Bon état', category: 'etat', icon: React.createElement(ThumbsUp, { size: 12 }), color: { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-200', bgDark: 'dark:bg-lime-900/30', textDark: 'dark:text-lime-300', borderDark: 'dark:border-lime-800' }, priority: 10 },
  { id: 'exposition', label: 'Modèle d\'exposition', category: 'etat', icon: React.createElement(Monitor, { size: 12 }), color: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', bgDark: 'dark:bg-amber-900/30', textDark: 'dark:text-amber-300', borderDark: 'dark:border-amber-800' }, priority: 10 },
  { id: 'pieces', label: 'Pour pièces / À réparer', category: 'etat', icon: React.createElement(Wrench, { size: 12 }), color: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', bgDark: 'dark:bg-red-900/30', textDark: 'dark:text-red-300', borderDark: 'dark:border-red-800' }, priority: 10 },

  // Offres Commerciales
  { id: 'solde', label: 'Solde', category: 'offre', icon: React.createElement(Tag, { size: 12 }), color: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', bgDark: 'dark:bg-red-900/30', textDark: 'dark:text-red-300', borderDark: 'dark:border-red-800' }, priority: 20 },
  { id: 'promotion', label: 'Promotion', category: 'offre', icon: React.createElement(Percent, { size: 12 }), color: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200', bgDark: 'dark:bg-pink-900/30', textDark: 'dark:text-pink-300', borderDark: 'dark:border-pink-800' }, priority: 20 },
  { id: 'lot-degressif', label: 'Lot dégressif', category: 'offre', icon: React.createElement(Layers, { size: 12 }), color: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', bgDark: 'dark:bg-purple-900/30', textDark: 'dark:text-purple-300', borderDark: 'dark:border-purple-800' }, priority: 20 },
  { id: 'offre-flash', label: 'Offre Flash', category: 'offre', icon: React.createElement(Zap, { size: 12 }), color: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200', bgDark: 'dark:bg-orange-900/30', textDark: 'dark:text-orange-300', borderDark: 'dark:border-orange-800' }, priority: 20 },
  { id: 'cadeau-offert', label: 'Cadeau offert', category: 'offre', icon: React.createElement(Gift, { size: 12 }), color: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', bgDark: 'dark:bg-rose-900/30', textDark: 'dark:text-rose-300', borderDark: 'dark:border-rose-800' }, priority: 20 },
  { id: 'prix-choc', label: 'Prix choc', category: 'offre', icon: React.createElement(Zap, { size: 12 }), color: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', bgDark: 'dark:bg-yellow-900/30', textDark: 'dark:text-yellow-300', borderDark: 'dark:border-yellow-800' }, priority: 20 },

  // Logistique & Livraison
  { id: 'livraison-gratuite', label: 'Livraison gratuite', category: 'logistique', icon: React.createElement(Truck, { size: 12 }), color: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', bgDark: 'dark:bg-green-900/30', textDark: 'dark:text-green-300', borderDark: 'dark:border-green-800' }, priority: 15 },
  { id: 'expedie-24h', label: 'Expédié en 24h', category: 'logistique', icon: React.createElement(Clock, { size: 12 }), color: { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200', bgDark: 'dark:bg-cyan-900/30', textDark: 'dark:text-cyan-300', borderDark: 'dark:border-cyan-800' }, priority: 15 },
  { id: 'retrait-magasin', label: 'Retrait magasin', category: 'logistique', icon: React.createElement(Store, { size: 12 }), color: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200', bgDark: 'dark:bg-teal-900/30', textDark: 'dark:text-teal-300', borderDark: 'dark:border-teal-800' }, priority: 15 },
  { id: 'expedition-internationale', label: 'Expédition internationale', category: 'logistique', icon: React.createElement(Globe, { size: 12 }), color: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200', bgDark: 'dark:bg-sky-900/30', textDark: 'dark:text-sky-300', borderDark: 'dark:border-sky-800' }, priority: 15 },
  { id: 'retour-gratuit', label: 'Retour gratuit', category: 'logistique', icon: React.createElement(Undo2, { size: 12 }), color: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', bgDark: 'dark:bg-emerald-900/30', textDark: 'dark:text-emerald-300', borderDark: 'dark:border-emerald-800' }, priority: 15 },
  { id: 'stock-local', label: 'Stock local', category: 'logistique', icon: React.createElement(MapPin, { size: 12 }), color: { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-200', bgDark: 'dark:bg-lime-900/30', textDark: 'dark:text-lime-300', borderDark: 'dark:border-lime-800' }, priority: 15 },

  // Popularité & Preuve Sociale
  { id: 'top-vente', label: 'Top vente', category: 'popularite', icon: React.createElement(TrendingUp, { size: 12 }), color: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', bgDark: 'dark:bg-amber-900/30', textDark: 'dark:text-amber-300', borderDark: 'dark:border-amber-800' }, priority: 5, auto: true },
  { id: 'mieux-note', label: 'Mieux noté', category: 'popularite', icon: React.createElement(Star, { size: 12 }), color: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', bgDark: 'dark:bg-yellow-900/30', textDark: 'dark:text-yellow-300', borderDark: 'dark:border-yellow-800' }, priority: 5, auto: true },
  { id: 'coup-de-coeur', label: 'Coup de cœur', category: 'popularite', icon: React.createElement(Heart, { size: 12 }), color: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', bgDark: 'dark:bg-red-900/30', textDark: 'dark:text-red-300', borderDark: 'dark:border-red-800' }, priority: 5 },
  { id: 'tendance', label: 'Tendance', category: 'popularite', icon: React.createElement(BarChart3, { size: 12 }), color: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-200', bgDark: 'dark:bg-fuchsia-900/30', textDark: 'dark:text-fuchsia-300', borderDark: 'dark:border-fuchsia-800' }, priority: 5, auto: true },
  { id: 'recommande', label: 'Recommandé', category: 'popularite', icon: React.createElement(Award, { size: 12 }), color: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', bgDark: 'dark:bg-amber-900/30', textDark: 'dark:text-amber-300', borderDark: 'dark:border-amber-800' }, priority: 5 },
  { id: 'deja-vu', label: 'Déjà vu X fois', category: 'popularite', icon: React.createElement(Eye, { size: 12 }), color: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200', bgDark: 'dark:bg-gray-800', textDark: 'dark:text-gray-300', borderDark: 'dark:border-gray-700' }, priority: 5, auto: true },

  // Exclusivité & Disponibilité Stock
  { id: 'edition-limitee', label: 'Édition limitée', category: 'exclusivite', icon: React.createElement(Star, { size: 12 }), color: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', bgDark: 'dark:bg-purple-900/30', textDark: 'dark:text-purple-300', borderDark: 'dark:border-purple-800' }, priority: 3 },
  { id: 'exclusivite-gercie', label: 'Exclusivité Gercie', category: 'exclusivite', icon: React.createElement(Shield, { size: 12 }), color: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', bgDark: 'dark:bg-rose-900/30', textDark: 'dark:text-rose-300', borderDark: 'dark:border-rose-800' }, priority: 3 },
  { id: 'stock-faible', label: 'Stock faible', category: 'exclusivite', icon: React.createElement(AlertTriangle, { size: 12 }), color: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200', bgDark: 'dark:bg-orange-900/30', textDark: 'dark:text-orange-300', borderDark: 'dark:border-orange-800' }, priority: 2, auto: true },
  { id: 'derniers-exemplaires', label: 'Derniers exemplaires', category: 'exclusivite', icon: React.createElement(Hourglass, { size: 12 }), color: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', bgDark: 'dark:bg-red-900/30', textDark: 'dark:text-red-300', borderDark: 'dark:border-red-800' }, priority: 2, auto: true },
  { id: 'precommande', label: 'Précommande', category: 'exclusivite', icon: React.createElement(Calendar, { size: 12 }), color: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200', bgDark: 'dark:bg-indigo-900/30', textDark: 'dark:text-indigo-300', borderDark: 'dark:border-indigo-800' }, priority: 4 },
  { id: 'bientot-retour', label: 'Bientôt de retour', category: 'exclusivite', icon: React.createElement(RotateCcw, { size: 12 }), color: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200', bgDark: 'dark:bg-gray-800', textDark: 'dark:text-gray-300', borderDark: 'dark:border-gray-700' }, priority: 4 },

  // Origine, Garantie & Confiance
  { id: 'certifie-authentique', label: 'Certifié authentique', category: 'confiance', icon: React.createElement(BadgeCheck, { size: 12 }), color: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', bgDark: 'dark:bg-blue-900/30', textDark: 'dark:text-blue-300', borderDark: 'dark:border-blue-800' }, priority: 8 },
  { id: 'garantie-2-ans', label: 'Garantie 2 ans', category: 'confiance', icon: React.createElement(ShieldCheck, { size: 12 }), color: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200', bgDark: 'dark:bg-teal-900/30', textDark: 'dark:text-teal-300', borderDark: 'dark:border-teal-800' }, priority: 8 },
  { id: 'eco-responsable', label: 'Éco-responsable', category: 'confiance', icon: React.createElement(Leaf, { size: 12 }), color: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', bgDark: 'dark:bg-green-900/30', textDark: 'dark:text-green-300', borderDark: 'dark:border-green-800' }, priority: 8 },
  { id: 'conforme-ce', label: 'Conforme CE', category: 'confiance', icon: React.createElement(FileCheck, { size: 12 }), color: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200', bgDark: 'dark:bg-sky-900/30', textDark: 'dark:text-sky-300', borderDark: 'dark:border-sky-800' }, priority: 8 },
  { id: 'direct-producteur', label: 'Direct producteur', category: 'confiance', icon: React.createElement(Tractor, { size: 12 }), color: { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-200', bgDark: 'dark:bg-lime-900/30', textDark: 'dark:text-lime-300', borderDark: 'dark:border-lime-800' }, priority: 8 },
  { id: 'teste-laboratoire', label: 'Testé en laboratoire', category: 'confiance', icon: React.createElement(FlaskConical, { size: 12 }), color: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', bgDark: 'dark:bg-purple-900/30', textDark: 'dark:text-purple-300', borderDark: 'dark:border-purple-800' }, priority: 8 },
]

export const BADGE_CATEGORIES: { key: BadgeCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'etat', label: 'État & Condition', icon: React.createElement(Package, { size: 16 }) },
  { key: 'offre', label: 'Offres Commerciales', icon: React.createElement(Percent, { size: 16 }) },
  { key: 'logistique', label: 'Logistique & Livraison', icon: React.createElement(Truck, { size: 16 }) },
  { key: 'popularite', label: 'Popularité & Preuve Sociale', icon: React.createElement(TrendingUp, { size: 16 }) },
  { key: 'exclusivite', label: 'Exclusivité & Stock', icon: React.createElement(AlertTriangle, { size: 16 }) },
  { key: 'confiance', label: 'Origine, Garantie & Confiance', icon: React.createElement(ShieldCheck, { size: 16 }) },
]