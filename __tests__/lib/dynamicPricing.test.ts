// __tests__/lib/dynamicPricing.test.ts
import { getSuggestedPrice } from '@/lib/dynamicPricing'

// Mock de la fonction interne fetchProductFactors (non exportée)
jest.mock('@/lib/dynamicPricing', () => {
  const actual = jest.requireActual('@/lib/dynamicPricing')
  return {
    ...actual,
    fetchProductFactors: jest.fn(),
  }
})

const { fetchProductFactors } = require('@/lib/dynamicPricing')

describe('getSuggestedPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('suggère un prix plus élevé quand la demande est forte et le stock faible', async () => {
    ;(fetchProductFactors as jest.Mock).mockResolvedValue({
      currentPrice: 50000,
      stock: 2,
      recentViews: 150,
      pendingOrders: 4,
      competitorAvgPrice: 48000,
      conversionRate: 0.1,
    })
    const result = await getSuggestedPrice('fakeId')
    expect(result.suggestedPrice).toBeGreaterThan(50000)
    expect(result.adjustmentPercent).toBeGreaterThan(0)
    expect(result.reasoning).toContain('demande')
  })

  it('suggère une baisse de prix quand le prix est au-dessus de la concurrence et stock abondant', async () => {
    ;(fetchProductFactors as jest.Mock).mockResolvedValue({
      currentPrice: 70000,
      stock: 100,
      recentViews: 5,
      pendingOrders: 0,
      competitorAvgPrice: 45000,
      conversionRate: 0.01,
    })
    const result = await getSuggestedPrice('fakeId')
    expect(result.suggestedPrice).toBeLessThan(70000)
    expect(result.adjustmentPercent).toBeLessThan(0)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('ne dépasse jamais la limite maximale d’augmentation', async () => {
    ;(fetchProductFactors as jest.Mock).mockResolvedValue({
      currentPrice: 1000,
      stock: 0,
      recentViews: 1000,
      pendingOrders: 100,
      competitorAvgPrice: 2000,
      conversionRate: 0.9,
    })
    const result = await getSuggestedPrice('fakeId')
    const maxIncrease = 1000 * (1 + 30 / 100) // MAX_INCREASE_PERCENT = 30
    expect(result.suggestedPrice).toBeLessThanOrEqual(maxIncrease)
  })

  it('ne descend jamais en dessous du prix minimum', async () => {
    ;(fetchProductFactors as jest.Mock).mockResolvedValue({
      currentPrice: 200,
      stock: 1000,
      recentViews: 0,
      pendingOrders: 0,
      competitorAvgPrice: 50,
      conversionRate: 0,
    })
    const result = await getSuggestedPrice('fakeId')
    expect(result.suggestedPrice).toBeGreaterThanOrEqual(500) // MIN_PRICE = 500
  })
})