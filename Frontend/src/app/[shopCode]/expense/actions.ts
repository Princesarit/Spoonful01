'use server'

import { db } from '@/lib/data'
import { getSession } from '@/lib/session'
import type { ExpenseEntry } from '@/lib/types'

export async function getExpenses(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  return db.expenses.list(shopCode)
}

export async function saveExpenseEntry(shopCode: string, entry: ExpenseEntry) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const all = db.expenses.list(shopCode)
  const idx = all.findIndex((e) => e.id === entry.id)
  if (idx >= 0) all[idx] = entry
  else all.push(entry)
  db.expenses.save(shopCode, all)
}

export async function deleteExpenseEntry(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  db.expenses.save(shopCode, db.expenses.list(shopCode).filter((e) => e.id !== id))
}

export async function togglePaid(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const all = db.expenses.list(shopCode)
  const idx = all.findIndex((e) => e.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], paid: !all[idx].paid }
    db.expenses.save(shopCode, all)
    return all[idx].paid
  }
  return false
}
