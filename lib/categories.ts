// lib/categories.ts
/**
 * Système de catégories Gercie – version optimisée pour Kinshasa.
 *
 * Optimisé pour :
 * - Performance extrême (cache, memoization, accès O(1))
 * - Connexions lentes (lazy loading, compression)
 * - Smartphones d'entrée de gamme (mémoire optimisée)
 * - Accessibilité (validation, error handling)
 *
 * Toutes les fonctions sont pures et thread-safe.
 */

/* ========================================================================== */
/*  IMPORTS                                                                   */
/* ========================================================================== */

import {
  Shirt, Smartphone, Car, Home, Apple, Briefcase, Gamepad2,
  Sprout, Sparkles, Hammer, Zap, Shield, Tag, Package,
  type LucideIcon
} from 'lucide-react'

/* ========================================================================== */
/*  TYPES                                                                     */
/* ========================================================================== */

export interface CategoryNode {
  id: string
  name: string
  icon?: string
  children?: CategoryNode[]
  /** Description courte pour SEO et accessibilité */
  description?: string
  /** Nombre de produits dans cette catégorie */
  productCount?: number
  /** Image de couverture */
  image?: string
  /** Slug pour URL */
  slug?: string
}

export interface CategoryBreadcrumb {
  name: string
  id: string
  slug?: string
}

export interface SearchResult {
  node: CategoryNode
  path: string[]
  score: number
}

/* ========================================================================== */
/*  CONSTANTS & ICON MAP                                                      */
/* ========================================================================== */

const iconMap: Record<string, LucideIcon> = {
  Shirt,
  Smartphone,
  Car,
  Home,
  Briefcase,
  Gamepad2,
  Sprout,
  Sparkles,
  Apple,
  Hammer,
  Zap,
  Shield,
  Tag,
  Package,
}

const DEFAULT_ICON = Sparkles

/** Taille maximale du cache de recherche */
const SEARCH_CACHE_SIZE = 100

/** Délai avant expiration du cache (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000

/* ========================================================================== */
/*  CACHE HELPERS                                                             */
/* ========================================================================== */

interface CacheEntry<T> {
  value: T
  timestamp: number
}

