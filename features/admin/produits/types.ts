// features/admin/produits/types.ts

import type { ProductDeliveryConfig } from '@/lib/shipping-utils'

export type ProductAdminMode = 'create' | 'edit'

/* ═══════════════════════════════════════════════════════════════ */
/*  RICH CONTENT TYPES                                             */
/* ═══════════════════════════════════════════════════════════════ */

export type RichSectionType =
  | 'text_image'
  | 'features_grid'
  | 'full_width_image'
  | 'video_block'
  | 'stats_row'
  | 'quote'
  | 'html_safe'

export interface RichHero {
  title?: string
  subtitle?: string
  description?: string
  image?: string | null
  videoUrl?: string | null
  ctaLabel?: string | null
  ctaAction?: 'scroll_specs' | 'add_to_cart' | 'none'
}

export interface RichSpecRow {
  label: string
  value: string
}

export interface RichGallery {
  title?: string
  images: string[]
}

export interface RichVideo {
  title?: string
  url: string
  poster?: string | null
}

export interface RichHighlight {
  title: string
  description?: string
  icon?: string
}

export interface RichComparisonColumn {
  name: string
  attributes: Record<string, string>
}

export interface RichComparison {
  title?: string
  columns: RichComparisonColumn[]
}

export interface RichFinalCta {
  title?: string
  description?: string
  buttonLabel?: string
}

export interface RichSectionTextImage {
  id: string
  type: 'text_image'
  title: string
  text: string
  image?: string | null
  layout: 'image_left' | 'image_right' | 'image_top' | 'image_center'
}

export interface RichSectionFeaturesGrid {
  id: string
  type: 'features_grid'
  title?: string
  items: {
    title: string
    description?: string
    icon?: string
  }[]
}

export interface RichSectionFullWidthImage {
  id: string
  type: 'full_width_image'
  image: string
  caption?: string
}

export interface RichSectionVideoBlock {
  id: string
  type: 'video_block'
  url: string
  poster?: string | null
  title?: string
}

export interface RichSectionStatsRow {
  id: string
  type: 'stats_row'
  items: {
    value: string
    label: string
  }[]
}

export interface RichSectionQuote {
  id: string
  type: 'quote'
  text: string
  author?: string
}

export interface RichSectionHtmlSafe {
  id: string
  type: 'html_safe'
  html: string
}

export type RichSection =
  | RichSectionTextImage
  | RichSectionFeaturesGrid
  | RichSectionFullWidthImage
  | RichSectionVideoBlock
  | RichSectionStatsRow
  | RichSectionQuote
  | RichSectionHtmlSafe

export interface RichContent {
  enabled: boolean
  sourceUrl?: string | null
  templateId?: string
  generatedBy?: 'ai' | 'manual' | 'template'
  updatedAt?: string
  hero?: RichHero
  sections?: RichSection[]
  highlights?: RichHighlight[]
  specs?: RichSpecRow[]
  galleries?: RichGallery[]
  videos?: RichVideo[]
  comparison?: RichComparison | null
  finalCta?: RichFinalCta | null
}

/* ═══════════════════════════════════════════════════════════════ */
/*  VARIANTES AVANCÉES                                             */
/* ═══════════════════════════════════════════════════════════════ */

export type VariantAttributeType =
  | 'text'
  | 'size'
  | 'color'
  | 'image'
  | 'swatch'
  | 'model'

export interface VariantOption {
  value: string
  label?: string
  image?: string | null
  colorHex?: string | null
  sort?: number
  active?: boolean
}

export interface VariantAttributeConfig {
  key: string
  label: string
  type: VariantAttributeType
  required?: boolean
  options: VariantOption[]
  sortOrder?: number
}

export interface VarianteAdvanced {
  id: string
  attributes: Record<string, string>
  stock: number

  prix_specifique_usd?: number | null
  prix_specifique_cdf?: number | null
  prix_original_usd?: number | null
  prix_original_cdf?: number | null

  sku?: string | null
  barcode?: string | null

  image?: string | null
  images?: string[]

  colorHex?: string | null

  is_default?: boolean
  is_active?: boolean

  poids_kg?: number | null
  longueur_cm?: number | null
  largeur_cm?: number | null
  hauteur_cm?: number | null

  specs?: Record<string, string>

  notes?: string | null

  created_at?: string
  updated_at?: string
}

export type VariantDisplayMode = 'swatches' | 'buttons' | 'dropdown'

export type VariantGalleryStrategy =
  | 'variant_first'
  | 'general_first'
  | 'variant_only'

export type VariantDefaultSelection =
  | 'none'
  | 'first_available'
  | 'preferred'
  | 'default_variant'

