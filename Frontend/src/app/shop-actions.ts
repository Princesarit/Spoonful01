'use server'

import type { StoredShop } from '@/lib/types'
import type { ShopConfig } from '@/lib/config'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4001'
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
  ownerPassword: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, name, restaurantPassword, ownerPassword }),
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
  ownerPassword: string,
): Promise<{ error: string } | { ok: true }> {
  try {
    const res = await fetch(`${BACKEND_URL}/shops/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, name, restaurantPassword, ownerPassword }),
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

export async function verifyMasterPasswordAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | { ok: true }> {
  const password = formData.get('password') as string
  if (!MASTER_PASSWORD || password !== MASTER_PASSWORD) return { error: 'รหัสผ่านไม่ถูกต้อง' }
  return { ok: true }
}
