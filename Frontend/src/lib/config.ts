import type { DeliveryRate } from './types'

export interface ShopConfig {
  code: string
  name: string
}

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function getShops(): Promise<ShopConfig[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json() as ShopConfig[]
  } catch {
    return []
  }
}

export async function getShopConfig(code: string): Promise<ShopConfig | undefined> {
  const shops = await getShops()
  return shops.find((s) => s.code === code)
}

export const DEFAULT_DELIVERY_RATES: DeliveryRate[] = [
  { maxKm: 3, fee: 3.50 },
  { maxKm: 5, fee: 4.50 },
  { maxKm: 6, fee: 5.00 },
  { maxKm: 7, fee: 6.00 },
  { maxKm: 8, fee: 7.00 },
  { maxKm: 9999, fee: 8.00 },
]

// legacy alias
export const DELIVERY_FEE_TABLE = DEFAULT_DELIVERY_RATES

export const EXPENSE_CATEGORIES = [
  'Material',
  'Tool',
  'Utility',
  'Salary',
  'Maintenance',
  'Other',
]

export function calcDeliveryFee(km: number, rates?: DeliveryRate[]): number {
  const table = rates ?? DEFAULT_DELIVERY_RATES
  const row = table.find((r) => km <= r.maxKm)
  return row?.fee ?? table[table.length - 1].fee
}

export function rateLabel(rates: DeliveryRate[], index: number): string {
  const prev = index === 0 ? 0 : rates[index - 1].maxKm
  const curr = rates[index].maxKm
  if (index === 0) return `≤${curr} km`
  if (curr >= 9999) return `>${prev} km`
  return `>${prev}–${curr} km`
}