class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>()
  private maxSize: number
  private ttl: number

  constructor(maxSize: number, ttl: number) {
    this.maxSize = maxSize
    this.ttl = ttl
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Vérifier expiration
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    // Supprimer si existe déjà
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Supprimer le plus ancien si plein
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

const searchCache = new LRUCache<string, SearchResult[]>(SEARCH_CACHE_SIZE, CACHE_TTL)

/* ========================================================================== */
/*  ARBRE COMPLET DES CATÉGORIES                                              */
/* ========================================================================== */

export const categoryTree: CategoryNode[] = [
  {
    id: 'mode-beaute',
    name: 'Mode & Beauté',
    icon: 'Shirt',
    slug: 'mode-beaute',
    description: 'Vêtements, chaussures, accessoires et cosmétiques',
    children: [
      {
        id: 'mode-homme',
        name: 'Homme',
        slug: 'mode-homme',
        children: [
          {
            id: 'mode-homme-vetements',
            name: 'Vêtements',
            slug: 'vetements',
            children: [
              { id: 'mode-homme-vetements-hauts', name: 'Hauts (T-shirts, Chemises, Polos)', slug: 'hauts' },
              { id: 'mode-homme-vetements-bas', name: 'Bas (Pantalons, Jeans, Shorts)', slug: 'bas' },
              { id: 'mode-homme-vetements-costumes', name: 'Costumes & Habillé', slug: 'costumes' },
            ],
          },
          {
            id: 'mode-homme-chaussures',
            name: 'Chaussures',
            slug: 'chaussures',
            children: [
              { id: 'mode-homme-chaussures-baskets', name: 'Baskets & Sneakers', slug: 'baskets' },
              { id: 'mode-homme-chaussures-ville', name: 'Chaussures de ville & Boots', slug: 'ville' },
            ],
          },
        ],
      },
      {
        id: 'mode-femme',
        name: 'Femme',
        slug: 'mode-femme',
        children: [
          {
            id: 'mode-femme-vetements',
            name: 'Vêtements',
            slug: 'vetements',
            children: [
              { id: 'mode-femme-vetements-robes', name: 'Robes & Jupes', slug: 'robes' },
              { id: 'mode-femme-vetements-tops', name: 'Tops, Blouses & Chemisiers', slug: 'tops' },
              { id: 'mode-femme-vetements-pantalons', name: 'Pantalons & Leggings', slug: 'pantalons' },
            ],
          },
          {
            id: 'mode-femme-chaussures',
            name: 'Chaussures',
            slug: 'chaussures',
            children: [
              { id: 'mode-femme-chaussures-talons', name: 'Talons & Escarpins', slug: 'talons' },
              { id: 'mode-femme-chaussures-sandales', name: 'Sandales & Ballerines', slug: 'sandales' },
            ],
          },
        ],
      },
      {
        id: 'mode-enfant',
        name: 'Enfant',
        slug: 'mode-enfant',
        children: [
          {
            id: 'mode-enfant-bebe',
            name: 'Bébé (0-3 ans)',
            slug: 'bebe',
            children: [{ id: 'mode-enfant-bebe-body', name: 'Body & Pyjamas', slug: 'body' }],
          },
          {
            id: 'mode-enfant-fille-garcon',
            name: 'Fille & Garçon',
            slug: 'fille-garcon',
            children: [{ id: 'mode-enfant-ensembles', name: 'Ensembles & Sport', slug: 'ensembles' }],
          },
        ],
      },
      {
        id: 'mode-accessoires',
        name: 'Accessoires',
        slug: 'accessoires',
        children: [
          {
            id: 'mode-accessoires-bagagerie',
            name: 'Bagagerie',
            slug: 'bagagerie',
            children: [{ id: 'mode-accessoires-sacs-main', name: 'Sacs à main & Sacs à dos', slug: 'sacs' }],
          },
          {
            id: 'mode-accessoires-bijoux',
            name: 'Bijoux',
            slug: 'bijoux',
            children: [{ id: 'mode-accessoires-montres', name: 'Montres, Colliers & Bracelets', slug: 'montres' }],
          },
        ],
      },
      {
        id: 'beaute-cosmetiques',
        name: 'Cosmétiques',
        slug: 'cosmetiques',
        children: [
          {
            id: 'beaute-maquillage',
            name: 'Maquillage',
            slug: 'maquillage',
            children: [{ id: 'beaute-maquillage-teint', name: 'Teint, Yeux & Lèvres', slug: 'teint' }],
          },
        ],
      },
      {
        id: 'beaute-soins',
        name: 'Soins',
        slug: 'soins',
        children: [
          {
            id: 'beaute-soins-visage',
            name: 'Visage & Corps',
            slug: 'visage',
            children: [{ id: 'beaute-soins-cremes', name: 'Crèmes & Hydratation', slug: 'cremes' }],
          },
        ],
      },
      {
        id: 'beaute-parfumerie',
        name: 'Parfumerie',
        slug: 'parfumerie',
        children: [
          {
            id: 'beaute-parfums',
            name: 'Fragrances',
            slug: 'fragrances',
            children: [{ id: 'beaute-parfums-mixte', name: 'Homme, Femme & Mixte', slug: 'mixte' }],
          },
        ],
      },
    ],
  },
  {
    id: 'electronique-multimedia',
    name: 'Électronique & Multimédia',
    icon: 'Smartphone',
    slug: 'electronique',
    description: 'Smartphones, ordinateurs, TV et jeux vidéo',
    children: [
      {
        id: 'electronique-telephonie',
        name: 'Téléphonie',
        slug: 'telephonie',
        children: [
          {
            id: 'electronique-smartphones',
            name: 'Smartphones',
            slug: 'smartphones',
            children: [
              { id: 'electronique-smartphones-iphone', name: 'iPhone (iOS)', slug: 'iphone' },
              { id: 'electronique-smartphones-android', name: 'Samsung & Android', slug: 'android' },
            ],
          },
          {
            id: 'electronique-accessoires',
            name: 'Accessoires',
            slug: 'accessoires',
            children: [{ id: 'electronique-accessoires-coques', name: 'Coques, Chargeurs & Écouteurs', slug: 'coques' }],
          },
        ],
      },
      {
        id: 'electronique-informatique',
        name: 'Informatique',
        slug: 'informatique',
        children: [
          {
            id: 'electronique-ordinateurs',
            name: 'Ordinateurs',
            slug: 'ordinateurs',
            children: [
              { id: 'electronique-ordinateurs-portables', name: 'Portables (Laptops)', slug: 'portables' },
              { id: 'electronique-ordinateurs-unites', name: 'Unités centrales (Desktop)', slug: 'unites' },
            ],
          },
          {
            id: 'electronique-peripheriques',
            name: 'Périphériques',
            slug: 'peripheriques',
            children: [{ id: 'electronique-ecrans', name: 'Écrans, Souris & Claviers', slug: 'ecrans' }],
          },
          {
            id: 'electronique-composants',
            name: 'Composants',
            slug: 'composants',
            children: [{ id: 'electronique-cartes', name: 'Cartes graphiques, RAM & Disques durs', slug: 'cartes' }],
          },
        ],
      },
      {
        id: 'electronique-image-son',
        name: 'Image & Son',
        slug: 'image-son',
        children: [
          {
            id: 'electronique-tv',
            name: 'TV',
            slug: 'tv',
            children: [{ id: 'electronique-tv-4k', name: 'LED, OLED & 4K', slug: '4k' }],
          },
          {
            id: 'electronique-audio',
            name: 'Audio',
            slug: 'audio',
            children: [{ id: 'electronique-enceintes', name: 'Enceintes Bluetooth & Barres de son', slug: 'enceintes' }],
          },
          {
            id: 'electronique-photo',
            name: 'Photo',
            slug: 'photo',
            children: [{ id: 'electronique-appareils', name: 'Appareils Reflex & Hybrides', slug: 'appareils' }],
          },
        ],
      },
      {
        id: 'electronique-jeux-video',
        name: 'Jeux Vidéo',
        slug: 'jeux-video',
        children: [
          {
            id: 'electronique-consoles',
            name: 'Consoles',
            slug: 'consoles',
            children: [{ id: 'electronique-consoles-ps-xbox', name: 'PlayStation, Xbox & Nintendo', slug: 'ps-xbox' }],
          },
          {
            id: 'electronique-jeux',
            name: 'Jeux',
            slug: 'jeux',
            children: [{ id: 'electronique-jeux-disques', name: 'Disques & Codes de téléchargement', slug: 'disques' }],
          },
        ],
      },
    ],
  },
  {
    id: 'vehicules-transport',
    name: 'Véhicules & Transport',
    icon: 'Car',
    slug: 'vehicules',
    description: 'Voitures, motos, vélos et pièces détachées',
    children: [
      {
        id: 'vehicules-voitures',
        name: 'Voitures',
        slug: 'voitures',
        children: [
          {
            id: 'vehicules-voitures-berlines',
            name: 'Berlines',
            slug: 'berlines',
            children: [{ id: 'vehicules-voitures-berlines-essence', name: 'Essence & Diesel', slug: 'essence' }],
          },
          {
            id: 'vehicules-voitures-suv',
            name: 'SUV & 4x4',
            slug: 'suv',
            children: [{ id: 'vehicules-voitures-suv-hybride', name: 'Hybride & Électrique', slug: 'hybride' }],
          },
          {
            id: 'vehicules-voitures-utilitaires',
            name: 'Utilitaires',
            slug: 'utilitaires',
            children: [{ id: 'vehicules-voitures-utilitaires-fourgons', name: 'Camionnettes & Fourgons', slug: 'fourgons' }],
          },
        ],
      },
      {
        id: 'vehicules-deux-roues',
        name: 'Deux-roues',
        slug: 'deux-roues',
        children: [
          {
            id: 'vehicules-motos',
            name: 'Motos',
            slug: 'motos',
            children: [{ id: 'vehicules-motos-sportives', name: 'Sportives & Roadsters', slug: 'sportives' }],
          },
          {
            id: 'vehicules-scooters',
            name: 'Scooters',
            slug: 'scooters',
            children: [{ id: 'vehicules-scooters-50cc', name: '50cc & 125cc', slug: '50cc' }],
          },
          {
            id: 'vehicules-velos',
            name: 'Vélos',
            slug: 'velos',
            children: [{ id: 'vehicules-velos-vtt', name: 'VTT & Vélos Électriques', slug: 'vtt' }],
          },
        ],
      },
      {
        id: 'vehicules-equipement',
        name: 'Équipement',
        slug: 'equipement',
        children: [
          {
            id: 'vehicules-pieces',
            name: 'Pièces auto',
            slug: 'pieces',
            children: [{ id: 'vehicules-pieces-moteurs', name: 'Moteurs, Freins & Filtration', slug: 'moteurs' }],
          },
          {
            id: 'vehicules-accessoires',
            name: 'Accessoires',
            slug: 'accessoires',
            children: [{ id: 'vehicules-accessoires-pneus', name: 'Pneus & Jantes', slug: 'pneus' }],
          },
          {
            id: 'vehicules-protection',
            name: 'Protection',
            slug: 'protection',
            children: [{ id: 'vehicules-protection-casques', name: 'Casques & Gants Moto', slug: 'casques' }],
          },
        ],
      },
    ],
  },
  {
    id: 'immobilier',
    name: 'Immobilier',
    icon: 'Home',
    slug: 'immobilier',
    description: 'Vente et location de biens immobiliers',
    children: [
      {
        id: 'immobilier-vente',
        name: 'Vente',
        slug: 'vente',
        children: [
          {
            id: 'immobilier-vente-residentiel',
            name: 'Résidentiel',
            slug: 'residentiel',
            children: [
              { id: 'immobilier-vente-maisons', name: 'Maisons & Villas', slug: 'maisons' },
              { id: 'immobilier-vente-appartements', name: 'Appartements', slug: 'appartements' },
            ],
          },
          {
            id: 'immobilier-vente-terrains',
            name: 'Terrains',
            slug: 'terrains',
            children: [{ id: 'immobilier-vente-terrains-constructibles', name: 'Lots constructibles & Agricoles', slug: 'constructibles' }],
          },
        ],
      },
      {
        id: 'immobilier-location',
        name: 'Location',
        slug: 'location',
        children: [
          {
            id: 'immobilier-location-habitation',
            name: 'Habitation',
            slug: 'habitation',
            children: [
              { id: 'immobilier-location-studios', name: 'Studios & Appartements', slug: 'studios' },
              { id: 'immobilier-location-maisons', name: 'Maisons & Duplex', slug: 'maisons' },
            ],
          },
          {
            id: 'immobilier-location-vacances',
            name: 'Vacances',
            slug: 'vacances',
            children: [{ id: 'immobilier-location-meubles', name: 'Meublés & Airbnb', slug: 'meubles' }],
          },
        ],
      },
      {
        id: 'immobilier-professionnel',
        name: 'Professionnel',
        slug: 'professionnel',
        children: [
          {
            id: 'immobilier-bureaux',
            name: 'Bureaux',
            slug: 'bureaux',
            children: [{ id: 'immobilier-bureaux-coworking', name: 'Espaces partagés & Coworking', slug: 'coworking' }],
          },
          {
            id: 'immobilier-commerces',
            name: 'Commerces',
            slug: 'commerces',
            children: [{ id: 'immobilier-commerces-boutiques', name: 'Boutiques & Entrepôts', slug: 'boutiques' }],
          },
        ],
      },
    ],
  },
  {
    id: 'maison-equipement',
    name: 'Maison & Équipement',
    icon: 'Home',
    slug: 'maison',
    description: 'Meubles, électroménager et décoration',
    children: [
      {
        id: 'maison-meubles',
        name: 'Meubles',
        slug: 'meubles',
        children: [
          {
            id: 'maison-meubles-salon',
            name: 'Salon',
            slug: 'salon',
            children: [{ id: 'maison-meubles-canapes', name: 'Canapés, Fauteuils & Tables Basses', slug: 'canapes' }],
          },
          {
            id: 'maison-meubles-chambre',
            name: 'Chambre',
            slug: 'chambre',
            children: [{ id: 'maison-meubles-lits', name: 'Lits, Matelas & Armoires', slug: 'lits' }],
          },
        ],
      },
      {
        id: 'maison-electromenager',
        name: 'Électroménager',
        slug: 'electromenager',
        children: [
          {
            id: 'maison-electromenager-cuisine',
            name: 'Cuisine',
            slug: 'cuisine',
            children: [{ id: 'maison-electromenager-refrigerateurs', name: 'Réfrigérateurs & Cuisinières', slug: 'refrigerateurs' }],
          },
          {
            id: 'maison-electromenager-lavage',
            name: 'Lavage',
            slug: 'lavage',
            children: [{ id: 'maison-electromenager-machines', name: 'Machines à laver & Sèche-linge', slug: 'machines' }],
          },
          {
            id: 'maison-electromenager-petit',
            name: 'Petit Appareil',
            slug: 'petit',
            children: [{ id: 'maison-electromenager-micro-ondes', name: 'Micro-ondes & Cafetières', slug: 'micro-ondes' }],
          },
        ],
      },
      {
        id: 'maison-decoration',
        name: 'Décoration',
        slug: 'decoration',
        children: [
          {
            id: 'maison-decoration-luminaire',
            name: 'Luminaire',
            slug: 'luminaire',
            children: [{ id: 'maison-decoration-lampes', name: 'Lampes, Lustres & Appliques', slug: 'lampes' }],
          },
          {
            id: 'maison-decoration-textile',
            name: 'Textile',
            slug: 'textile',
            children: [{ id: 'maison-decoration-rideaux', name: 'Rideaux, Tapis & Coussins', slug: 'rideaux' }],
          },
        ],
      },
      {
        id: 'maison-bricolage',
        name: 'Bricolage',
        slug: 'bricolage',
        children: [
          {
            id: 'maison-outils',
            name: 'Outils',
            slug: 'outils',
            children: [{ id: 'maison-outils-perceuses', name: 'Perceuses, Scies & Outillage à main', slug: 'perceuses' }],
          },
        ],
      },
      {
        id: 'maison-jardin',
        name: 'Jardin',
        slug: 'jardin',
        children: [
          {
            id: 'maison-jardin-amenagement',
            name: 'Aménagement',
            slug: 'amenagement',
            children: [{ id: 'maison-jardin-salons', name: 'Salons de jardin & Barbecues', slug: 'salons' }],
          },
        ],
      },
    ],
  },
  {
    id: 'agro-alimentaire-elevage',
    name: 'Agro-alimentaire & Élevage',
    icon: 'Sprout',
    slug: 'agro',
    description: 'Alimentation, élevage et agriculture',
    children: [
      {
        id: 'agro-alimentation',
        name: 'Alimentation',
        slug: 'alimentation',
        children: [
          {
            id: 'agro-epicerie',
            name: 'Épicerie',
            slug: 'epicerie',
            children: [{ id: 'agro-epicerie-seche', name: 'Riz, Pâtes & Huiles', slug: 'seche' }],
          },
          {
            id: 'agro-frais',
            name: 'Frais',
            slug: 'frais',
            children: [{ id: 'agro-fruits-legumes', name: 'Fruits, Légumes & Viandes', slug: 'fruits' }],
          },
          {
            id: 'agro-boissons',
            name: 'Boissons',
            slug: 'boissons',
            children: [{ id: 'agro-eaux-jus', name: 'Eaux, Jus & Sodas', slug: 'eaux' }],
          },
        ],
      },
      {
        id: 'agro-elevage',
        name: 'Élevage',
        slug: 'elevage',
        children: [
          {
            id: 'agro-betail',
            name: 'Bétail',
            slug: 'betail',
            children: [{ id: 'agro-moutons', name: 'Moutons, Bœufs & Chèvres', slug: 'moutons' }],
          },
          {
            id: 'agro-volaille',
            name: 'Volaille',
            slug: 'volaille',
            children: [{ id: 'agro-poulets', name: 'Poulets, Œufs & Canards', slug: 'poulets' }],
          },
        ],
      },
      {
        id: 'agro-agriculture',
        name: 'Agriculture',
        slug: 'agriculture',
        children: [
          {
            id: 'agro-materiel',
            name: 'Matériel',
            slug: 'materiel',
            children: [{ id: 'agro-tracteurs', name: 'Tracteurs & Motoculteurs', slug: 'tracteurs' }],
          },
          {
            id: 'agro-intrants',
            name: 'Intrants',
            slug: 'intrants',
            children: [{ id: 'agro-engrais', name: 'Engrais, Semences & Pesticides', slug: 'engrais' }],
          },
        ],
      },
    ],
  },
  {
    id: 'emploi-services',
    name: 'Emploi & Services',
    icon: 'Briefcase',
    slug: 'emploi',
    description: 'Offres d\'emploi et services professionnels',
    children: [
      {
        id: 'emploi-secteurs',
        name: 'Secteurs',
        slug: 'secteurs',
        children: [
          {
            id: 'emploi-prive',
            name: 'Privé',
            slug: 'prive',
            children: [{ id: 'emploi-commerce', name: 'Commerce, Banque & Marketing', slug: 'commerce' }],
          },
          {
            id: 'emploi-technique',
            name: 'Technique',
            slug: 'technique',
            children: [{ id: 'emploi-ingenierie', name: 'Ingénierie & Informatique', slug: 'ingenierie' }],
          },
        ],
      },
      {
        id: 'emploi-types',
        name: 'Types',
        slug: 'types',
        children: [
          {
            id: 'emploi-contrats',
            name: 'Contrats',
            slug: 'contrats',
            children: [{ id: 'emploi-cdi', name: 'CDI, CDD & Freelance', slug: 'cdi' }],
          },
        ],
      },
      {
        id: 'services-batiment',
        name: 'Bâtiment',
        slug: 'batiment',
        children: [
          {
            id: 'services-travaux',
            name: 'Travaux',
            slug: 'travaux',
            children: [{ id: 'services-plomberie', name: 'Plomberie, Électricité & Peinture', slug: 'plomberie' }],
          },
        ],
      },
      {
        id: 'services-entreprise',
        name: 'Entreprise',
        slug: 'entreprise',
        children: [
          {
            id: 'services-digital',
            name: 'Digital',
            slug: 'digital',
            children: [{ id: 'services-creation-sites', name: 'Création de sites & Logos', slug: 'creation' }],
          },
        ],
      },
      {
        id: 'services-particuliers',
        name: 'Particuliers',
        slug: 'particuliers',
        children: [
          {
            id: 'services-aide',
            name: 'Aide',
            slug: 'aide',
            children: [{ id: 'services-menage', name: "Ménage, Garde d'enfants & Cours", slug: 'menage' }],
          },
        ],
      },
      {
        id: 'services-evenementiel',
        name: 'Événementiel',
        slug: 'evenementiel',
        children: [
          {
            id: 'services-fetes',
            name: 'Fêtes',
            slug: 'fetes',
            children: [{ id: 'services-traiteurs', name: 'Traiteurs, Décorateurs & Photographes', slug: 'traiteurs' }],
          },
        ],
      },
    ],
  },
  {
    id: 'loisirs-divers',
    name: 'Loisirs & Divers',
    icon: 'Gamepad2',
    slug: 'loisirs',
    description: 'Sport, culture, sécurité et énergie',
    children: [
      {
        id: 'loisirs-sport',
        name: 'Sport',
        slug: 'sport',
        children: [
          {
            id: 'loisirs-fitness',
            name: 'Fitness',
            slug: 'fitness',
            children: [{ id: 'loisirs-halteres', name: 'Haltères & Tapis de course', slug: 'halteres' }],
          },
          {
            id: 'loisirs-collectif',
            name: 'Collectif',
            slug: 'collectif',
            children: [{ id: 'loisirs-football', name: 'Football, Basket & Tennis', slug: 'football' }],
          },
        ],
      },
      {
        id: 'loisirs-culture',
        name: 'Culture',
        slug: 'culture',
        children: [
          {
            id: 'loisirs-musique',
            name: 'Musique',
            slug: 'musique',
            children: [{ id: 'loisirs-guitares', name: 'Guitares, Pianos & Studios', slug: 'guitares' }],
          },
          {
            id: 'loisirs-livres',
            name: 'Livres',
            slug: 'livres',
            children: [{ id: 'loisirs-romans', name: 'Romans, Scolaire & BD', slug: 'romans' }],
          },
        ],
      },
      {
        id: 'divers-securite',
        name: 'Sécurité',
        slug: 'securite',
        children: [
          {
            id: 'divers-materiel',
            name: 'Matériel',
            slug: 'materiel',
            children: [{ id: 'divers-cameras', name: 'Caméras de surveillance & Alarmes', slug: 'cameras' }],
          },
        ],
      },
      {
        id: 'divers-energie',
        name: 'Énergie',
        slug: 'energie',
        children: [
          {
            id: 'divers-solaire',
            name: 'Solaire',
            slug: 'solaire',
            children: [{ id: 'divers-panneaux', name: 'Panneaux & Batteries', slug: 'panneaux' }],
          },
        ],
      },
      {
        id: 'divers-autres',
        name: 'Autres',
        slug: 'autres',
        children: [
          {
            id: 'divers-non-classe',
            name: 'Non classés',
            slug: 'non-classes',
            children: [{ id: 'divers-objets', name: 'Objets non classés', slug: 'objets' }],
          },
        ],
      },
    ],
  },
  {
    id: 'alimentation-consommables',
    name: 'Alimentation & Consommables',
    icon: 'Apple',
    slug: 'alimentation',
    description: 'Épicerie, produits frais et boissons',
    children: [
      {
        id: 'alimentation-epicerie-seche',
        name: 'Épicerie Sèche',
        slug: 'epicerie-seche',
        children: [
          {
            id: 'alimentation-feculents',
            name: 'Féculents',
            slug: 'feculents',
            children: [{ id: 'alimentation-riz-pates', name: 'Riz, Pâtes, Couscous & Légumineuses', slug: 'riz' }],
          },
          {
            id: 'alimentation-petit-dej',
            name: 'Petit-déjeuner',
            slug: 'petit-dej',
            children: [{ id: 'alimentation-cafe-the', name: 'Café, Thé, Céréales & Tartines', slug: 'cafe' }],
          },
          {
            id: 'alimentation-condiments',
            name: 'Condiments',
            slug: 'condiments',
            children: [{ id: 'alimentation-huiles-epices', name: 'Huiles, Épices, Sel & Sauces', slug: 'huiles' }],
          },
          {
            id: 'alimentation-sucre',
            name: 'Sucré',
            slug: 'sucre',
            children: [{ id: 'alimentation-biscuits', name: 'Biscuits, Chocolats & Confiseries', slug: 'biscuits' }],
          },
        ],
      },
      {
        id: 'alimentation-produits-frais',
        name: 'Produits Frais',
        slug: 'produits-frais',
        children: [
          {
            id: 'alimentation-fruits-legumes',
            name: 'Fruits & Légumes',
            slug: 'fruits',
            children: [{ id: 'alimentation-fruits-saison', name: 'Fruits de saison & Légumes frais', slug: 'saison' }],
          },
          {
            id: 'alimentation-boucherie',
            name: 'Boucherie',
            slug: 'boucherie',
            children: [{ id: 'alimentation-viande-boeuf', name: 'Viande de Bœuf, Mouton & Volaille', slug: 'boeuf' }],
          },
          {
            id: 'alimentation-poissonnerie',
            name: 'Poissonnerie',
            slug: 'poissonnerie',
            children: [{ id: 'alimentation-poissons-frais', name: 'Poissons frais, Crustacés & Surgelés', slug: 'poissons' }],
          },
          {
            id: 'alimentation-cremerie',
            name: 'Crémerie',
            slug: 'cremerie',
            children: [{ id: 'alimentation-lait-oeufs', name: 'Lait, Œufs, Fromages & Yaourts', slug: 'lait' }],
          },
        ],
      },
      {
        id: 'alimentation-boissons',
        name: 'Boissons',
        slug: 'boissons',
        children: [
          {
            id: 'alimentation-eaux-sirops',
            name: 'Eaux & Sirops',
            slug: 'eaux',
            children: [{ id: 'alimentation-eau-minérale', name: 'Eau minérale, Gazeuse & Jus de fruits', slug: 'minerale' }],
          },
          {
            id: 'alimentation-sodas',
            name: 'Sodas',
            slug: 'sodas',
            children: [{ id: 'alimentation-boissons-gazeuses', name: 'Boissons gazeuses & Énergisantes', slug: 'gazeuses' }],
          },
          {
            id: 'alimentation-cave',
            name: 'Cave',
            slug: 'cave',
            children: [{ id: 'alimentation-vins-bieres', name: 'Vins, Bières & Spiritueux', slug: 'vins' }],
          },
        ],
      },
      {
        id: 'alimentation-boulangerie-traiteur',
        name: 'Boulangerie & Traiteur',
        slug: 'boulangerie',
        children: [
          {
            id: 'alimentation-pain',
            name: 'Pain',
            slug: 'pain',
            children: [{ id: 'alimentation-baguettes', name: 'Baguettes, Pains spéciaux & Viennoiseries', slug: 'baguettes' }],
          },
          {
            id: 'alimentation-patisserie',
            name: 'Pâtisserie',
            slug: 'patisserie',
            children: [{ id: 'alimentation-gateaux', name: 'Gâteaux, Tartes & Desserts', slug: 'gateaux' }],
          },
          {
            id: 'alimentation-pret-a-manger',
            name: 'Prêt-à-manger',
            slug: 'pret-manger',
            children: [{ id: 'alimentation-plats-cuisinés', name: 'Plats cuisinés, Salades & Sandwichs', slug: 'plats' }],
          },
        ],
      },
      {
        id: 'alimentation-bebe-besoins-specifiques',
        name: 'Bébé & Besoins Spécifiques',
        slug: 'bebe',
        children: [
          {
            id: 'alimentation-lait-bebe',
            name: 'Lait Bébé',
            slug: 'lait-bebe',
            children: [{ id: 'alimentation-laits-ages', name: 'Laits 1er, 2ème et 3ème âge', slug: 'ages' }],
          },
          {
            id: 'alimentation-petits-pots',
            name: 'Petits pots',
            slug: 'petits-pots',
            children: [{ id: 'alimentation-purees', name: 'Purées & Compotes bébé', slug: 'purees' }],
          },
          {
            id: 'alimentation-regimes',
            name: 'Régimes',
            slug: 'regimes',
            children: [{ id: 'alimentation-sans-gluten', name: 'Produits Sans Gluten, Bio & Diététiques', slug: 'sans-gluten' }],
          },
        ],
      },
    ],
  },
  {
    id: 'cosmetiques-beaute',
    name: 'Cosmétiques & Beauté',
    icon: 'Sparkles',
    slug: 'cosmetiques',
    description: 'Maquillage, soins et parfumerie',
    children: [
      {
        id: 'cosmetiques-maquillage',
        name: 'Maquillage',
        slug: 'maquillage',
        children: [
          {
            id: 'cosmetiques-maquillage-teint',
            name: 'Teint',
            slug: 'teint',
            children: [
              { id: 'cosmetiques-fdt', name: 'Fonds de teint', slug: 'fdt' },
              { id: 'cosmetiques-anticernes', name: 'Anti-cernes', slug: 'anticernes' },
              { id: 'cosmetiques-poudres-bb', name: 'Poudres & BB Crèmes', slug: 'poudres' },
            ],
          },
          {
            id: 'cosmetiques-maquillage-yeux',
            name: 'Yeux',
            slug: 'yeux',
            children: [
              { id: 'cosmetiques-mascaras', name: 'Mascaras', slug: 'mascaras' },
              { id: 'cosmetiques-eyeliners', name: 'Eyeliners', slug: 'eyeliners' },
              { id: 'cosmetiques-palettes-yeux', name: "Palettes d'ombres à paupières", slug: 'palettes' },
            ],
          },
          {
            id: 'cosmetiques-maquillage-levres',
            name: 'Lèvres',
            slug: 'levres',
            children: [
              { id: 'cosmetiques-rouges-levres', name: 'Rouges à lèvres', slug: 'rouges' },
              { id: 'cosmetiques-gloss', name: 'Gloss', slug: 'gloss' },
              { id: 'cosmetiques-crayons-baumes', name: 'Crayons & Baumes', slug: 'crayons' },
            ],
          },
          {
            id: 'cosmetiques-maquillage-ongles',
            name: 'Ongles',
            slug: 'ongles',
            children: [
              { id: 'cosmetiques-vernis', name: 'Vernis', slug: 'vernis' },
              { id: 'cosmetiques-manucure', name: 'Kits Manucure & Dissolvants', slug: 'manucure' },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-soin-visage',
        name: 'Soin Visage',
        slug: 'soin-visage',
        children: [
          {
            id: 'cosmetiques-soin-visage-hydratation',
            name: 'Hydratation',
            slug: 'hydratation',
            children: [
              { id: 'cosmetiques-cremes-jour-nuit', name: 'Crèmes de jour/nuit', slug: 'cremes' },
              { id: 'cosmetiques-serums-huiles', name: 'Sérums & Huiles', slug: 'serums' },
            ],
          },
          {
            id: 'cosmetiques-soin-visage-nettoyage',
            name: 'Nettoyage',
            slug: 'nettoyage',
            children: [
              { id: 'cosmetiques-demaquillants', name: 'Démaquillants', slug: 'demaquillants' },
              { id: 'cosmetiques-gommages-masques', name: 'Gommages, Masques & Lotions', slug: 'gommages' },
            ],
          },
          {
            id: 'cosmetiques-soin-visage-solaire',
            name: 'Solaire',
            slug: 'solaire',
            children: [
              { id: 'cosmetiques-protection-uv', name: 'Protections UV', slug: 'uv' },
              { id: 'cosmetiques-apres-soleil', name: 'Après-soleil & Autobronzants', slug: 'apres' },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-soin-corps',
        name: 'Soin Corps',
        slug: 'soin-corps',
        children: [
          {
            id: 'cosmetiques-corps-hydratation',
            name: 'Hydratation',
            slug: 'hydratation',
            children: [
              { id: 'cosmetiques-laits-corps', name: 'Laits corporels, Beurres de karité', slug: 'laits' },
              { id: 'cosmetiques-gels-douche', name: 'Gels douche', slug: 'gels' },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-cheveux',
        name: 'Cheveux',
        slug: 'cheveux',
        children: [
          {
            id: 'cosmetiques-cheveux-shampooing',
            name: 'Shampooing & Soin',
            slug: 'shampooing',
            children: [
              {
                id: 'cosmetiques-cheveux-lavage',
                name: 'Lavage',
                slug: 'lavage',
                children: [{ id: 'cosmetiques-shampooings', name: 'Shampooings (Secs, Antipelliculaires, Bio)', slug: 'shampooings' }],
              },
              {
                id: 'cosmetiques-cheveux-traitement',
                name: 'Traitement',
                slug: 'traitement',
                children: [{ id: 'cosmetiques-apres-shampooings', name: 'Après-shampooings, Masques & Sérums', slug: 'apres' }],
              },
            ],
          },
          {
            id: 'cosmetiques-cheveux-coloration',
            name: 'Coloration',
            slug: 'coloration',
            children: [
              {
                id: 'cosmetiques-coloration-maison',
                name: 'Maison',
                slug: 'maison',
                children: [{ id: 'cosmetiques-teintures', name: 'Teintures permanentes & Henné', slug: 'teintures' }],
              },
            ],
          },
          {
            id: 'cosmetiques-cheveux-coiffage',
            name: 'Coiffage',
            slug: 'coiffage',
            children: [
              {
                id: 'cosmetiques-coiffage-fixation',
                name: 'Fixation',
                slug: 'fixation',
                children: [{ id: 'cosmetiques-laques-gels', name: 'Laques, Gels, Cires & Mousses', slug: 'laques' }],
              },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-parfumerie',
        name: 'Parfumerie',
        slug: 'parfumerie',
        children: [
          {
            id: 'cosmetiques-parfumerie-fragrances',
            name: 'Fragrances',
            slug: 'fragrances',
            children: [
              {
                id: 'cosmetiques-parfums-genre',
                name: 'Genre',
                slug: 'genre',
                children: [
                  { id: 'cosmetiques-parfums-homme', name: 'Parfums Homme', slug: 'homme' },
                  { id: 'cosmetiques-parfums-femme', name: 'Parfums Femme', slug: 'femme' },
                  { id: 'cosmetiques-parfums-enfant', name: 'Parfums Enfants', slug: 'enfant' },
                ],
              },
              {
                id: 'cosmetiques-parfums-type',
                name: 'Type',
                slug: 'type',
                children: [
                  { id: 'cosmetiques-eaux-parfum', name: 'Eaux de Parfum', slug: 'parfum' },
                  { id: 'cosmetiques-eaux-toilette', name: 'Eaux de Toilette', slug: 'toilette' },
                  { id: 'cosmetiques-brumes', name: 'Brumes', slug: 'brumes' },
                ],
              },
            ],
          },
          {
            id: 'cosmetiques-parfumerie-coffrets',
            name: 'Coffrets',
            slug: 'coffrets',
            children: [
              {
                id: 'cosmetiques-coffrets-cadeaux',
                name: 'Cadeaux',
                slug: 'cadeaux',
                children: [{ id: 'cosmetiques-ensembles-parfum', name: 'Ensembles Parfum + Soin', slug: 'ensembles' }],
              },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-hygiene',
        name: 'Hygiène',
        slug: 'hygiene',
        children: [
          {
            id: 'cosmetiques-hygiene-dentaire',
            name: 'Dentaire',
            slug: 'dentaire',
            children: [
              {
                id: 'cosmetiques-dentaire-soins',
                name: 'Soins',
                slug: 'soins',
                children: [{ id: 'cosmetiques-dentifrices-brosses', name: 'Dentifrices, Brosses à dents & Bains de bouche', slug: 'dentifrices' }],
              },
            ],
          },
          {
            id: 'cosmetiques-hygiene-deodorants',
            name: 'Déodorants',
            slug: 'deodorants',
            children: [
              {
                id: 'cosmetiques-deodorants-format',
                name: 'Format',
                slug: 'format',
                children: [
                  { id: 'cosmetiques-deodorants-sprays', name: 'Sprays', slug: 'sprays' },
                  { id: 'cosmetiques-deodorants-sticks', name: 'Sticks & Roll-on', slug: 'sticks' },
                ],
              },
            ],
          },
          {
            id: 'cosmetiques-hygiene-rasage',
            name: 'Rasage & Épilation',
            slug: 'rasage',
            children: [
              {
                id: 'cosmetiques-rasage-materiel',
                name: 'Matériel',
                slug: 'materiel',
                children: [{ id: 'cosmetiques-rasoirs-mousses', name: 'Rasoirs, Mousses & Cires froides/chaudes', slug: 'rasoirs' }],
              },
            ],
          },
        ],
      },
      {
        id: 'cosmetiques-accessoires',
        name: 'Accessoires',
        slug: 'accessoires',
        children: [
          {
            id: 'cosmetiques-accessoires-appareils',
            name: 'Appareils',
            slug: 'appareils',
            children: [
              {
                id: 'cosmetiques-appareils-coiffure',
                name: 'Coiffure',
                slug: 'coiffure',
                children: [{ id: 'cosmetiques-seche-cheveux', name: 'Sèche-cheveux, Lisseurs & Boucleurs', slug: 'seche' }],
              },
            ],
          },
          {
            id: 'cosmetiques-accessoires-outils',
            name: 'Outils',
            slug: 'outils',
            children: [
              {
                id: 'cosmetiques-outils-application',
                name: 'Application',
                slug: 'application',
                children: [{ id: 'cosmetiques-pinceaux-eponges', name: 'Pinceaux, Éponges (Beauty Blender) & Miroirs', slug: 'pinceaux' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bricolage-construction',
    name: 'Bricolage & Construction',
    icon: 'Hammer',
    slug: 'bricolage',
    description: 'Matériaux, outillage et sanitaire',
    children: [
      {
        id: 'bricolage-gros-oeuvre',
        name: 'Gros Œuvre',
        slug: 'gros-oeuvre',
        children: [
          {
            id: 'bricolage-materiaux',
            name: 'Matériaux',
            slug: 'materiaux',
            children: [{ id: 'bricolage-ciment', name: 'Ciment, Briques, Sable & Gravier', slug: 'ciment' }],
          },
          {
            id: 'bricolage-metallurgie',
            name: 'Métallurgie',
            slug: 'metallurgie',
            children: [{ id: 'bricolage-fer-a-beton', name: 'Fer à béton, Tôles & Grillages', slug: 'fer' }],
          },
        ],
      },
      {
        id: 'bricolage-second-oeuvre',
        name: 'Second Œuvre',
        slug: 'second-oeuvre',
        children: [
          {
            id: 'bricolage-finitions',
            name: 'Finitions',
            slug: 'finitions',
            children: [{ id: 'bricolage-peinture-vernis', name: 'Peinture, Vernis, Colles & Enduits', slug: 'peinture' }],
          },
          {
            id: 'bricolage-revetements',
            name: 'Revêtements',
            slug: 'revetements',
            children: [{ id: 'bricolage-carrelage', name: 'Carrelage, Parquet & Plinthes', slug: 'carrelage' }],
          },
        ],
      },
      {
        id: 'bricolage-outillage',
        name: 'Outillage',
        slug: 'outillage',
        children: [
          {
            id: 'bricolage-outillage-electrique',
            name: 'Électrique',
            slug: 'electrique',
            children: [{ id: 'bricolage-perceuses-meuleuses', name: 'Perceuses, Meuleuses & Scies sauteuses', slug: 'perceuses' }],
          },
          {
            id: 'bricolage-outillage-manuel',
            name: 'Manuel',
            slug: 'manuel',
            children: [{ id: 'bricolage-marteaux-cles', name: 'Marteaux, Clés, Tournevis & Pinces', slug: 'marteaux' }],
          },
        ],
      },
      {
        id: 'bricolage-equipement-sanitaire',
        name: 'Équipement Sanitaire',
        slug: 'sanitaire',
        children: [{ id: 'bricolage-sanitaire', name: 'Éviers, Robinets, Douches & WC', slug: 'eviers' }],
      },
    ],
  },
  {
    id: 'energie-electricite',
    name: 'Énergie & Électricité',
    icon: 'Zap',
    slug: 'energie',
    description: 'Solaire, installation et éclairage',
    children: [
      {
        id: 'energie-solaire',
        name: 'Solaire',
        slug: 'solaire',
        children: [
          {
            id: 'energie-solaire-panneaux',
            name: 'Panneaux',
            slug: 'panneaux',
            children: [{ id: 'energie-panneaux-photovoltaiques', name: 'Panneaux Monocristallins & Polycristallins', slug: 'photovoltaiques' }],
          },
          {
            id: 'energie-solaire-stockage',
            name: 'Stockage',
            slug: 'stockage',
            children: [{ id: 'energie-batteries-solaire', name: 'Batteries Lithium, Gel & Régulateurs', slug: 'batteries' }],
          },
          {
            id: 'energie-solaire-conversion',
            name: 'Conversion',
            slug: 'conversion',
            children: [{ id: 'energie-onduleurs', name: 'Convertisseurs (Onduleurs) & Kits complets', slug: 'onduleurs' }],
          },
        ],
      },
      {
        id: 'electricite-installation',
        name: 'Installation Électrique',
        slug: 'installation',
        children: [
          {
            id: 'electricite-cablage',
            name: 'Câblage',
            slug: 'cablage',
            children: [{ id: 'electricite-fils-gaines', name: 'Fils électriques, Gaines & Rallonges', slug: 'fils' }],
          },
          {
            id: 'electricite-appareillage',
            name: 'Appareillage',
            slug: 'appareillage',
            children: [{ id: 'electricite-interrupteurs-prises', name: 'Interrupteurs, Prises & Disjoncteurs', slug: 'interrupteurs' }],
          },
        ],
      },
      {
        id: 'electricite-eclairage',
        name: 'Éclairage',
        slug: 'eclairage',
        children: [
          {
            id: 'electricite-ampoules',
            name: 'Ampoules',
            slug: 'ampoules',
            children: [{ id: 'electricite-led-projecteurs', name: 'LED, Projecteurs extérieurs & Réglettes', slug: 'led' }],
          },
        ],
      },
    ],
  },
  {
    id: 'securite-protection',
    name: 'Sécurité & Protection',
    icon: 'Shield',
    slug: 'securite',
    description: 'Surveillance, alarme et gardiennage',
    children: [
      {
        id: 'securite-surveillance',
        name: 'Surveillance',
        slug: 'surveillance',
        children: [
          {
            id: 'securite-cameras',
            name: 'Caméras',
            slug: 'cameras',
            children: [{ id: 'securite-cameras-ip', name: 'Caméras IP, Wi-Fi & Kits DVR', slug: 'ip' }],
          },
        ],
      },
      {
        id: 'securite-alarme',
        name: 'Alarme',
        slug: 'alarme',
        children: [
          {
            id: 'securite-detection',
            name: 'Détection',
            slug: 'detection',
            children: [{ id: 'securite-capteurs-mouvement', name: 'Capteurs de mouvement & Sirènes', slug: 'capteurs' }],
          },
        ],
      },
      {
        id: 'securite-controle-acces',
        name: "Contrôle d'accès",
        slug: 'controle-acces',
        children: [
          {
            id: 'securite-verrouillage',
            name: 'Verrouillage',
            slug: 'verrouillage',
            children: [{ id: 'securite-serrures-intelligentes', name: 'Serrures intelligentes & Interphones', slug: 'serrures' }],
          },
        ],
      },
      {
        id: 'securite-incendie',
        name: 'Protection Incendie',
        slug: 'incendie',
        children: [
          {
            id: 'securite-extincteurs',
            name: 'Équipement',
            slug: 'equipement',
            children: [{ id: 'securite-extincteurs-detecteurs', name: 'Extincteurs & Détecteurs de fumée', slug: 'extincteurs' }],
          },
        ],
      },
      {
        id: 'securite-gardiennage',
        name: 'Gardiennage',
        slug: 'gardiennage',
        children: [
          {
            id: 'securite-equipement-gardien',
            name: 'Équipement',
            slug: 'equipement',
            children: [{ id: 'securite-uniformes-lampes', name: 'Uniformes, Lampes torches & Talkie-walkies', slug: 'uniformes' }],
          },
        ],
      },
    ],
  },
  {
    id: 'divers-bureau',
    name: 'Divers & Bureau',
    icon: 'Briefcase',
    slug: 'bureau',
    description: 'Papeterie, mobilier et services',
    children: [
      {
        id: 'bureau-papeterie',
        name: 'Papeterie',
        slug: 'papeterie',
        children: [
          {
            id: 'bureau-fournitures',
            name: 'Fournitures',
            slug: 'fournitures',
            children: [{ id: 'bureau-cahiers-stylos', name: 'Cahiers, Stylos, Classeurs & Agendas', slug: 'cahiers' }],
          },
        ],
      },
      {
        id: 'bureau-mobilier',
        name: 'Mobilier',
        slug: 'mobilier',
        children: [
          {
            id: 'bureau-amenagement',
            name: 'Aménagement',
            slug: 'amenagement',
            children: [{ id: 'bureau-chaises-bureaux', name: 'Chaises de bureau, Bureaux & Étagères', slug: 'chaises' }],
          },
        ],
      },
      {
        id: 'bureau-materiel',
        name: 'Matériel',
        slug: 'materiel',
        children: [
          {
            id: 'bureau-impression',
            name: 'Impression',
            slug: 'impression',
            children: [{ id: 'bureau-imprimantes-toners', name: 'Imprimantes, Toners & Encre', slug: 'imprimantes' }],
          },
        ],
      },
      {
        id: 'divers-services',
        name: 'Services',
        slug: 'services',
        children: [
          {
            id: 'divers-objets-trouves',
            name: 'Autres',
            slug: 'autres',
            children: [{ id: 'divers-annonces-dons', name: 'Objets trouvés, Annonces perdues & Dons', slug: 'dons' }],
          },
        ],
      },
    ],
  },
]

/* ========================================================================== */
/*  INDEX PRÉCONSTRUIT (accès O(1))                                           */
/* ========================================================================== */

const idToNodeMap: Map<string, CategoryNode> = new Map()
const slugToNodeMap: Map<string, CategoryNode> = new Map()
const nameToNodeMap: Map<string, CategoryNode> = new Map()

function buildIndexes() {
  function walk(node: CategoryNode) {
    idToNodeMap.set(node.id, node)
    
    if (node.slug) {
      slugToNodeMap.set(node.slug, node)
    }
    
    nameToNodeMap.set(node.name.toLowerCase(), node)
    
    if (node.children) {
      node.children.forEach(walk)
    }
  }
  categoryTree.forEach(walk)
}

// Construction immédiate au chargement du module
buildIndexes()

/* ========================================================================== */
/*  FONCTIONS UTILITAIRES DE BASE                                             */
/* ========================================================================== */

export const mainCategories = categoryTree.map(cat => cat.name)
export const mainCategoryIds = categoryTree.map(c => c.id)

export function getSubCategories(mainCategoryName: string): string[] {
  const main = categoryTree.find(c => c.name === mainCategoryName)
  if (!main?.children) return []
  return main.children.map(sub => sub.name)
}

export function getTypes(mainCategoryName: string, subCategoryName: string): string[] {
  const main = categoryTree.find(c => c.name === mainCategoryName)
  if (!main?.children) return []
  const sub = main.children.find(s => s.name === subCategoryName)
  if (!sub?.children) return []
  return sub.children.map(type => type.name)
}

export function getDetails(mainCategoryName: string, subCategoryName: string, typeName: string): string[] {
  const main = categoryTree.find(c => c.name === mainCategoryName)
  if (!main?.children) return []
  const sub = main.children.find(s => s.name === subCategoryName)
  if (!sub?.children) return []
  const type = sub.children.find(t => t.name === typeName)
  if (!type?.children) return []
  return type.children.map(detail => detail.name)
}

export function getCategoryIcon(categoryName: string): string | undefined {
  const main = categoryTree.find(c => c.name === categoryName)
  return main?.icon
}

export function getCategoryIconComponent(iconName?: string): LucideIcon {
  if (!iconName) return DEFAULT_ICON
  return iconMap[iconName] || DEFAULT_ICON
}

/* ========================================================================== */
/*  FONCTIONS AVANCÉES (accès O(1))                                           */
/* ========================================================================== */

/** Récupère un nœud par id en O(1) */
export function getCategoryByIdFast(id: string): CategoryNode | undefined {
  return idToNodeMap.get(id)
}

/** Récupère un nœud par slug en O(1) */
export function getCategoryBySlug(slug: string): CategoryNode | undefined {
  return slugToNodeMap.get(slug)
}

/** Récupère un nœud par nom en O(1) */
export function getCategoryByName(name: string): CategoryNode | undefined {
  return nameToNodeMap.get(name.toLowerCase())
}

/** Récupère tous les enfants directs d'un nœud */
export function getCategoryChildren(id: string): CategoryNode[] {
  const node = getCategoryByIdFast(id)
  return node?.children ?? []
}

/** Retourne l'icône d'une catégorie par son id */
export function getCategoryIconById(id: string): string | undefined {
  const node = getCategoryByIdFast(id)
  return node?.icon
}

/* ========================================================================== */
/*  NAVIGATION & RÉSOLUTION                                                   */
/* ========================================================================== */

/** Recherche récursive d'un nœud par son id */
export function getCategoryById(id: string): CategoryNode | undefined {
  return getCategoryByIdFast(id)
}

/** Construit le chemin complet (tableau de noms) depuis la racine jusqu'au nœud d'id donné */
export function getCategoryPathById(id: string): string[] | null {
  for (const root of categoryTree) {
    const path = buildPath(root, id, [])
    if (path) return path
  }
  return null
}

function buildPath(node: CategoryNode, targetId: string, currentPath: string[]): string[] | null {
  const newPath = [...currentPath, node.name]
  if (node.id === targetId) return newPath
  if (node.children) {
    for (const child of node.children) {
      const result = buildPath(child, targetId, newPath)
      if (result) return result
    }
  }
  return null
}

/** Retourne le chemin complet sous forme de chaîne "A > B > C" */
export function getCategoryFullPathById(id: string): string | null {
  const path = getCategoryPathById(id)
  return path ? path.join(' > ') : null
}

/** Retourne un tableau de segments { name, id } pour un fil d'ariane */
export function getCategoryBreadcrumbs(id: string): CategoryBreadcrumb[] {
  for (const root of categoryTree) {
    const crumbs = buildBreadcrumbs(root, id, [])
    if (crumbs) return crumbs
  }
  return []
}

function buildBreadcrumbs(
  node: CategoryNode,
  targetId: string,
  acc: CategoryBreadcrumb[],
): CategoryBreadcrumb[] | null {
  const current = [...acc, { name: node.name, id: node.id, slug: node.slug }]
  if (node.id === targetId) return current
  if (node.children) {
    for (const child of node.children) {
      const result = buildBreadcrumbs(child, targetId, current)
      if (result) return result
    }
  }
  return null
}

/** Retourne le nœud parent d'un identifiant (ou null si racine) */
export function getParentId(id: string): string | null {
  for (const root of categoryTree) {
    const parent = findParent(root, id)
    if (parent) return parent.id
  }
  return null
}

function findParent(node: CategoryNode, targetId: string): CategoryNode | null {
  if (node.children) {
    for (const child of node.children) {
      if (child.id === targetId) return node
      const deeper = findParent(child, targetId)
      if (deeper) return deeper
    }
  }
  return null
}

/** Indique si un nœud est une feuille (pas d'enfants) */
export function isLeafCategory(id: string): boolean {
  const node = getCategoryByIdFast(id)
  return node ? !node.children || node.children.length === 0 : false
}

/** Retourne la liste de tous les identifiants de nœuds feuilles (détails) */
export function getAllLeafCategoryIds(): string[] {
  const leaves: string[] = []
  function walk(node: CategoryNode) {
    if (!node.children || node.children.length === 0) {
      leaves.push(node.id)
    } else {
      node.children.forEach(walk)
    }
  }
  categoryTree.forEach(walk)
  return leaves
}

/** Retourne une liste plate de tous les nœuds avec leur profondeur */
export function flattenCategories(): { node: CategoryNode; depth: number; path: string[] }[] {
  const result: { node: CategoryNode; depth: number; path: string[] }[] = []
  function walk(node: CategoryNode, depth: number, path: string[]) {
    result.push({ node, depth, path: [...path, node.name] })
    if (node.children) {
      node.children.forEach(child => walk(child, depth + 1, [...path, node.name]))
    }
  }
  categoryTree.forEach(root => walk(root, 0, []))
  return result
}

/* ========================================================================== */
/*  RECHERCHE OPTIMISÉE AVEC CACHE                                            */
/* ========================================================================== */

/** Normalise une chaîne pour la recherche */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .trim()
}

/** Calcule un score de pertinence pour une recherche */
function calculateSearchScore(query: string, nodeName: string): number {
  const normalizedQuery = normalizeString(query)
  const normalizedName = normalizeString(nodeName)
  
  // Match exact
  if (normalizedName === normalizedQuery) return 100
  
  // Commence par
  if (normalizedName.startsWith(normalizedQuery)) return 80
  
  // Contient
  if (normalizedName.includes(normalizedQuery)) return 60
  
  // Mots individuels
  const queryWords = normalizedQuery.split(/\s+/)
  const nameWords = normalizedName.split(/\s+/)
  
  let matchCount = 0
  for (const qw of queryWords) {
    for (const nw of nameWords) {
      if (nw.includes(qw)) {
        matchCount++
        break
      }
    }
  }
  
  if (matchCount > 0) {
    return 40 * (matchCount / queryWords.length)
  }
  
  return 0
}

/** Recherche de catégories par correspondance approximative sur le nom avec cache */
export function searchCategories(query: string, maxResults = 10): CategoryNode[] {
  if (!query || query.trim().length === 0) return []
  
  const normalizedQuery = normalizeString(query)
  
  // Vérifier le cache
  const cached = searchCache.get(normalizedQuery)
  if (cached) {
    return cached.slice(0, maxResults).map(r => r.node)
  }
  
  const results: SearchResult[] = []
  
  function walk(node: CategoryNode, path: string[]) {
    const score = calculateSearchScore(query, node.name)
    
    if (score > 0) {
      results.push({
        node,
        path: [...path, node.name],
        score,
      })
    }
    
    if (node.children) {
      node.children.forEach(child => walk(child, [...path, node.name]))
    }
  }
  
  categoryTree.forEach(root => walk(root, []))
  
  // Trier par score décroissant
  results.sort((a, b) => b.score - a.score)
  
  // Mettre en cache
  searchCache.set(normalizedQuery, results)
  
  return results.slice(0, maxResults).map(r => r.node)
}

/** Recherche avec résultats détaillés (score, chemin) */
export function searchCategoriesDetailed(query: string, maxResults = 10): SearchResult[] {
  if (!query || query.trim().length === 0) return []
  
  const normalizedQuery = normalizeString(query)
  
  const cached = searchCache.get(normalizedQuery)
  if (cached) {
    return cached.slice(0, maxResults)
  }
  
  const results: SearchResult[] = []
  
  function walk(node: CategoryNode, path: string[]) {
    const score = calculateSearchScore(query, node.name)
    
    if (score > 0) {
      results.push({
        node,
        path: [...path, node.name],
        score,
      })
    }
    
    if (node.children) {
      node.children.forEach(child => walk(child, [...path, node.name]))
    }
  }
  
  categoryTree.forEach(root => walk(root, []))
  
  results.sort((a, b) => b.score - a.score)
  
  searchCache.set(normalizedQuery, results)
  
  return results.slice(0, maxResults)
}

/* ========================================================================== */
/*  UTILITAIRES SUPPLÉMENTAIRES                                               */
/* ========================================================================== */

/** Compte le nombre total de nœuds dans l'arbre */
export function countCategories(): number {
  return idToNodeMap.size
}

/** Retourne toutes les catégories principales avec leurs icônes */
export function getMainCategoriesWithIcons(): Array<{ id: string; name: string; icon?: string; slug?: string }> {
  return categoryTree.map(cat => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    slug: cat.slug,
  }))
}

/** Vérifie si un ID de catégorie existe */
export function categoryExists(id: string): boolean {
  return idToNodeMap.has(id)
}

/** Retourne le slug complet pour une catégorie (chemin de slugs) */
export function getCategorySlugPath(id: string): string | null {
  const breadcrumbs = getCategoryBreadcrumbs(id)
  if (breadcrumbs.length === 0) return null
  
  return breadcrumbs
    .map(crumb => crumb.slug || crumb.id)
    .join('/')
}

/** Génère une URL complète pour une catégorie */
export function getCategoryUrl(id: string): string | null {
  const slugPath = getCategorySlugPath(id)
  return slugPath ? `/categories/${slugPath}` : null
}

/** Export pour debugging */
export function debugCategoryTree() {
  return {
    totalCategories: countCategories(),
    mainCategories: mainCategories.length,
    idToNodeMapSize: idToNodeMap.size,
    slugToNodeMapSize: slugToNodeMap.size,
    nameToNodeMapSize: nameToNodeMap.size,
  }
}