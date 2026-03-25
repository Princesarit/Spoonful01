'use server'

import { getSession } from '@/lib/session'
import type { ExpenseEntry } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getExpenses(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/expenses`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch expenses')
  return res.json() as Promise<ExpenseEntry[]>
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

export async function deleteExpenseEntry(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/expenses/${id}`, {
    method: 'DELETE',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Failed to delete expense')
}

export async function togglePaid(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/expenses/${id}/toggle-paid`, {
    method: 'PATCH',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Failed to toggle paid')
  const data = await res.json() as { paid: boolean }
  return data.paid
}
