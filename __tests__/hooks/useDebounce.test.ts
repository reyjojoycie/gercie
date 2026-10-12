// __tests__/hooks/useDebounce.test.ts
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/useDebounce'

describe('useDebounce', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it('retourne la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebounce('test', 500))
    expect(result.current).toBe('test')
  })

  it('ne met pas à jour la valeur avant le délai', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(result.current).toBe('initial')
  })

  it('met à jour la valeur après le délai', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })
    act(() => {
      jest.advanceTimersByTime(600)
    })
    expect(result.current).toBe('updated')
  })

  it('utilise le délai par défaut de 500ms si aucun delay fourni', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'start' } }
    )
    rerender({ value: 'next' })
    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(result.current).toBe('start')
    act(() => {
      jest.advanceTimersByTime(200)
    })
    expect(result.current).toBe('next')
  })
})