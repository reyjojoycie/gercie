// features/admin/produits/constants/rich-templates.ts

import type { RichContent, RichSection } from '../types'
import { normalizeRichContent } from '../lib/rich-content-utils'

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export interface RichTemplateDefinition {
  id: string
  label: string
  description: string
  categoryHints: string[]
  build: (context: {
    productName?: string
    category?: string
    description?: string
    specs?: { label: string; value: string }[]
    images?: string[]
    videoUrl?: string | null
  }) => Omit<RichContent, 'enabled' | 'updatedAt'>
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function firstImage(images?: string[]): string | null {
  return images && images.length > 0 ? images[0] : null
}

function secondImage(images?: string[]): string | null {
  return images && images.length > 1 ? images[1] : null
}

function thirdImage(images?: string[]): string | null {
  return images && images.length > 2 ? images[2] : null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  TEMPLATES                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export const RICH_TEMPLATES: RichTemplateDefinition[] = [
  {
    id: 'generic',
    label: 'Standard',
    description: 'Page produit classique, adaptée à la plupart des produits.',
    categoryHints: [],
    build: ({ productName, description, images }) => ({
      templateId: 'generic',
      generatedBy: 'template',
      sourceUrl: null,
      hero: {
        title: productName || 'Présentation du produit',
        subtitle: 'Découvrez ce produit en détail.',
        description: description?.slice(0, 220) || '',
        image: firstImage(images),
        videoUrl: null,
        ctaLabel: 'Voir les caractéristiques',
        ctaAction: 'scroll_specs',
      },
      sections: [
        {
          id: 'generic-overview',
          type: 'text_image',
          title: 'Vue d’ensemble',
          text:
            description ||
            'Ajoutez une description pour présenter ce produit.',
          image: secondImage(images),
          layout: 'image_right',
        },
      ] as RichSection[],
      highlights: [
        {
          title: 'Qualité vérifiée',
          description: 'Produit sélectionné pour son rapport qualité/prix.',
        },
        {
          title: 'Livraison suivie',
          description:
            'Expédition et suivi disponibles selon votre localisation.',
        },
      ],
      specs: [],
      galleries:
        images && images.length > 0
          ? [{ title: 'Galerie produit', images }]
          : [],
      videos: [],
      comparison: null,
      finalCta: {
        title: 'Prêt à commander ?',
        description: 'Ajoutez ce produit à votre panier en quelques clics.',
        buttonLabel: 'Ajouter au panier',
      },
    }),
  },

  {
    id: 'electronics',
    label: 'Électronique',
    description: 'Smartphones, laptops, TV, audio, gaming.',
    categoryHints: [
      'smartphone',
      'telephone',
      'laptop',
      'pc',
      'tv',
      'audio',
      'electronique',
    ],
    build: ({ productName, description, images, videoUrl, specs }) => ({
      templateId: 'electronics',
      generatedBy: 'template',
      sourceUrl: null,
      hero: {
        title: productName || 'Produit électronique',
        subtitle: 'Performance, design et innovation.',
        description: description?.slice(0, 220) || '',
        image: firstImage(images),
        videoUrl: videoUrl || null,
        ctaLabel: 'Découvrir les specs',
        ctaAction: 'scroll_specs',
      },
      sections: [
        {
          id: 'elec-screen',
          type: 'text_image',
          title: 'Écran / Affichage',
          text:
            'Profitez d’un affichage net, lumineux et confortable pour la vidéo, le jeu et la productivité.',
          image: secondImage(images),
          layout: 'image_left',
        },
        {
          id: 'elec-performance',
          type: 'text_image',
          title: 'Performance',
          text:
            'Un processeur puissant pour multitâche, photo, vidéo et applications exigeantes.',
          image: thirdImage(images),
          layout: 'image_right',
        },
        {
          id: 'elec-camera',
          type: 'features_grid',
          title: 'Points forts',
          items: [
            {
              title: 'Photo améliorée',
              description: 'Capteur optimisé pour low-light et zoom.',
            },
            {
              title: 'Batterie longue durée',
              description: 'Autonomie pensée pour l’usage quotidien.',
            },
            {
              title: 'Connectivité rapide',
              description: 'Wi-Fi, Bluetooth et ports modernes.',
            },
            {
              title: 'Design premium',
              description: 'Finition soignée et prise en main agréable.',
            },
          ],
        },
      ] as RichSection[],
      highlights: [
        {
          title: 'Garantie constructeur',
          description: 'Vérifiez les conditions selon le modèle.',
        },
        {
          title: 'Compatible accessoires',
          description: 'Écosystème large d’accessoires disponibles.',
        },
      ],
      specs: specs || [],
      galleries:
        images && images.length > 0
          ? [{ title: 'Galerie technique', images }]
          : [],
      videos: videoUrl ? [{ title: 'Vidéo produit', url: videoUrl }] : [],
      comparison: null,
      finalCta: {
        title: 'Passez à la vitesse supérieure',
        description:
          'Commandez maintenant et bénéficiez d’une livraison suivie.',
        buttonLabel: 'Ajouter au panier',
      },
    }),
  },

  {
    id: 'appliances',
    label: 'Électroménager',
    description: 'Réfrigérateurs, machines à laver, four, climatisation.',
    categoryHints: [
      'refrigerateur',
      'frigo',
      'machine a laver',
      'four',
      'clim',
      'electromenager',
    ],
    build: ({ productName, description, images, specs }) => ({
      templateId: 'appliances',
      generatedBy: 'template',
      sourceUrl: null,
      hero: {
        title: productName || 'Électroménager',
        subtitle: 'Confort, économie et fiabilité au quotidien.',
        description: description?.slice(0, 220) || '',
        image: firstImage(images),
        videoUrl: null,
        ctaLabel: 'Voir les capacités',
        ctaAction: 'scroll_specs',
      },
      sections: [
        {
          id: 'appl-capacity',
          type: 'text_image',
          title: 'Capacité adaptée',
          text:
            'Un volume pensé pour les familles et l’usage quotidien, avec rangement optimisé.',
          image: secondImage(images),
          layout: 'image_right',
        },
        {
          id: 'appl-energy',
          type: 'text_image',
          title: 'Efficacité énergétique',
          text:
            'Consommation maîtrisée pour réduire vos factures tout en gardant de bonnes performances.',
          image: thirdImage(images),
          layout: 'image_left',
        },
        {
          id: 'appl-features',
          type: 'features_grid',
          title: 'Avantages',
          items: [
            {
              title: 'Silencieux',
              description: 'Idéal pour les intérieurs et appartements.',
            },
            {
              title: 'Facile à entretenir',
              description: 'Surfaces et filtres accessibles.',
            },
            {
              title: 'Robuste',
              description: 'Conçu pour durer dans le temps.',
            },
            {
              title: 'Pratique',
              description: 'Commandes simples et programmes utiles.',
            },
          ],
        },
      ] as RichSection[],
      highlights: [
        {
          title: 'Installation possible',
          description: 'Vérifiez les dimensions avant commande.',
        },
        {
          title: 'SAV disponible',
          description: 'Assistance selon marque et modèle.',
        },
      ],
      specs: specs || [],
      galleries:
        images && images.length > 0
          ? [{ title: 'Vue intérieure / extérieure', images }]
          : [],
      videos: [],
      comparison: null,
      finalCta: {
        title: 'Équipez votre maison',
        description:
          'Ajoutez ce produit à votre panier pour préparer votre commande.',
        buttonLabel: 'Ajouter au panier',
      },
    }),
  },

  {
    id: 'automotive',
    label: 'Automobile',
    description: 'Voitures, SUV, véhicules neufs ou occasion.',
    categoryHints: [
      'voiture',
      'auto',
      'suv',
      'toyota',
      'land cruiser',
      'vehicle',
    ],
    build: ({ productName, description, images, videoUrl, specs }) => ({
      templateId: 'automotive',
      generatedBy: 'template',
      sourceUrl: null,
      hero: {
        title: productName || 'Véhicule',
        subtitle: 'Puissance, confort et sécurité.',
        description: description?.slice(0, 220) || '',
        image: firstImage(images),
        videoUrl: videoUrl || null,
        ctaLabel: 'Voir les caractéristiques',
        ctaAction: 'scroll_specs',
      },
      sections: [
        {
          id: 'auto-exterior',
          type: 'full_width_image',
          image: secondImage(images) || firstImage(images) || '',
          caption: 'Design extérieur',
        },
        {
          id: 'auto-engine',
          type: 'text_image',
          title: 'Motorisation',
          text:
            'Un moteur performant, adapté à la ville comme aux longs trajets.',
          image: thirdImage(images),
          layout: 'image_right',
        },
        {
          id: 'auto-interior',
          type: 'text_image',
          title: 'Intérieur premium',
          text:
            'Confort, écran central, sièges ergonomiques et finition soignée.',
          image: firstImage(images),
          layout: 'image_left',
        },
        {
          id: 'auto-safety',
          type: 'features_grid',
          title: 'Sécurité',
          items: [
            {
              title: 'Aide à la conduite',
              description: 'Freinage assisté, alertes, régulation.',
            },
            {
              title: 'Visibilité',
              description: 'Éclairage et caméras selon configuration.',
            },
            {
              title: 'Stabilité',
              description: 'Tenue de route adaptée à plusieurs terrains.',
            },
            {
              title: 'Confort',
              description:
                'Suspension et insonorisation pensées pour la route.',
            },
          ],
        },
      ] as RichSection[],
      highlights: [
        {
          title: 'Entretien accessible',
          description: 'Pièces et services selon marque.',
        },
        {
          title: 'Polyvalent',
          description: 'Ville, route, tout-terrain selon modèle.',
        },
      ],
      specs: specs || [],
      galleries:
        images && images.length > 0
          ? [{ title: 'Galerie véhicule', images }]
          : [],
      videos: videoUrl
        ? [{ title: 'Présentation vidéo', url: videoUrl }]
        : [],
      comparison: null,
      finalCta: {
        title: 'Réservez votre essai ou commande',
        description:
          'Contactez-nous pour disponibilités, coloris et conditions.',
        buttonLabel: 'Ajouter au panier',
      },
    }),
  },

  {
    id: 'luxury',
    label: 'Luxe',
    description: 'Produits premium, montre, sac, parfum, joaillerie.',
    categoryHints: ['luxe', 'montre', 'sac', 'parfum', 'joaillerie', 'premium'],
    build: ({ productName, description, images }) => ({
      templateId: 'luxury',
      generatedBy: 'template',
      sourceUrl: null,
      hero: {
        title: productName || 'Pièce d’exception',
        subtitle: 'L’élégance dans chaque détail.',
        description: description?.slice(0, 220) || '',
        image: firstImage(images),
        videoUrl: null,
        ctaLabel: 'Découvrir',
        ctaAction: 'scroll_specs',
      },
      sections: [
        {
          id: 'lux-story',
          type: 'quote',
          text:
            'Un design intemporel, pensé pour celles et ceux qui recherchent l’excellence.',
          author: 'Collection Premium',
        },
        {
          id: 'lux-materials',
          type: 'text_image',
          title: 'Matériaux nobles',
          text:
            'Finitions soignées, textures précieuses et attention portée aux détails.',
          image: secondImage(images),
          layout: 'image_right',
        },
        {
          id: 'lux-gallery',
          type: 'full_width_image',
          image: thirdImage(images) || firstImage(images) || '',
          caption: 'Sous tous les angles',
        },
      ] as RichSection[],
      highlights: [
        {
          title: 'Édition sélectionnée',
          description: 'Pièce choisie pour son caractère unique.',
        },
        {
          title: 'Emballage soin',
          description: 'Présentation adaptée au cadeau.',
        },
      ],
      specs: [],
      galleries:
        images && images.length > 0
          ? [{ title: 'Galerie premium', images }]
          : [],
      videos: [],
      comparison: null,
      finalCta: {
        title: 'Offrez l’exceptionnel',
        description:
          'Ajoutez cette pièce à votre panier ou à vos favoris.',
        buttonLabel: 'Ajouter au panier',
      },
    }),
  },
]

/* ═══════════════════════════════════════════════════════════════ */
/*  PUBLIC API                                                     */
/* ═══════════════════════════════════════════════════════════════ */

export function getRichTemplateById(templateId?: string | null) {
  return (
    RICH_TEMPLATES.find((template) => template.id === templateId) ||
    RICH_TEMPLATES[0]
  )
}

export function createRichContentFromTemplate(
  templateId: string | null | undefined,
  context: {
    productName?: string
    category?: string
    description?: string
    specs?: { label: string; value: string }[]
    images?: string[]
    videoUrl?: string | null
  }
): RichContent {
  const template = getRichTemplateById(templateId)
  const built = template.build(context)

  return normalizeRichContent({
    ...built,
    enabled: true,
    updatedAt: new Date().toISOString(),
  })
}

export function guessTemplateIdFromCategory(category?: string | null): string {
  const value = String(category || '').toLowerCase()

  for (const template of RICH_TEMPLATES) {
    if (template.categoryHints.some((hint) => value.includes(hint))) {
      return template.id
    }
  }

  return 'generic'
}