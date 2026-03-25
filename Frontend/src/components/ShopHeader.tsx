'use client'

import { useActionState, useEffect, useState } from 'react'
import { logoutAction } from '@/app/actions'

function useLoginDuration(loginAt: number) {
  const [elapsed, setElapsed] = useState(Date.now() - loginAt)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - loginAt), 1000)
    return () => clearInterval(id)
  }, [loginAt])
  const h = Math.floor(elapsed / 3600000)
  const m = Math.floor((elapsed % 3600000) / 60000)
  const s = Math.floor((elapsed % 60000) / 1000)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ShopHeader({ shopName, role, loginAt }: { shopName: string; role: string; loginAt: number }) {
  const today = new Date().toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const duration = useLoginDuration(loginAt)

  const [, formAction, pending] = useActionState(async () => {
    await logoutAction()
  }, null)

  return (
    <header className="bg-brand-green border-b border-brand-green sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">{shopName}</h1>
          <p className="text-xs text-brand-accent">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60 font-mono">Timer : {duration}</span>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              role === 'owner'
                ? 'bg-brand-gold text-white'
                : 'bg-white/10 text-white'
            }`}
          >
            {role === 'owner' ? '👑 Manager' : '👤 Staff'}
          </span>
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="text-xs text-brand-accent hover:text-white px-2 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
