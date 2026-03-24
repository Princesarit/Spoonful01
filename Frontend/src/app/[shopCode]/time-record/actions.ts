'use server'

import { db } from '@/lib/data'
import { getSession } from '@/lib/session'
import type { TimeRecord, DeliveryTrip } from '@/lib/types'

export async function getTimeRecordData(shopCode: string, date: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  return {
    employees: db.employees.list(shopCode),
    timeRecords: db.timeRecords.list(shopCode).filter((r) => r.date === date),
    deliveryTrips: db.deliveryTrips.list(shopCode).filter((t) => t.date === date),
  }
}

export async function saveTimeRecords(
  shopCode: string,
  date: string,
  records: TimeRecord[],
  trips: DeliveryTrip[],
) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  // Replace records for this date
  const allRecords = db.timeRecords.list(shopCode).filter((r) => r.date !== date)
  db.timeRecords.save(shopCode, [...allRecords, ...records])

  const allTrips = db.deliveryTrips.list(shopCode).filter((t) => t.date !== date)
  db.deliveryTrips.save(shopCode, [...allTrips, ...trips])
}
