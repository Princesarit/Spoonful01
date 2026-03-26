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

export async function getWeekTimeRecords(shopCode: string, weekStart: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  // สร้าง 7 วันของสัปดาห์
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const res = await fetch(`${BACKEND_URL}/${shopCode}/time-records`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch time records')
  const data = await res.json() as {
    employees: Employee[]
    timeRecords: TimeRecord[]
    deliveryTrips: DeliveryTrip[]
  }
  return {
    employees: data.employees,
    timeRecords: data.timeRecords.filter((r) => weekDates.includes(r.date)),
    weekDates,
  }
}

export async function saveEmployee(shopCode: string, employee: import('@/lib/types').Employee) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(employee),
  })
  if (!res.ok) throw new Error('Failed to save employee')
}

export async function deleteEmployee(shopCode: string, employeeId: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees/${employeeId}`, {
    method: 'DELETE',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Failed to delete employee')
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
