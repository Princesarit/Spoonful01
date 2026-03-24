'use server'

import { db } from '@/lib/data'
import { getSession } from '@/lib/session'
import type { Employee, WeekSchedule } from '@/lib/types'

export async function getScheduleData(shopCode: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')
  return {
    employees: db.employees.list(shopCode),
    schedules: db.schedules.list(shopCode),
  }
}

export async function saveWeekSchedule(shopCode: string, weekSchedule: WeekSchedule) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) throw new Error('Unauthorized')

  const all = db.schedules.list(shopCode)
  const idx = all.findIndex((s) => s.weekStart === weekSchedule.weekStart)
  if (idx >= 0) all[idx] = weekSchedule
  else all.push(weekSchedule)
  db.schedules.save(shopCode, all)
}

export async function saveEmployee(shopCode: string, employee: Employee) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  const all = db.employees.list(shopCode)
  const idx = all.findIndex((e) => e.id === employee.id)
  if (idx >= 0) all[idx] = employee
  else all.push(employee)
  db.employees.save(shopCode, all)
}

export async function deleteEmployee(shopCode: string, employeeId: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner')
    throw new Error('Unauthorized')

  db.employees.save(
    shopCode,
    db.employees.list(shopCode).filter((e) => e.id !== employeeId),
  )
}
