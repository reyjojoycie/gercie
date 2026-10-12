// features/loyalty/services/loyaltyService.ts
import { createClient as createServerClient } from '@/lib/supabaseServer'

// ---------------------------------------------------------------------------
// Types & Configuration
// ---------------------------------------------------------------------------

export type FideliteLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface LoyaltyProfile {
  level: FideliteLevel
  points: number
  totalSpent: number
  nextLevel: FideliteLevel | null
  pointsToNextLevel: number | null
  benefits: string[]
  progressPercent: number
}

interface LevelConfig {
  key: FideliteLevel
  label: string
  minPoints: number
  pointsMultiplier: number   // combien de points pour 1 FC dépensé
  benefits: string[]
}

const LEVEL_CONFIG: LevelConfig[] = [
  {
    key: 'none',
    label: 'Nouveau',
    minPoints: 0,
    pointsMultiplier: 1,
    benefits: ['Accès à la plateforme'],
  },
  {
    key: 'bronze',
    label: 'Bronze',
    minPoints: 100,
    pointsMultiplier: 1,
    benefits: ['Retours gratuits sous 14 jours', 'Support prioritaire'],
  },
  {
    key: 'silver',
    label: 'Silver',
    minPoints: 500,
    pointsMultiplier: 1.2,
    benefits: ['Livraison offerte dès 30$', 'Retours gratuits sous 30 jours'],
  },
  {
    key: 'gold',
    label: 'Gold',
    minPoints: 1500,
    pointsMultiplier: 1.5,
    benefits: ['Livraison express gratuite', 'Offres exclusives', 'Service client dédié'],
  },
  {
    key: 'platinum',
    label: 'Platinum',
    minPoints: 5000,
    pointsMultiplier: 2,
    benefits: ['Tout Gold +', 'Accès avant-première', 'Cadeau d’anniversaire'],
  },
  {
    key: 'diamond',
    label: 'Diamond',
    minPoints: 15000,
    pointsMultiplier: 3,
    benefits: ['Tout Platinum +', 'Conciergerie personnelle', 'Événements VIP'],
  },
]

// ---------------------------------------------------------------------------
// 1. Récupérer le profil de fidélité d'un utilisateur
// ---------------------------------------------------------------------------
export async function getUserLoyaltyProfile(userId: string): Promise<LoyaltyProfile> {
  const supabase = await createServerClient(true) // service_role

  // Récupérer les points et le total dépensé depuis la table des profils
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('points_fidelite, total_depense')
    .eq('id', userId)
    .single()

  const points = profile?.points_fidelite ?? 0
  const totalSpent = profile?.total_depense ?? 0

  return computeLoyaltyProfile(points, totalSpent)
}

// ---------------------------------------------------------------------------
// 2. Calculer le niveau et les informations à partir des points
// ---------------------------------------------------------------------------
function computeLoyaltyProfile(points: number, totalSpent: number): LoyaltyProfile {
  let currentLevel: LevelConfig = LEVEL_CONFIG[0]
  let nextLevel: LevelConfig | null = null
  let pointsToNextLevel: number | null = null

  for (let i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
    if (points >= LEVEL_CONFIG[i].minPoints) {
      currentLevel = LEVEL_CONFIG[i]
      if (i < LEVEL_CONFIG.length - 1) {
        nextLevel = LEVEL_CONFIG[i + 1]
        pointsToNextLevel = nextLevel.minPoints - points
      } else {
        nextLevel = null
        pointsToNextLevel = null
      }
      break
    }
  }

  // Calcul du pourcentage de progression vers le niveau suivant
  let progressPercent = 100
  if (nextLevel && currentLevel.key !== 'diamond') {
    progressPercent = Math.round(((points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100)
  }

  return {
    level: currentLevel.key,
    points,
    totalSpent,
    nextLevel: nextLevel?.key ?? null,
    pointsToNextLevel,
    benefits: currentLevel.benefits,
    progressPercent,
  }
}

// ---------------------------------------------------------------------------
// 3. Ajouter des points après une commande terminée
// ---------------------------------------------------------------------------
export async function addLoyaltyPoints(userId: string, spentAmount: number): Promise<LoyaltyProfile> {
  const supabase = await createServerClient(true)

  // Récupérer les données actuelles
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('points_fidelite, total_depense')
    .eq('id', userId)
    .single()

  if (error) throw new Error('Utilisateur introuvable')

  // Déterminer le multiplicateur actuel
  const currentProfile = computeLoyaltyProfile(profile.points_fidelite ?? 0, profile.total_depense ?? 0)
  const levelConfig = LEVEL_CONFIG.find(l => l.key === currentProfile.level) ?? LEVEL_CONFIG[0]
  const earnedPoints = Math.round(spentAmount * levelConfig.pointsMultiplier)

  const newPoints = (profile.points_fidelite ?? 0) + earnedPoints
  const newTotalSpent = (profile.total_depense ?? 0) + spentAmount

  // Mise à jour du profil
  await supabase
    .from('profiles')
    .update({
      points_fidelite: newPoints,
      total_depense: newTotalSpent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  return computeLoyaltyProfile(newPoints, newTotalSpent)
}

// ---------------------------------------------------------------------------
// 4. Récupérer les avantages pour un niveau donné
// ---------------------------------------------------------------------------
export function getBenefitsForLevel(level: FideliteLevel): string[] {
  const config = LEVEL_CONFIG.find(l => l.key === level)
  return config?.benefits ?? []
}

// ---------------------------------------------------------------------------
// 5. Obtenir le multiplicateur de points pour un niveau
// ---------------------------------------------------------------------------
export function getPointsMultiplier(level: FideliteLevel): number {
  const config = LEVEL_CONFIG.find(l => l.key === level)
  return config?.pointsMultiplier ?? 1
}

// ---------------------------------------------------------------------------
// 6. Vérifier si un utilisateur peut accéder à un avantage spécifique
// ---------------------------------------------------------------------------
export function checkBenefit(level: FideliteLevel, benefit: string): boolean {
  const benefits = getBenefitsForLevel(level)
  return benefits.includes(benefit)
}

// ---------------------------------------------------------------------------
// 7. Déterminer le niveau à partir des points (utile côté client)
// ---------------------------------------------------------------------------
export function getLevelFromPoints(points: number): FideliteLevel {
  let level: FideliteLevel = 'none'
  for (const config of LEVEL_CONFIG) {
    if (points >= config.minPoints) {
      level = config.key
    } else {
      break
    }
  }
  return level
}