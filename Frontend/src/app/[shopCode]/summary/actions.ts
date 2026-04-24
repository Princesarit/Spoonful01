'use server'

import { getSession } from '@/lib/session'
import type { Employee, TimeRecord, DeliveryTrip, RevenueEntry, ExpenseEntry, DailyNote } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getSummaryData(shopCode: string, month: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/summary?month=${month}`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch summary')
  return res.json() as Promise<{
    employees: Employee[]
    timeRecords: TimeRecord[]
    deliveryTrips: DeliveryTrip[]
    revenue: RevenueEntry[]
    expenses: ExpenseEntry[]
    notes: DailyNote[]
  }>
}

export async function getSummaryDataAll(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  const res = await fetch(`${BACKEND_URL}/${shopCode}/summary`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch summary')
  return res.json() as Promise<{
    employees: Employee[]
    timeRecords: TimeRecord[]
    deliveryTrips: DeliveryTrip[]
    revenue: RevenueEntry[]
    expenses: ExpenseEntry[]
    notes: DailyNote[]
  }>
}

export async function syncReportSheets(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/sheets/sync`, {
    method: 'POST',
    headers: authHeader(session.token),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Sync failed')
  }
  return res.json() as Promise<{ ok: boolean; message: string }>
}

export async function hideReportSheets(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/sheets/sync/hide`, {
    method: 'POST',
    headers: authHeader(session.token),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Hide failed')
  }
  return res.json() as Promise<{ ok: boolean }>
}

export async function getAllExpenses(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  const res = await fetch(`${BACKEND_URL}/${shopCode}/expenses`, {
    headers: { Authorization: `Bearer ${session.token}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch expenses')
  return res.json() as Promise<ExpenseEntry[]>
}

export async function syncSumSheet(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  const res = await fetch(`${BACKEND_URL}/${shopCode}/sheets/sync/sum`, {
    method: 'POST',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Sum sync failed')
}

export async function saveExpenseEntry(shopCode: string, entry: ExpenseEntry) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error('Failed to save expense')
}

export async function saveDailyNote(shopCode: string, date: string, note: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify({ date, note }),
  })
  if (!res.ok) throw new Error('Failed to save note')
}
