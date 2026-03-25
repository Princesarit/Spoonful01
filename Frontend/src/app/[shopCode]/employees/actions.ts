'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { db } from '@/lib/data'
import type { Employee } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

export async function saveEmployeeAction(
  shopCode: string,
  data: Omit<Employee, 'id'> & { id?: string },
) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner') {
    return { error: 'ไม่มีสิทธิ์' }
  }
  const all = db.employees.list(shopCode)
  const employee: Employee = { ...data, id: data.id || uuidv4(), defaultDays: data.defaultDays }
  const idx = all.findIndex((e) => e.id === employee.id)
  if (idx >= 0) all[idx] = employee
  else all.push(employee)
  db.employees.save(shopCode, all)
  revalidatePath(`/${shopCode}/employees`)
  return { ok: true }
}

export async function deleteEmployeeAction(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || session.role !== 'owner') {
    return { error: 'ไม่มีสิทธิ์' }
  }
  const all = db.employees.list(shopCode)
  db.employees.save(shopCode, all.filter((e) => e.id !== id))
  revalidatePath(`/${shopCode}/employees`)
  return { ok: true }
}
