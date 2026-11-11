// features/admin/produits/steps/index.ts

import GeneralStep from './GeneralStep'
import MediaStep from './MediaStep'
import PricingStep from './PricingStep'
import VariantsStep from './VariantsStep'
import DeliveryStep from './DeliveryStep'
import SpecsStep from './SpecsStep'
import SeoStep from './SeoStep'
import BadgesStep from './BadgesStep'
import RichContentStep from './RichContentStep'
import DetailsStep from './DetailsStep'

import type { ProductStepId } from '../constants/steps'
import type { ComponentType } from 'react'

export const STEP_COMPONENTS: Record<ProductStepId, ComponentType> = {
  general: GeneralStep,
  media: MediaStep,
  pricing: PricingStep,
  variants: VariantsStep,
  delivery: DeliveryStep,
  specs: SpecsStep,
  seo: SeoStep,
  badges: BadgesStep,
  rich_content: RichContentStep,
  details: DetailsStep,
}