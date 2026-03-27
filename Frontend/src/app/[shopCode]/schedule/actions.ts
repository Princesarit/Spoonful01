'use server'

import { getSession } from '@/lib/session'
import type { Employee, WeekSchedule } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function getScheduleData(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/schedules`, {
    headers: authHeader(session.token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch schedule')
  return res.json() as Promise<{ employees: Employee[]; schedules: WeekSchedule[] }>
}

export async function saveWeekSchedule(shopCode: string, weekSchedule: WeekSchedule) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(weekSchedule),
  })
  if (!res.ok) throw new Error('Failed to save schedule')
}

export async function saveEmployee(shopCode: string, employee: Employee) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || (session.role !== 'owner' && session.role !== 'manager'))
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(employee),
  })
  if (!res.ok) throw new Error('Failed to save employee')
}

export async function saveAuditLog(
  shopCode: string,
  entry: { editorName: string; note: string; employeeName: string; shift: string; changes: string },
): Promise<void> {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) return
  try {
    await fetch(`${BACKEND_URL}/${shopCode}/config/audit-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
      body: JSON.stringify(entry),
    })
  } catch { /* audit failure should not block the action */ }
}

export async function deleteEmployee(shopCode: string, employeeId: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || (session.role !== 'owner' && session.role !== 'manager'))
    throw new Error('Unauthorized')

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees/${employeeId}`, {
    method: 'DELETE',
    headers: authHeader(session.token),
  })
  if (!res.ok) throw new Error('Failed to delete employee')
}
