'use server'

import { getSession } from '@/lib/session'
import type { Employee, TimeRecord } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
function authHeader(token: string) { return { Authorization: `Bearer ${token}` } }

export async function getWageData(shopCode: string, weekStart: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const dates = Array.from({ length: 7 }, (_, i) => {
    const [y, mo, day] = weekStart.split('-').map(Number)
    const d = new Date(y, mo - 1, day + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // Fetch all 7 days in parallel — each response includes employees + timeRecords
  const responses = await Promise.all(
    dates.map((date) =>
      fetch(`${BACKEND_URL}/${shopCode}/time-records?date=${date}`, {
        headers: authHeader(session.token),
        cache: 'no-store',
      })
    )
  )

  let employees: Employee[] = []
  const timeRecords: TimeRecord[] = []

  for (const res of responses) {
    if (!res.ok) continue
    const data = await res.json() as { employees: Employee[]; timeRecords: TimeRecord[] }
    if (employees.length === 0 && data.employees?.length > 0) {
      employees = data.employees
    }
    timeRecords.push(...(data.timeRecords ?? []))
  }

  const extraRateRes = await fetch(`${BACKEND_URL}/${shopCode}/config/extra-rate`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  const extraRate: number = extraRateRes.ok
    ? ((await extraRateRes.json()) as { rate: number }).rate ?? 0
    : 0

  return { employees, timeRecords, extraRate }
}

export interface WagePaymentEntry {
  tax: number
  paid: number
  note: string
  overrides: Record<string, number>
}

export async function getWagePayments(
  shopCode: string,
  weekStart: string,
): Promise<{ payments: Record<string, WagePaymentEntry>; weekNote: string }> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return { payments: {}, weekNote: '' }
  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/wages/payments?weekStart=${weekStart}`, {
      headers: authHeader(session.token),
      cache: 'no-store',
    })
    if (!res.ok) return { payments: {}, weekNote: '' }
    return await res.json() as { payments: Record<string, WagePaymentEntry>; weekNote: string }
  } catch {
    return { payments: {}, weekNote: '' }
  }
}

export async function saveWagePayments(
  shopCode: string,
  weekStart: string,
  payments: { employeeId: string; tax: number; paid: number; note: string; overrides: Record<string, number> }[],
  weekNote: string,
): Promise<void> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  const res = await fetch(`${BACKEND_URL}/${shopCode}/wages/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify({ weekStart, payments, weekNote }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Save failed')
  }
}
