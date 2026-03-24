'use server'

import { db } from '@/lib/data'
import { getSession } from '@/lib/session'

export async function getSummaryData(shopCode: string, month: string) {
  // month: YYYY-MM
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  return {
    employees: db.employees.list(shopCode),
    timeRecords: db.timeRecords.list(shopCode).filter((r) => r.date.startsWith(month)),
    deliveryTrips: db.deliveryTrips.list(shopCode).filter((t) => t.date.startsWith(month)),
    revenue: db.revenue.list(shopCode).filter((e) => e.date.startsWith(month)),
    expenses: db.expenses.list(shopCode).filter((e) => e.date.startsWith(month)),
    notes: db.notes.list(shopCode).filter((n) => n.date.startsWith(month)),
  }
}

export async function saveDailyNote(shopCode: string, date: string, note: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const all = db.notes.list(shopCode)
  const idx = all.findIndex((n) => n.date === date)
  if (note.trim() === '') {
    db.notes.save(shopCode, all.filter((n) => n.date !== date))
  } else if (idx >= 0) {
    all[idx] = { date, note: note.trim() }
    db.notes.save(shopCode, all)
  } else {
    db.notes.save(shopCode, [...all, { date, note: note.trim() }])
  }
}
