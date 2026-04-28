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

  // Position badge colors — from design palette
  const roleBgStyle = role === 'owner'
    ? { background: isDark ? '#4A3870' : '#3D3828', color: isDark ? '#D8C8F0' : '#F0E8DA' }
    : role === 'manager'
    ? { background: isDark ? '#6A3868' : '#CC8070', color: isDark ? '#F0B0E0' : '#FFFFFF' }
    : { background: isDark ? '#3A3870' : '#A89080', color: isDark ? '#C0B8E8' : '#FFFFFF' }

  const logoutLabel = lang === 'th' ? 'ออกจากระบบ' : 'Logout'
  const isElevated = role === 'owner' || role === 'manager'

  // Header background — purple-to-brown gradient in dark mode
  const headerBg = isDark
    ? 'linear-gradient(135deg, #3D2858 0%, #7A5840 100%)'
    : '#EDE3D0'

  // Text colors inside header adapt to bg
  const hdrPrimary = isDark ? '#F0E8DA' : '#2E2820'
  const hdrSecond  = isDark ? '#C8B0D8' : '#A89684'
  const hdrFaint   = isDark ? '#D8C8E8' : '#8B7A6A'

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: headerBg, borderColor: isDark ? '#2E1E40' : '#DDD0BC' }}
    >
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="text-base leading-none font-light transition-opacity hover:opacity-70"
            style={{ color: hdrSecond }}
          >
            ←
          </Link>
          <div>
            <h1 className="text-base font-bold leading-tight" style={{ color: hdrPrimary }}>{shopName}</h1>
            <p className="text-xs leading-tight" style={{ color: hdrSecond }}>{today}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Timer */}
          <span
            className="text-xs font-mono px-2.5 py-1 rounded-full"
            style={{
              background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.08)',
              color: hdrPrimary,
            }}
          >
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
                  left: s.left, top: s.top,
                  width: s.size, height: s.size,
                  borderRadius: '50%',
                  background: 'white',
                  opacity: isDark ? 0.85 : 0,
                  transition: 'opacity 0.3s ease',
                  pointerEvents: 'none',
                }}
              />
            ))}
            <svg
              viewBox="0 0 24 12"
              style={{
                position: 'absolute', right: 4, bottom: 2,
                width: 22, height: 11,
                opacity: isDark ? 0 : 0.9,
                transition: 'opacity 0.3s ease',
                pointerEvents: 'none',
              }}
            >
              <ellipse cx="10" cy="9" rx="9" ry="4" fill="white" />
              <ellipse cx="8"  cy="7" rx="5" ry="4" fill="white" />
              <ellipse cx="14" cy="7" rx="4" ry="3" fill="white" />
            </svg>
            <span
              style={{
                position: 'absolute', top: 3,
                left: isDark ? 27 : 3,
                width: 22, height: 22,
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
              {isDark && (<>
                <span style={{ position:'absolute', left:4,  top:4,  width:4, height:4, borderRadius:'50%', background:'#6b7280', opacity:0.45 }} />
                <span style={{ position:'absolute', left:11, top:10, width:3, height:3, borderRadius:'50%', background:'#6b7280', opacity:0.35 }} />
                <span style={{ position:'absolute', left:4,  top:13, width:2.5, height:2.5, borderRadius:'50%', background:'#6b7280', opacity:0.4 }} />
              </>)}
            </span>
          </button>

          {/* Language */}
          <button
            onClick={toggleLang}
            className="text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer transition-opacity hover:opacity-70"
            style={{
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.25)' : '#DDD0BC'}`,
              color: hdrPrimary,
            }}
          >
            {lang.toUpperCase()}
          </button>

          {/* Role badge */}
          <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={roleBgStyle}>
            {roleLabel}
          </span>

          {/* Logout / Demote */}
          {isElevated ? (
            <form action={demoteAction}>
              <button
                type="submit"
                className="text-xs cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: hdrFaint }}
              >
                {logoutLabel}
              </button>
            </form>
          ) : (
            <form action={formAction}>
              <button
                type="submit"
                disabled={pending}
                className="text-xs cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ color: hdrFaint }}
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
