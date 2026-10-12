// hooks/useLockBodyScroll.ts
import { useEffect } from 'react'

/**
 * Verrouille le défilement du body lorsque `isLocked` est true.
 *
 * @param isLocked - Booléen indiquant si le scroll doit être désactivé.
 *
 * @example
 * useLockBodyScroll(isOpen)
 */
export function useLockBodyScroll(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return

    const originalStyle = window.getComputedStyle(document.body).overflow
    document.body.style.overflow = 'hidden'

    // Restaurer le style initial lors de la désactivation ou du démontage
    return () => {
      document.body.style.overflow = originalStyle
    }
  }, [isLocked])
}
