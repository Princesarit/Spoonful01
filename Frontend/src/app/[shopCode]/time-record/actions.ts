'use server'

import { getSession } from '@/lib/session'
import type { Employee, TimeRecord, DeliveryTrip } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getTimeRecordData(shopCode: string, date: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/time-records?date=${date}`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch time records')
  return res.json() as Promise<{
    employees: Employee[]
    timeRecords: TimeRecord[]
    deliveryTrips: DeliveryTrip[]
  }>
}

export async function saveTimeRecords(
  shopCode: string,
  date: string,
  records: TimeRecord[],
  trips: DeliveryTrip[],
) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/time-records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify({ date, records, trips }),
  })
  if (!res.ok) throw new Error('Failed to save time records')
}
