'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { Session } from '@/lib/types'
import type { ShopConfig } from '@/lib/config'

export type Lang = 'th' | 'en'

interface ShopContextValue {
  session: Session
  shop: ShopConfig
  lang: Lang
  toggleLang: () => void
  isDark: boolean
  toggleDark: () => void
}

const ShopContext = createContext<ShopContextValue | null>(null)

export function ShopProvider({
  children,
  session,
  shop,
}: {
  children: React.ReactNode
  session: Session
  shop: ShopConfig
}) {
  const [lang, setLang] = useState<Lang>('th')
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const savedLang = localStorage.getItem('spoonful_lang') as Lang | null
    if (savedLang === 'th' || savedLang === 'en') setLang(savedLang)

    const savedDark = localStorage.getItem('spoonful_dark') === 'true'
    setIsDark(savedDark)
    document.documentElement.classList.toggle('dark', savedDark)
  }, [])

  function toggleLang() {
    setLang((prev) => {
      const next: Lang = prev === 'th' ? 'en' : 'th'
      localStorage.setItem('spoonful_lang', next)
      return next
    })
  }

  function toggleDark() {
    setIsDark((prev) => {
      const next = !prev
      localStorage.setItem('spoonful_dark', String(next))
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  return (
    <ShopContext.Provider value={{ session, shop, lang, toggleLang, isDark, toggleDark }}>
      {children}
    </ShopContext.Provider>
  )
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used within ShopProvider')
  return ctx
}
