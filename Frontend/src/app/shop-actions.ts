'use server'

import type { StoredShop, ClosedDate, ClosedMeal } from '@/lib/types'
import type { ShopConfig } from '@/lib/config'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const MASTER_PASSWORD = process.env.MASTER_OWNER_PASSWORD ?? ''

export async function getShopsAction(): Promise<ShopConfig[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json() as ShopConfig[]
  } catch {
    return []
  }
}

export async function getStoredShopsAction(password: string): Promise<StoredShop[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/admin?password=${encodeURIComponent(password)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json() as StoredShop[]
  } catch {
    return null
  }
}

export async function addShopAction(
  password: string,
  name: string,
  restaurantPassword: string,
  managerPassword: string,
  spreadsheetId?: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, name, restaurantPassword, managerPassword, spreadsheetId: spreadsheetId || undefined }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) return { error: data.error ?? 'เกิดข้อผิดพลาด' }
    return { ok: true }
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }
}

export async function updateShopAction(
  password: string,
  code: string,
  name: string,
  restaurantPassword: string,
  managerPassword: string,
  spreadsheetId?: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, name, restaurantPassword, managerPassword, spreadsheetId: spreadsheetId || undefined }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) return { error: data.error ?? 'เกิดข้อผิดพลาด' }
    return { ok: true }
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }
}

export async function deleteShopAction(
  password: string,
  code: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) return { error: data.error ?? 'เกิดข้อผิดพลาด' }
    return { ok: true }
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }
}

export async function changeOwnerPasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/change-owner-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const data = await res.json() as { error?: string }
    if (!res.ok) return { error: data.error ?? 'เกิดข้อผิดพลาด' }
    return { ok: true }
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }
}

export interface DueExpenseItem {
  id: string
  supplier: string
  total: number
  dueDate: string
  description?: string
  paymentMethod?: string
}

export interface DueExpenseShop {
  shopCode: string
  shopName: string
  expenses: DueExpenseItem[]
}

export async function getDueExpensesAction(): Promise<DueExpenseShop[] | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/due-expenses`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json() as DueExpenseShop[]
  } catch {
    return null
  }
}

export async function verifyMasterPasswordAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | { ok: true }> {
  const password = formData.get('password') as string
  if (!MASTER_PASSWORD || password !== MASTER_PASSWORD) return { error: 'รหัสผ่านไม่ถูกต้อง' }
  return { ok: true }
}

// ── Master Closed Dates (password-only, no session) ───────────────────────────

export async function verifyOwnerPasswordMaster(password: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/verify-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.ok
  } catch { return false }
}

export async function getMasterClosedDates(ownerPassword: string, shopCode: string): Promise<ClosedDate[]> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/shops/master-closed-dates?password=${encodeURIComponent(ownerPassword)}&shopCode=${encodeURIComponent(shopCode)}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return []
    return res.json() as Promise<ClosedDate[]>
  } catch { return [] }
}

export async function addMasterClosedDate(
  ownerPassword: string,
  shopCode: string,
  entry: { date: string; meal: ClosedMeal; note: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/master-closed-dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ownerPassword, shopCode, ...entry, closedBy: 'owner' }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      return { ok: false, error: d.error ?? 'Failed' }
    }
    return { ok: true }
  } catch { return { ok: false, error: 'Network error' } }
}

export async function removeMasterClosedDate(
  ownerPassword: string,
  shopCode: string,
  date: string,
  meal?: ClosedMeal,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const qs = meal ? `?meal=${meal}` : ''
    const res = await fetch(`${BACKEND_URL}/shops/master-closed-dates/${shopCode}/${date}${qs}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ownerPassword }),
    })
    if (!res.ok) return { ok: false, error: 'Failed' }
    return { ok: true }
  } catch { return { ok: false, error: 'Network error' } }
}

export async function getPublicShopsAction(): Promise<{ code: string; name: string }[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops`, { cache: 'no-store' })
    if (!res.ok) return []
    return res.json() as Promise<{ code: string; name: string }[]>
  } catch { return [] }
}
