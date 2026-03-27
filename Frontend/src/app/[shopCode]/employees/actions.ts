'use server'

import { getSession } from '@/lib/session'
import type { Employee } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export async function saveEmployeeAction(shopCode: string, employee: Employee) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || (session.role !== 'owner' && session.role !== 'manager'))
    return { error: 'ไม่มีสิทธิ์' }

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(session.token) },
    body: JSON.stringify(employee),
  })
  if (!res.ok) return { error: 'บันทึกไม่สำเร็จ' }
  return { ok: true }
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

export async function deleteEmployeeAction(shopCode: string, id: string) {
  const session = await getSession()
  if (!session || session.shopCode !== shopCode || (session.role !== 'owner' && session.role !== 'manager'))
    return { error: 'ไม่มีสิทธิ์' }

  const res = await fetch(`${BACKEND_URL}/${shopCode}/employees/${id}`, {
    method: 'DELETE',
    headers: authHeader(session.token),
  })
  if (!res.ok) return { error: 'ลบไม่สำเร็จ' }
  return { ok: true }
}
