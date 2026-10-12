// components/LanguageSwitcher.tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown'
import { cn } from '@/lib/utils'

const locales = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
]

export function LanguageSwitcher() {
  const router = useRouter()
  const [switching, setSwitching] = useState<string | null>(null)
  const [currentLocale, setCurrentLocale] = useState(locales[0])

  // Récupération du cookie uniquement côté client
  useEffect(() => {
    const cookieLocale = document.cookie
      .split('; ')
      .find(row => row.startsWith('NEXT_LOCALE='))
      ?.split('=')[1]
    if (cookieLocale) {
      const found = locales.find(l => l.code === cookieLocale)
      if (found) setCurrentLocale(found)
    }
  }, [])

  const switchLocale = useCallback(
    (locale: string) => {
      setSwitching(locale)
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
      router.refresh()
      setTimeout(() => setSwitching(null), 1000)
    },
    [router]
  )

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<Globe size={18} />}
      className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
    >
      <span className="hidden md:inline">{currentLocale.flag} {currentLocale.label}</span>
    </Button>
  )

  return (
    <Dropdown trigger={trigger} side="bottom" sideAlign="end">
      {locales.map((locale) => (
        <DropdownItem
          key={locale.code}
          onClick={() => switchLocale(locale.code)}
          disabled={switching === locale.code}
          className={cn(
            'flex items-center gap-3',
            locale.code === currentLocale.code && 'font-bold text-brand-600 dark:text-brand-400'
          )}
        >
          <span className="text-lg">{locale.flag}</span>
          <span>{locale.label}</span>
          {switching === locale.code && (
            <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          )}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
