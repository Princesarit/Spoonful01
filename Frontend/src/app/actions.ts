'use server'

import { redirect } from 'next/navigation'
import { setSession, clearSession, getSession } from '@/lib/session'
import type { ShopCode } from '@/lib/types'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const shopCode = formData.get('shopCode') as ShopCode
  const password = formData.get('password') as string

  if (!shopCode || !password) return { error: 'ข้อมูลไม่ครบ' }

  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopCode, password }),
    })
    const data = await res.json() as { token?: string; role?: string; error?: string }
    if (!res.ok || !data.role || !data.token) return { error: data.error ?? 'รหัสผ่านไม่ถูกต้อง' }

    await setSession({ shopCode, role: data.role as 'staff' | 'manager' | 'owner', token: data.token, loginAt: Date.now() })
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }

  redirect(`/${shopCode}`)
}

export async function elevateToOwnerAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const password = formData.get('password') as string
  const session = await getSession()
  if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  try {
    const res = await fetch(`${BACKEND_URL}/auth/elevate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ password }),
    })
    const data = await res.json() as { token?: string; role?: string; error?: string }
    if (!res.ok || !data.role || !data.token) return { error: data.error ?? 'Password ไม่ถูกต้อง' }
    await setSession({ ...session, role: data.role as 'staff' | 'manager' | 'owner', token: data.token })
  } catch {
    return { error: 'ไม่สามารถเชื่อมต่อ Backend ได้' }
  }
  redirect(`/${session.shopCode}`)
}


export async function logoutAction(): Promise<void> {
  await clearSession()
  redirect('/')
}
