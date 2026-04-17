'use server'

import { getSession } from '@/lib/session'
import type { RevenueEntry, DeliveryPlatform } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getRevenueData(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/revenue`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch revenue')
  return res.json() as Promise<{ entries: RevenueEntry[]; platforms: DeliveryPlatform[] }>
}

export async function saveRevenueEntry(shopCode: string, entry: RevenueEntry) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/revenue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error('Failed to save revenue entry')
}

export async function deleteRevenueEntry(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/revenue/${id}`, {
    method: 'DELETE',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Failed to delete revenue entry')
}

export async function saveAuditLog(
  shopCode: string,
  entry: { editorName: string; note: string; employeeName: string; shift: string; changes: string },
): Promise<void> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return
  try {
    await fetch(`${BACKEND_URL}/${shopCode}/config/audit-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
      body: JSON.stringify(entry),
    })
  } catch { /* audit failure should not block the action */ }
}

export async function savePlatforms(shopCode: string, platforms: DeliveryPlatform[]) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/revenue/platforms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(platforms),
  })
  if (!res.ok) throw new Error('Failed to save platforms')
}