export type VariantOutOfStockBehavior =
  | 'disable'
  | 'hide'
  | 'allow_backorder'

export interface VariantConfig {
  displayMode: VariantDisplayMode

  hideUnavailable: boolean
  disableUnavailable: boolean

  showMiniPhotos: boolean
  showColorSwatches: boolean
  showSizeLabels: boolean

  galleryStrategy: VariantGalleryStrategy
  defaultSelection: VariantDefaultSelection
  preferredAttributes: Record<string, string>

  allowBackorder: boolean
  lowStockThreshold: number
  requireCompleteSelection: boolean
  showStockCount: boolean
  outOfStockBehavior: VariantOutOfStockBehavior
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PRODUCT TYPES                                                  */
/* ═══════════════════════════════════════════════════════════════ */

export interface ProductDetail {
  id: string
  nom: string
  slug?: string
  categorie?: string
  description?: string

  prix?: number | null
  prix_usd?: number | null
  prix_cdf?: number | null
  prix_original?: number | null
  prix_original_usd?: number | null
  remise_percent?: number | null

  stock?: number | null
  est_actif?: boolean

  images?: string[] | null
  image?: string | null
  video_url?: string | null

  variantes?: VarianteAdvanced[] | null
  variant_attributes?: VariantAttributeConfig[] | null
  variant_config?: VariantConfig | null

  delivery_config?: ProductDeliveryConfig | null

  tags?: string | string[] | null
  badges?: string | string[] | null

  marque?: string | null
  sku?: string | null
  barcode?: string | null

  poids_kg?: number | null
  longueur_cm?: number | null
  largeur_cm?: number | null
  hauteur_cm?: number | null

  delay_livraison?: string | null
  livraison_domicile?: number | null
  livraison_point_retrait?: number | null
  livraison_express?: number | null
  express_gratuit?: boolean | null

  livraison_domicile_active?: boolean | null
  livraison_point_retrait_active?: boolean | null
  livraison_express_active?: boolean | null

  meta_title?: string | null
  meta_description?: string | null
  notes_internes?: string | null

  total_ventes?: number | null
  note_moyenne?: number | null

  created_at?: string
  updated_at?: string

  rich_content?: RichContent | null

  [key: string]: any
}

export interface ProductDraft {
  id?: string
  nom?: string
  slug?: string
  categorie?: string
  description?: string

  prix?: number | null
  prix_usd?: number | null
  prix_cdf?: number | null
  prix_original?: number | null
  prix_original_usd?: number | null
  remise_percent?: number | null

  stock?: number | null
  est_actif?: boolean

  images?: string[] | null
  image?: string | null
  video_url?: string | null

  variantes?: VarianteAdvanced[] | null
  variant_attributes?: VariantAttributeConfig[] | null
  variant_config?: VariantConfig | null

  delivery_config?: ProductDeliveryConfig | null

  tags?: string | string[] | null
  badges?: string | string[] | null

  marque?: string | null
  sku?: string | null
  barcode?: string | null

  poids_kg?: number | null
  longueur_cm?: number | null
  largeur_cm?: number | null
  hauteur_cm?: number | null

  delay_livraison?: string | null
  livraison_domicile?: number | null
  livraison_point_retrait?: number | null
  livraison_express?: number | null
  express_gratuit?: boolean | null

  livraison_domicile_active?: boolean | null
  livraison_point_retrait_active?: boolean | null
  livraison_express_active?: boolean | null

  meta_title?: string | null
  meta_description?: string | null
  notes_internes?: string | null

  total_ventes?: number | null
  note_moyenne?: number | null

  created_at?: string
  updated_at?: string

  rich_content?: RichContent | null

  [key: string]: any
}

export interface DraftProduct extends ProductDraft {
  _saved_at?: string
}

export interface FormSummary {
  nom: string
  slug: string
  categorie: string
  prixUsd: number
  prixCdf: number
  stock: number | null
  imagesCount: number
  variantesCount: number
  remisePercent: number
  estActif: boolean
  descriptionLength: number
  metaTitleLength: number
  metaDescriptionLength: number
  variantAttributesCount: number
  variantConfigEnabled: boolean
  deliveryAdvancedEnabled: boolean
  deliveryActiveModesCount: number
  deliveryNonConsolidable: boolean
}

export interface PreparedProductPayload {
  payload: ProductDraft
  errors: string[]
  summary: FormSummary
}

export interface StepProps {
  stepId: string
  activeStep: number
  values: ProductDraft
  onChange: (patch: Partial<ProductDraft>) => void
  rate: number | null
  mode: ProductAdminMode
  productId?: string | null
  submitting?: boolean
  [key: string]: any
}