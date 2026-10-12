// __tests__/lib/loyalty.test.ts
import { getLevelFromPoints, computeLoyaltyProfile } from '@/lib/loyalty'

describe('getLevelFromPoints', () => {
  it('renvoie "none" pour 0 point', () => {
    expect(getLevelFromPoints(0)).toBe('none')
  })
  it('renvoie "bronze" à 150 points', () => {
    expect(getLevelFromPoints(150)).toBe('bronze')
  })
  it('renvoie "silver" à 600 points', () => {
    expect(getLevelFromPoints(600)).toBe('silver')
  })
  it('renvoie "gold" à 2000 points', () => {
    expect(getLevelFromPoints(2000)).toBe('gold')
  })
  it('renvoie "platinum" à 6000 points', () => {
    expect(getLevelFromPoints(6000)).toBe('platinum')
  })
  it('renvoie "diamond" à 20000 points', () => {
    expect(getLevelFromPoints(20000)).toBe('diamond')
  })
})