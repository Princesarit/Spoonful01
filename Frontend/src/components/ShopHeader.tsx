'use client'

import { useActionState, useEffect, useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { logoutAction, demoteAction } from '@/app/actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'
import { getClosedDates, addClosedDate, removeClosedDate, verifyOwnerPassword } from '@/app/[shopCode]/closed-dates/actions'
import { changeOwnerPasswordAction } from '@/app/shop-actions'
import type { ClosedDate, ClosedMeal } from '@/lib/types'

// ─── Shared icons ────────────────────────────────────────────────────────────

function GearIconSvg() {
  return (
    <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PwInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  const cls = 'w-full border border-white/30 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60 pr-10'
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} className={cls} />
      <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer">
        {show ? '👁' : '🙈'}
      </button>
    </div>
  )
}

type SettingsView = 'menu' | 'close-shop' | 'change-password' | 'manual'

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
  const tr = translations[lang]
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

  const logoutLabel = tr.logout
  const isElevated = role === 'owner' || role === 'manager'

  // ── Settings modal state ──────────────────────────────────────────────────────
  type SettingsView = 'menu' | 'close-shop' | 'change-password' | 'manual'
  const [showSettings, setShowSettings] = useState(false)
  const [settingsView, setSettingsView] = useState<SettingsView>('menu')
  // Close Shop sub-state
  const [closeStep, setCloseStep] = useState<'password' | 'form'>('password')
  const [closePwd, setClosePwd] = useState('')
  const [closePwdErr, setClosePwdErr] = useState('')
  const [closePwdLoading, setClosePwdLoading] = useState(false)
  const [closeDate, setCloseDate] = useState(new Date().toISOString().split('T')[0])
  const [closeMeal, setCloseMeal] = useState<ClosedMeal>('both')
  const [closeNote, setCloseNote] = useState('')
  const [closeSaving, setCloseSaving] = useState(false)
  const [closedList, setClosedList] = useState<ClosedDate[]>([])
  const [closedLoading, setClosedLoading] = useState(false)
  // Change password sub-state
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [, startPwTransition] = useTransition()

  const loadClosed = useCallback(async () => {
    if (!shopCode) return
    setClosedLoading(true)
    const list = await getClosedDates(shopCode)
    setClosedList(list)
    setClosedLoading(false)
  }, [shopCode])

  useEffect(() => {
    if (showSettings && settingsView === 'close-shop' && closeStep === 'form') loadClosed()
  }, [showSettings, settingsView, closeStep, loadClosed])

  async function handleVerifyPwd() {
    setClosePwdLoading(true)
    setClosePwdErr('')
    const ok = await verifyOwnerPassword(closePwd)
    setClosePwdLoading(false)
    if (ok) {
      setCloseStep('form')
      setClosePwd('')
    } else {
      setClosePwdErr(lang === 'th' ? 'รหัสผ่านไม่ถูกต้อง' : 'Incorrect password')
    }
  }

  async function handleCloseShop() {
    if (!shopCode) return
    setCloseSaving(true)
    const result = await addClosedDate(shopCode, { date: closeDate, meal: closeMeal, note: closeNote, closedBy: 'owner' })
    setCloseSaving(false)
    if (result.ok) {
      setCloseNote('')
      await loadClosed()
    }
  }

  async function handleReopen(date: string, meal: ClosedMeal) {
    if (!shopCode) return
    await removeClosedDate(shopCode, date, meal)
    await loadClosed()
  }

  function handleSubmitPwChange(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (!curPw.trim()) { setPwError('กรุณากรอกรหัสผ่านเดิม'); return }
    if (newPw.length < 4) { setPwError('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัว'); return }
    if (newPw !== confirmPw) { setPwError('รหัสผ่านใหม่ไม่ตรงกัน'); return }
    startPwTransition(async () => {
      const res = await changeOwnerPasswordAction(curPw, newPw)
      if ('error' in res) { setPwError(res.error); return }
      setPwSuccess(true)
      setCurPw(''); setNewPw(''); setConfirmPw('')
    })
  }

  function goBack() {
    setSettingsView('menu')
    setPwError(''); setPwSuccess(false)
    setCloseStep('password'); setClosePwd(''); setClosePwdErr('')
  }

  function handleOpenSettings() {
    setShowSettings(true)
    setSettingsView('menu')
    setCloseStep('password')
    setClosePwd('')
    setClosePwdErr('')
  }

  // Header background — purple-to-brown gradient in dark mode
  const headerBg = isDark
    ? 'linear-gradient(135deg, #3D2858 0%, #7A5840 100%)'
    : '#EDE3D0'

  // Text colors inside header adapt to bg
  const hdrPrimary = isDark ? '#F0E8DA' : '#2E2820'
  const hdrSecond  = isDark ? '#C8B0D8' : '#A89684'
  const hdrFaint   = isDark ? '#D8C8E8' : '#8B7A6A'

  return (
    <>
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
            type="button"
            onClick={toggleDark}
            title={isDark ? tr.switch_to_light_mode : tr.switch_to_dark_mode}
            aria-label={isDark ? tr.switch_to_light_mode : tr.switch_to_dark_mode}
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
            type="button"
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

          {/* Settings gear — owner only */}
          {role === 'owner' && (
            <button
              type="button"
              onClick={handleOpenSettings}
              title={lang === 'th' ? 'ตั้งค่า' : 'Settings'}
              className="text-base cursor-pointer transition-opacity hover:opacity-70 leading-none"
              style={{ color: hdrFaint }}
            >
              ⚙
            </button>
          )}

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

    {/* ── Settings Modal ──────────────────────────────────────────────────── */}
    {showSettings && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
        <div className={`bg-stone-900/90 border border-white/10 rounded-2xl w-full p-6 space-y-4 ${settingsView === 'manual' ? 'max-w-[95vw] h-[95vh] flex flex-col' : 'max-w-sm'}`} onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {settingsView !== 'menu' && (
                <button type="button" onClick={goBack} className="text-white/40 hover:text-white text-sm cursor-pointer mr-1">←</button>
              )}
              <GearIconSvg />
              <h3 className="font-bold text-white tracking-widest text-sm">Settings</h3>
            </div>
            <button type="button" onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white text-lg leading-none cursor-pointer">×</button>
          </div>

          {/* ── Menu ── */}
          {settingsView === 'menu' && (
            <div className="space-y-2 pt-1">
              <button type="button" onClick={() => setSettingsView('change-password')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
                <span className="text-sm text-white">🔑 {lang === 'th' ? 'เปลี่ยนรหัสผ่าน Owner' : 'Change Owner Password'}</span>
                <span className="text-white/30 text-sm">›</span>
              </button>
              <button type="button" onClick={() => { setSettingsView('close-shop'); setCloseStep('password'); setClosePwd(''); setClosePwdErr('') }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
                <span className="text-sm text-white">🔒 {lang === 'th' ? 'ปิดร้าน' : 'Close Shop'}</span>
                <span className="text-white/30 text-sm">›</span>
              </button>
              <button type="button" onClick={() => setSettingsView('manual')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
                <span className="text-sm text-white">📖 {lang === 'th' ? 'คู่มือการใช้งาน' : 'User Manual'}</span>
                <span className="text-white/30 text-sm">›</span>
              </button>
            </div>
          )}

          {/* ── Change Password ── */}
          {settingsView === 'change-password' && (
            <>
              <p className="text-xs text-white/50 font-semibold tracking-wider -mt-1">
                {lang === 'th' ? 'เปลี่ยนรหัสผ่าน Owner' : 'Change Owner Password'}
              </p>
              {pwSuccess ? (
                <div className="text-center space-y-3 py-2">
                  <p className="text-green-400 text-sm font-semibold">{lang === 'th' ? 'เปลี่ยนรหัสผ่านสำเร็จ ✓' : 'Password changed ✓'}</p>
                  <button type="button" onClick={() => setShowSettings(false)} className="w-full py-2 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80">
                    {lang === 'th' ? 'ปิด' : 'Close'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitPwChange} className="space-y-3">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">{lang === 'th' ? 'รหัสผ่านเดิม' : 'Current password'}</label>
                    <PwInput autoFocus value={curPw} onChange={setCurPw} placeholder="Current password" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">{lang === 'th' ? 'รหัสผ่านใหม่' : 'New password'}</label>
                    <PwInput value={newPw} onChange={setNewPw} placeholder="New password" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">{lang === 'th' ? 'ยืนยันรหัสผ่านใหม่' : 'Confirm new password'}</label>
                    <PwInput value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />
                  </div>
                  {pwError && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{pwError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={goBack} className="flex-1 py-2.5 border border-white/20 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-white/10">
                      {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </button>
                    <button type="submit" className="flex-1 py-2.5 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 disabled:opacity-50">
                      {lang === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change Password'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ── Close Shop ── */}
          {settingsView === 'close-shop' && (
            <div className="max-h-[65vh] overflow-y-auto space-y-4">
              <p className="text-xs text-white/50 font-semibold tracking-wider -mt-1">
                {lang === 'th' ? 'ปิดร้าน' : 'Close Shop'}
              </p>
              {closeStep === 'password' ? (
                <div className="space-y-3">
                  <p className="text-sm text-white/60">
                    {lang === 'th' ? 'ยืนยันรหัสผ่าน Owner เพื่อเข้าสู่การตั้งค่าปิดร้าน' : 'Enter your Owner password to manage closed dates.'}
                  </p>
                  <PwInput autoFocus value={closePwd} onChange={setClosePwd} placeholder={lang === 'th' ? 'รหัสผ่าน Owner' : 'Owner password'} />
                  {closePwdErr && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{closePwdErr}</p>}
                  <button type="button" onClick={handleVerifyPwd} disabled={closePwdLoading || !closePwd}
                    className="w-full py-2.5 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 disabled:opacity-50">
                    {closePwdLoading ? '...' : (lang === 'th' ? 'ยืนยัน' : 'Confirm')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Add form */}
                  <div className="space-y-3 border border-white/10 bg-white/5 rounded-xl p-3">
                    <p className="text-xs font-semibold text-white/70">{lang === 'th' ? 'เพิ่มวันปิดร้าน' : 'Add Closed Date'}</p>
                    <div>
                      <label className="text-xs text-white/40">{lang === 'th' ? 'วันที่' : 'Date'}</label>
                      <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)}
                        title={lang === 'th' ? 'วันที่ปิดร้าน' : 'Close date'}
                        className="w-full border border-white/20 bg-white/10 rounded-lg px-2 py-1.5 text-sm mt-0.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
                    </div>
                    <div>
                      <label className="text-xs text-white/40">{lang === 'th' ? 'มื้อ' : 'Meal'}</label>
                      <div className="flex gap-2 mt-0.5">
                        {(['lunch', 'dinner', 'both'] as ClosedMeal[]).map((m) => (
                          <button key={m} type="button" onClick={() => setCloseMeal(m)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${closeMeal === m ? 'bg-amber-700/80 text-white border-amber-600' : 'bg-white/5 text-white/60 border-white/20 hover:border-amber-500'}`}>
                            {m === 'lunch' ? (lang === 'th' ? 'กลางวัน' : 'Lunch') : m === 'dinner' ? (lang === 'th' ? 'เย็น' : 'Dinner') : (lang === 'th' ? 'ทั้งวัน' : 'Both')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-white/40">{lang === 'th' ? 'หมายเหตุ (ไม่บังคับ)' : 'Note (optional)'}</label>
                      <input type="text" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={50}
                        placeholder={lang === 'th' ? 'เช่น วันหยุดสาธารณะ' : 'e.g. Public holiday'}
                        className="w-full border border-white/20 bg-white/10 rounded-lg px-2 py-1.5 text-sm mt-0.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
                    </div>
                    <button type="button" onClick={handleCloseShop} disabled={closeSaving || !closeDate}
                      className="w-full py-2 bg-red-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-red-600/80 disabled:opacity-50">
                      {closeSaving ? '...' : (lang === 'th' ? '🔒 ปิดร้าน' : '🔒 Close Shop')}
                    </button>
                  </div>
                  {/* Closed date list */}
                  <div>
                    <p className="text-xs text-white/40 font-semibold mb-2">{lang === 'th' ? 'วันที่ปิดร้าน' : 'Closed Dates'}</p>
                    {closedLoading ? (
                      <p className="text-xs text-white/30 text-center py-3">...</p>
                    ) : closedList.length === 0 ? (
                      <p className="text-xs text-white/30 text-center py-3">{lang === 'th' ? 'ไม่มีวันปิดร้าน' : 'No closed dates'}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {[...closedList].sort((a, b) => a.date.localeCompare(b.date)).map((d) => (
                          <div key={`${d.date}-${d.meal}`} className="flex items-center justify-between border border-white/10 bg-white/5 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-sm font-semibold text-red-300">{d.date}</span>
                              <span className="ml-2 text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded-full">{d.meal}</span>
                              {d.note && <span className="ml-1 text-xs text-white/30">— {d.note}</span>}
                            </div>
                            <button type="button" onClick={() => handleReopen(d.date, d.meal)}
                              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer ml-2 font-semibold">
                              {lang === 'th' ? 'เปิด' : 'Reopen'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Manual ── */}
          {settingsView === 'manual' && (
            <iframe
              src="/manual.html"
              title={lang === 'th' ? 'คู่มือการใช้งาน' : 'User Manual'}
              className="w-full flex-1 rounded-xl border border-white/10 bg-white"
            />
          )}

        </div>
      </div>
    )}
    </>
  )
}
