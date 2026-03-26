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

  useEffect(() => {
    const saved = localStorage.getItem('spoonful_lang') as Lang | null
    if (saved === 'th' || saved === 'en') setLang(saved)
  }, [])

  function toggleLang() {
    setLang((prev) => {
      const next: Lang = prev === 'th' ? 'en' : 'th'
      localStorage.setItem('spoonful_lang', next)
      return next
    })
  }

  return (
    <ShopContext.Provider value={{ session, shop, lang, toggleLang }}>
      {children}
    </ShopContext.Provider>
  )
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used within ShopProvider')
  return ctx
}
