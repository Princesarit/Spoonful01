'use server'

import { getSession } from '@/lib/session'
import { DEFAULT_DELIVERY_RATES } from '@/lib/config'
import type { DeliveryRate } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getDeliveryRates(shopCode: string): Promise<DeliveryRate[]> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return DEFAULT_DELIVERY_RATES

  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/config/delivery-rates`, {
      headers: authHeader(session.token),
      cache: 'no-store',
    })
    if (!res.ok) return DEFAULT_DELIVERY_RATES
    return await res.json() as DeliveryRate[]
  } catch {
    return DEFAULT_DELIVERY_RATES
  }
}

export async function saveDeliveryRates(shopCode: string, rates: DeliveryRate[]): Promise<void> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/config/delivery-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(rates),
  })
  if (!res.ok) throw new Error('Failed to save delivery rates')
}

export async function getDeliveryFee(shopCode: string): Promise<number> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return 0

  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/config/delivery-fee`, {
      headers: authHeader(session.token),
      cache: 'no-store',
    })
    if (!res.ok) return 0
    const data = await res.json() as { fee: number }
    return data.fee ?? 0
  } catch {
    return 0
  }
}

export async function saveDeliveryFee(shopCode: string, fee: number): Promise<void> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/config/delivery-fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify({ fee }),
  })
  if (!res.ok) throw new Error('Failed to save delivery fee')
}
