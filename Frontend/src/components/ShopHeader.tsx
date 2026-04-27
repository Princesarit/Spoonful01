'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { logoutAction, demoteAction } from '@/app/actions'
import { useShop } from '@/components/ShopProvider'

function useLoginDuration(loginAt: number) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(Date.now() - loginAt)
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
  const { lang, toggleLang, isDark, toggleDark } = useShop()
  const params = useParams()
  const shopCode = params?.shopCode as string | undefined
  const pathname = usePathname()
  const isHome = shopCode ? pathname === `/${shopCode}` : true
  const backHref = isHome ? '/' : `/${shopCode}`

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
    ? '👑 Owner'
    : role === 'manager'
    ? '🔑 Manager'
    : (lang === 'th' ? '👤 พนักงาน' : '👤 Staff')

  const roleBg = role === 'owner'
    ? 'bg-amber-500 dark:bg-amber-900/60 text-white dark:text-amber-200'
    : role === 'manager'
    ? 'bg-red-500 dark:bg-red-900/60 text-white dark:text-red-200'
    : 'bg-blue-500 dark:bg-blue-900/60 text-white dark:text-blue-200'

  const logoutLabel = lang === 'th' ? 'ออกจากระบบ' : 'Logout'
  const isElevated = role === 'owner' || role === 'manager'

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-base leading-none font-light"
          >
            ←
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">{shopName}</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
            ⏱ {duration}
          </span>

          {/* Dark / Light mode toggle */}
          <button
            onClick={toggleDark}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              position: 'relative',
              width: 52,
              height: 28,
              borderRadius: 999,
              cursor: 'pointer',
              border: 'none',
              padding: 0,
              flexShrink: 0,
              background: isDark
                ? 'linear-gradient(135deg, #1A1612 0%, #241F19 60%, #2D2720 100%)'
                : 'linear-gradient(135deg, #38bdf8 0%, #7dd3fc 55%, #bae6fd 100%)',
              boxShadow: isDark
                ? 'inset 0 1px 3px rgba(0,0,0,0.5)'
                : 'inset 0 1px 3px rgba(0,0,0,0.15)',
              transition: 'background 0.4s ease',
              overflow: 'hidden',
            }}
          >
            {/* Stars — visible in dark mode */}
            {[
              { left: 8,  top: 5,  size: 2 },
              { left: 16, top: 13, size: 1.5 },
              { left: 6,  top: 16, size: 1.5 },
              { left: 20, top: 7,  size: 1 },
            ].map((s, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: s.left,
                  top: s.top,
                  width: s.size,
                  height: s.size,
                  borderRadius: '50%',
                  background: 'white',
                  opacity: isDark ? 0.85 : 0,
                  transition: 'opacity 0.3s ease',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Cloud — visible in light mode */}
            <svg
              viewBox="0 0 24 12"
              style={{
                position: 'absolute',
                right: 4,
                bottom: 2,
                width: 22,
                height: 11,
                opacity: isDark ? 0 : 0.9,
                transition: 'opacity 0.3s ease',
                pointerEvents: 'none',
              }}
            >
              <ellipse cx="10" cy="9" rx="9" ry="4" fill="white" />
              <ellipse cx="8"  cy="7" rx="5" ry="4" fill="white" />
              <ellipse cx="14" cy="7" rx="4" ry="3" fill="white" />
            </svg>

            {/* Knob — sun (light) or moon (dark) */}
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: isDark ? 27 : 3,
                width: 22,
                height: 22,
                borderRadius: '50%',
                transition: 'left 0.4s cubic-bezier(.45,1.4,.6,1)',
                background: isDark
                  ? 'radial-gradient(circle at 42% 38%, #d1d5db, #9ca3af 55%, #6b7280)'
                  : 'radial-gradient(circle at 38% 35%, #fef9c3, #facc15 55%, #ca8a04)',
                boxShadow: isDark
                  ? '0 2px 6px rgba(0,0,0,0.5)'
                  : '0 0 10px rgba(250,204,21,0.7), 0 2px 5px rgba(0,0,0,0.2)',
                pointerEvents: 'none',
              }}
            >
              {/* Moon craters */}
              {isDark && (<>
                <span style={{ position:'absolute', left:4,  top:4,  width:4, height:4, borderRadius:'50%', background:'#6b7280', opacity:0.45 }} />
                <span style={{ position:'absolute', left:11, top:10, width:3, height:3, borderRadius:'50%', background:'#6b7280', opacity:0.35 }} />
                <span style={{ position:'absolute', left:4,  top:13, width:2.5, height:2.5, borderRadius:'50%', background:'#6b7280', opacity:0.4 }} />
              </>)}
            </span>
          </button>

          <button
            onClick={toggleLang}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors cursor-pointer font-medium"
          >
            {lang.toUpperCase()}
          </button>

          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${roleBg}`}>
            {roleLabel}
          </span>

          {isElevated ? (
            <form action={demoteAction}>
              <button
                type="submit"
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors cursor-pointer"
              >
                {logoutLabel}
              </button>
            </form>
          ) : (
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {logoutLabel}
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  )
}
