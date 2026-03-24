export interface ShopConfig {
  code: string
  name: string
}

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4001'

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

export const DELIVERY_FEE_TABLE: { maxKm: number; fee: number }[] = [
  { maxKm: 3, fee: 50 },
  { maxKm: 5, fee: 70 },
  { maxKm: 6, fee: 90 },
  { maxKm: 8, fee: 110 },
  { maxKm: 10, fee: 130 },
  { maxKm: Infinity, fee: 150 },
]

export const EXPENSE_CATEGORIES = [
  'Material',
  'Tool',
  'Utility',
  'Salary',
  'Maintenance',
  'Other',
]

export function calcDeliveryFee(km: number): number {
  const row = DELIVERY_FEE_TABLE.find((r) => km <= r.maxKm)
  return row?.fee ?? DELIVERY_FEE_TABLE[DELIVERY_FEE_TABLE.length - 1].fee
}
