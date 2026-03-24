'use client'

import { createContext, useContext } from 'react'
import type { Session } from '@/lib/types'
import type { ShopConfig } from '@/lib/config'

interface ShopContextValue {
  session: Session
  shop: ShopConfig
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
  return <ShopContext.Provider value={{ session, shop }}>{children}</ShopContext.Provider>
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used within ShopProvider')
  return ctx
}
