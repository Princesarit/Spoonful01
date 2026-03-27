'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { logoutAction } from '@/app/actions'
import { useShop } from './ShopProvider'

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
  const { lang, toggleLang } = useShop()

  const today = new Date().toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const duration = useLoginDuration(loginAt)

  const [, formAction, pending] = useActionState(async () => {
    await logoutAction()
  }, null)

  const roleLabel = role === 'owner'
    ? (lang === 'th' ? '👑 Owner' : '👑 Owner')
    : role === 'manager'
    ? (lang === 'th' ? '👑 ผู้จัดการ' : '👑 Manager')
    : (lang === 'th' ? '👤 พนักงาน' : '👤 Staff')

  const roleBg = role === 'owner'
    ? 'bg-red-500 text-white'
    : role === 'manager'
    ? 'bg-amber-500 text-white'
    : 'bg-blue-500 text-white'

  const logoutLabel = lang === 'th' ? 'ออกจากระบบ' : 'Logout'

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-gray-400 hover:text-gray-600 text-base leading-none font-light"
          >
            ←
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">{shopName}</h1>
            <p className="text-xs text-gray-400 leading-tight">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2.5 py-1 rounded-full">
            ⏱ {duration}
          </span>

          <button
            onClick={toggleLang}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors cursor-pointer font-medium"
          >
            {lang.toUpperCase()}
          </button>

          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${roleBg}`}>
            {roleLabel}
          </span>

          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {logoutLabel}
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
