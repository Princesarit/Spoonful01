'use server'

import { getSession } from '@/lib/session'
import type { ClosedDate, ClosedMeal } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getClosedDates(shopCode: string): Promise<ClosedDate[]> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return []
  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/closed-dates`, {
      headers: authHeader(session.token),
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json() as Promise<ClosedDate[]>
  } catch {
    return []
  }
}

export async function addClosedDate(
  shopCode: string,
  entry: { date: string; meal: ClosedMeal; note: string; closedBy: string },
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    return { ok: false, error: 'Unauthorized' }
  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/closed-dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
      body: JSON.stringify(entry),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      return { ok: false, error: d.error ?? 'Failed' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function removeClosedDate(
  shopCode: string,
  date: string,
  meal?: ClosedMeal,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    return { ok: false, error: 'Unauthorized' }
  try {
    const qs = meal ? `?meal=${meal}` : ''
    const res = await fetch(`${BACKEND_URL}/${shopCode}/closed-dates/${date}${qs}`, {
      method: 'DELETE',
      headers: authHeader(session.token),
    })
    if (!res.ok) return { ok: false, error: 'Failed' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  try {
    const res = await fetch(`${BACKEND_URL}/auth/elevate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) return false
    const data = await res.json() as { role?: string }
    return data.role === 'owner'
  } catch {
    return false
  }
}
