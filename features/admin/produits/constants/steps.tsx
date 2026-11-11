// features/admin/produits/constants/steps.tsx
'use client'

import {
  DollarSign,
  Image as ImageIcon,
  Info,
  Layers,
  Package,
  Settings2,
  Sparkles,
  Tag,
  Truck,
} from 'lucide-react'

export const PRODUCT_STEPS = [
  {
    id: 'general',
    label: 'Général',
    description: 'Identité du produit',
    icon: <Package size={16} />,
  },
  {
    id: 'media',
    label: 'Médias',
    description: 'Images et vidéo',
    icon: <ImageIcon size={16} />,
  },
  {
    id: 'pricing',
    label: 'Prix & Stock',
    description: 'USD principal, CDF secondaire',
    icon: <DollarSign size={16} />,
  },
  {
    id: 'variants',
    label: 'Variantes',
    description: 'Tailles, couleurs, options',
    icon: <Layers size={16} />,
  },
  {
    id: 'delivery',
    label: 'Livraison',
    description: 'Frais et délais',
    icon: <Truck size={16} />,
  },
  {
    id: 'specs',
    label: 'Spécifications',
    description: 'Poids, dimensions, SKU',
    icon: <Settings2 size={16} />,
  },
  {
    id: 'seo',
    label: 'SEO',
    description: 'Titre et méta description',
    icon: <Tag size={16} />,
  },
  {
    id: 'badges',
    label: 'Badges',
    description: 'Promo, nouveau, top vente',
    icon: <Sparkles size={16} />,
  },
  {
    id: 'rich_content',
    label: 'Page riche',
    description: 'Présentation premium IA',
    icon: <Sparkles size={16} />,
  },
  {
    id: 'details',
    label: 'Détails',
    description: 'Notes internes et finalisation',
    icon: <Info size={16} />,
  },
] as const

export type ProductStepId = (typeof PRODUCT_STEPS)[number]['id']

export const DEFAULT_PRODUCT_STEP_INDEX = 0