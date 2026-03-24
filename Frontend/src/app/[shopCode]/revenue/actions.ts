'use server'

import { db } from '@/lib/data'
import { getSession } from '@/lib/session'
import type { RevenueEntry, DeliveryPlatform } from '@/lib/types'

export async function getRevenueData(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  return {
    entries: db.revenue.list(shopCode),
    platforms: db.platforms.list(shopCode),
  }
}

export async function saveRevenueEntry(shopCode: string, entry: RevenueEntry) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const all = db.revenue.list(shopCode)
  const idx = all.findIndex((e) => e.id === entry.id)
  if (idx >= 0) all[idx] = entry
  else all.push(entry)
  db.revenue.save(shopCode, all)
}

export async function deleteRevenueEntry(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  db.revenue.save(shopCode, db.revenue.list(shopCode).filter((e) => e.id !== id))
}

export async function savePlatforms(shopCode: string, platforms: DeliveryPlatform[]) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')
  db.platforms.save(shopCode, platforms)
}
