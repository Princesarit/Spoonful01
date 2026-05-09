'use client'

import { useState, useActionState, useTransition, useEffect, useRef } from 'react'
import Image from 'next/image'
import { loginAction } from './actions'
import {
  getStoredShopsAction,
  addShopAction,
  updateShopAction,
  deleteShopAction,
  changeOwnerPasswordAction,
  getDueExpensesAction,
  getMasterClosedDates,
  addMasterClosedDate,
  removeMasterClosedDate,
  getPublicShopsAction,
  verifyOwnerPasswordMaster,
} from './shop-actions'
import type { DueExpenseShop } from './shop-actions'
import type { ShopConfig } from '@/lib/config'
import type { StoredShop, ClosedDate, ClosedMeal } from '@/lib/types'

// ─── Gear Icon ─────────────────────────────────────────────────────────────

function GearIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// ─── Bell Icon ─────────────────────────────────────────────────────────────

function BellIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a1 1 0 0 1 1 1v.27A7 7 0 0 1 19 10v4l1.71 2.56A1 1 0 0 1 19.86 18H4.14a1 1 0 0 1-.85-1.44L5 14v-4a7 7 0 0 1 6-6.73V3a1 1 0 0 1 1-1zm0 20a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z" />
    </svg>
  )
}

// ─── Notification Dropdown ─────────────────────────────────────────────────

const METHOD_ICON: Record<string, string> = {
  Cash: '💵',
  'Credit Card': '💳',
  'Online Banking': '🏦',
}

function NotificationDropdown({ data, onClose }: { data: DueExpenseShop[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const totalCount = data.reduce((s, d) => s + d.expenses.length, 0)

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 w-80 bg-stone-900/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BellIcon className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white tracking-wide">Notifications</span>
          {totalCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{totalCount}</span>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none cursor-pointer">×</button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {totalCount === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xl mb-2">✅</p>
            <p className="text-xs text-white/50">There are no items due for payment today.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {data.map((shop) => (
              <div key={shop.shopCode} className="px-4 py-3 space-y-2">
                <p className="text-[11px] font-bold text-amber-400 tracking-widest uppercase">{shop.shopName}</p>
                {shop.expenses.map((exp) => (
                  <div key={exp.id} className="bg-red-950/50 border border-red-500/20 rounded-xl px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="leading-tight">
                        <span className="text-sm text-white font-semibold">{exp.supplier}</span>
                        {exp.paymentMethod && (
                          <span className="text-xs text-white/50 ml-1.5">({exp.paymentMethod})</span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-red-300 shrink-0">${exp.total.toFixed(2)}</span>
                    </div>
                    {exp.description && <p className="text-[11px] text-white/40 mt-1">{exp.description}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Eye Icons ─────────────────────────────────────────────────────────────

function EyeOpen({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="10" ry="6.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function EyeOff({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="10" ry="6.5" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

// ─── Password Input with show/hide toggle ──────────────────────────────────

function PasswordInput({
  value, onChange, placeholder, className, autoFocus, name, required, keyVal,
}: {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  name?: string
  required?: boolean
  keyVal?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        key={keyVal}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        name={name}
        required={required}
        className={(className ?? '') + ' pr-10'}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-black/60 hover:text-black cursor-pointer"
        tabIndex={-1}
      >
        {show ? <EyeOpen /> : <EyeOff />}
      </button>
    </div>
  )
}

// ─── Settings Modal ────────────────────────────────────────────────────────

type SettingsView = 'menu' | 'change-password' | 'close-shop' | 'manual'

// ─── Close Shop Calendar ───────────────────────────────────────────────────

const CAL_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function CloseShopCalendar({
  selected,
  onSelect,
  closedList,
}: {
  selected: string
  onSelect: (date: string) => void
  closedList: ClosedDate[]
}) {
  const init = new Date(selected + 'T12:00:00')
  const [year, setYear]   = useState(init.getFullYear())
  const [month, setMonth] = useState(init.getMonth())

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const monthLabel  = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today       = new Date().toISOString().split('T')[0]
  const closedMap   = new Map(closedList.map((d) => [d.date, d]))

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function toStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function prevMonth() { if (month === 0) { setYear((y) => y - 1); setMonth(11) } else setMonth((m) => m - 1) }
  function nextMonth() { if (month === 11) { setYear((y) => y + 1); setMonth(0) } else setMonth((m) => m + 1) }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5">
        <button type="button" onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-amber-400 cursor-pointer text-sm transition-colors">◀</button>
        <span className="text-xs font-bold text-amber-400">{monthLabel}</span>
        <button type="button" onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-amber-400 cursor-pointer text-sm transition-colors">▶</button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/5">
        {CAL_DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-white/30 py-1">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="aspect-square border-[0.5px] border-white/5" />
          const dateStr  = toStr(day)
          const closed   = closedMap.get(dateStr)
          const isSelect = selected === dateStr
          const isToday  = dateStr === today
          return (
            <button key={idx} type="button" onClick={() => onSelect(dateStr)}
              className={`aspect-square flex flex-col items-center justify-center text-[11px] font-medium cursor-pointer transition-colors border-[0.5px] border-white/5 ${
                isSelect ? 'bg-amber-600/70 ring-1 ring-inset ring-amber-400' :
                closed   ? 'bg-red-900/50 hover:bg-red-900/70' :
                           'hover:bg-white/10'
              }`}
            >
              <span className={
                isSelect ? 'text-white font-bold' :
                closed   ? 'text-red-300 font-semibold' :
                isToday  ? 'text-amber-400 font-bold' :
                           'text-white/70'
              }>
                {day}
              </span>
              {closed && (
                <span className="text-[7px] font-bold text-red-400 leading-none mt-0.5">
                  {closed.meal === 'lunch' ? 'L' : closed.meal === 'dinner' ? 'D' : '✕'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SettingsView>('menu')
  // Change Password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [isPending, startTransition] = useTransition()
  // Close Shop
  const [closeStep, setCloseStep] = useState<'password' | 'form'>('password')
  const [closePwd, setClosePwd]   = useState('')
  const [closePwdErr, setClosePwdErr] = useState('')
  const [closePwdLoading, setClosePwdLoading] = useState(false)
  const [shops, setShops]         = useState<{ code: string; name: string }[]>([])
  const [selectedShop, setSelectedShop] = useState('')
  const [closeDate, setCloseDate] = useState(new Date().toISOString().split('T')[0])
  const [closeMeal, setCloseMeal] = useState<ClosedMeal>('both')
  const [closeNote, setCloseNote] = useState('')
  const [closeSaving, setCloseSaving] = useState(false)
  const [closedList, setClosedList] = useState<ClosedDate[]>([])
  const [closedLoading, setClosedLoading] = useState(false)

  const inputCls = 'w-full border border-white/30 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60'

  useEffect(() => {
    if (view === 'close-shop' && shops.length === 0) {
      getPublicShopsAction().then((s) => { setShops(s); if (s.length > 0) setSelectedShop(s[0].code) })
    }
  }, [view, shops.length])

  async function loadClosedDates(shop: string, pwd: string) {
    setClosedLoading(true)
    const list = await getMasterClosedDates(pwd, shop)
    setClosedList(list)
    setClosedLoading(false)
  }

  async function handleVerifyClosePwd() {
    setClosePwdLoading(true)
    setClosePwdErr('')
    const ok = await verifyOwnerPasswordMaster(closePwd)
    if (ok) {
      const list = await getMasterClosedDates(closePwd, selectedShop)
      setClosedList(list)
      setCloseStep('form')
    } else {
      setClosePwdErr('รหัสผ่านไม่ถูกต้อง')
    }
    setClosePwdLoading(false)
  }

  async function handleCloseShop() {
    setCloseSaving(true)
    const res = await addMasterClosedDate(closePwd, selectedShop, { date: closeDate, meal: closeMeal, note: closeNote })
    setCloseSaving(false)
    if (res.ok) {
      setCloseNote('')
      await loadClosedDates(selectedShop, closePwd)
    }
  }

  async function handleReopen(date: string, meal: ClosedMeal) {
    await removeMasterClosedDate(closePwd, selectedShop, date, meal)
    await loadClosedDates(selectedShop, closePwd)
  }

  function goBack() {
    setView('menu')
    setError(''); setSuccess(false)
    setCloseStep('password'); setClosePwd(''); setClosePwdErr('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!currentPw.trim()) { setError('กรุณากรอกรหัสผ่านเดิม'); return }
    if (newPw.length < 4)  { setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัว'); return }
    if (newPw !== confirmPw) { setError('รหัสผ่านใหม่ไม่ตรงกัน'); return }
    startTransition(async () => {
      const res = await changeOwnerPasswordAction(currentPw, newPw)
      if ('error' in res) { setError(res.error); return }
      setSuccess(true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-stone-900/90 border border-white/10 rounded-2xl w-full p-6 space-y-4 ${view === 'manual' ? 'max-w-[95vw] h-[95vh] flex flex-col' : 'max-w-md'}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {view !== 'menu' && (
              <button type="button" onClick={goBack} className="text-white/40 hover:text-white text-sm cursor-pointer mr-1">←</button>
            )}
            <GearIcon className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white tracking-widest text-sm">Settings</h3>
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none cursor-pointer">×</button>
        </div>

        {/* Menu */}
        {view === 'menu' && (
          <div className="space-y-2 pt-1">
            <button type="button" onClick={() => setView('change-password')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
              <span className="text-sm text-white">🔑 Change Owner Password</span>
              <span className="text-white/30 text-sm">›</span>
            </button>
            <button type="button" onClick={() => { setView('close-shop'); setCloseStep('password'); setClosePwd(''); setClosePwdErr('') }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
              <span className="text-sm text-white">🔒 Close Shop</span>
              <span className="text-white/30 text-sm">›</span>
            </button>
            <button type="button" onClick={() => setView('manual')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-left">
              <span className="text-sm text-white">📖 User Manual</span>
              <span className="text-white/30 text-sm">›</span>
            </button>
          </div>
        )}

        {/* Change Password */}
        {view === 'change-password' && (
          <>
            <p className="text-xs text-white/50 font-semibold tracking-wider -mt-1">Change Owner Password</p>
            {success ? (
              <div className="text-center space-y-3 py-2">
                <p className="text-green-400 text-sm font-semibold">เปลี่ยนรหัสผ่านสำเร็จ ✓</p>
                <button type="button" onClick={onClose} className="w-full py-2 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80">ปิด</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">รหัสผ่านเดิม</label>
                  <PasswordInput autoFocus value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Current password" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">รหัสผ่านใหม่</label>
                  <PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">ยืนยันรหัสผ่านใหม่</label>
                  <PasswordInput value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" className={inputCls} />
                </div>
                {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={goBack} className="flex-1 py-2.5 border border-white/20 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
                  <button type="submit" disabled={isPending} className="flex-1 py-2.5 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 disabled:opacity-50">
                    {isPending ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Close Shop */}
        {view === 'close-shop' && (
          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            <p className="text-xs text-white/50 font-semibold tracking-wider -mt-1">Close Shop</p>
            {closeStep === 'password' ? (
              <div className="space-y-3">
                <p className="text-sm text-white/60">Enter Owner password to manage closed dates.</p>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Select Branch</label>
                  <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}
                    title="Select branch"
                    className="w-full border border-white/20 bg-stone-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/60">
                    {shops.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <PasswordInput autoFocus value={closePwd} onChange={(e) => setClosePwd(e.target.value)} placeholder="Owner password" className={inputCls} />
                {closePwdErr && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{closePwdErr}</p>}
                <button type="button" onClick={handleVerifyClosePwd} disabled={closePwdLoading || !closePwd || !selectedShop}
                  className="w-full py-2.5 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 disabled:opacity-50">
                  {closePwdLoading ? '...' : 'Confirm'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Shop label */}
                <p className="text-xs text-white/40">Branch: <span className="text-amber-400 font-semibold">{shops.find((s) => s.code === selectedShop)?.name ?? selectedShop}</span></p>
                {/* Add form */}
                <div className="border border-white/10 bg-white/5 rounded-xl p-3 space-y-3">
                  <p className="text-xs font-semibold text-white/70">Add Closed Date</p>
                  <div>
                    <label className="text-xs text-white/40 block mb-1.5">Date</label>
                    <CloseShopCalendar
                      selected={closeDate}
                      onSelect={setCloseDate}
                      closedList={closedList}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/40">Meal</label>
                    <div className="flex gap-2 mt-0.5">
                      {(['lunch', 'dinner', 'both'] as ClosedMeal[]).map((m) => (
                        <button key={m} type="button" onClick={() => setCloseMeal(m)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${closeMeal === m ? 'bg-amber-700/80 text-white border-amber-600' : 'bg-white/5 text-white/60 border-white/20 hover:border-amber-500'}`}>
                          {m === 'lunch' ? 'Lunch' : m === 'dinner' ? 'Dinner' : 'Both'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40">Note (optional)</label>
                    <input type="text" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={50}
                      placeholder="e.g. Public holiday"
                      className="w-full border border-white/20 bg-white/10 rounded-lg px-2 py-1.5 text-sm mt-0.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400/60" />
                  </div>
                  <button type="button" onClick={handleCloseShop} disabled={closeSaving || !closeDate}
                    className="w-full py-2 bg-red-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-red-600/80 disabled:opacity-50">
                    {closeSaving ? '...' : '🔒 Close Shop'}
                  </button>
                </div>
                {/* Closed dates list */}
                <div>
                  <p className="text-xs text-white/40 font-semibold mb-2">Closed Dates</p>
                  {closedLoading ? (
                    <p className="text-xs text-white/30 text-center py-3">...</p>
                  ) : closedList.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-3">No closed dates</p>
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
                            Reopen
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

        {/* Manual */}
        {view === 'manual' && (
          <iframe
            src="/manual.html"
            title="User Manual"
            className="w-full flex-1 rounded-xl border border-white/10 bg-white"
          />
        )}

      </div>
    </div>
  )
}

// ─── Branch Manager Modal ──────────────────────────────────────────────────

type ManagerStep = 'auth' | 'list'

function emptyForm(code = ''): StoredShop {
  return { code, name: '', restaurantPassword: '', managerPassword: '', ownerPassword: '' }
}

function BranchManagerModal({
  onClose,
  onShopsChanged,
}: {
  onClose: () => void
  onShopsChanged: () => void
}) {
  const [step, setStep] = useState<ManagerStep>('auth')
  const [masterPassword, setMasterPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [shops, setShops] = useState<StoredShop[]>([])
  const [editing, setEditing] = useState<StoredShop | null>(null)
  const [adding, setAdding] = useState(false)
  const [showSheetHelp, setShowSheetHelp] = useState(false)
  const [newForm, setNewForm] = useState<StoredShop>(emptyForm())
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<{ code: string; name: string } | null>(null)
  const [confirmEdit, setConfirmEdit] = useState(false)

  async function handleAuth(e: React.SyntheticEvent) {
    e.preventDefault()
    setAuthError('')
    const result = await getStoredShopsAction(masterPassword)
    if (!result) { setAuthError('รหัสผ่านไม่ถูกต้อง'); return }
    setShops(result)
    setStep('list')
  }

  async function handleAdd() {
    setError('')
    if (!newForm.spreadsheetId?.trim()) {
      setError('โปรดดูคู่มือการสร้างสาขาใหม่')
      return
    }
    startTransition(async () => {
      const res = await addShopAction(masterPassword, newForm.name, newForm.restaurantPassword, newForm.managerPassword, newForm.spreadsheetId)
      if ('error' in res) { setError('โปรดดูคู่มือการสร้างสาขาใหม่'); return }
      const updated = await getStoredShopsAction(masterPassword)
      if (updated) setShops(updated)
      setAdding(false)
      setNewForm(emptyForm())
      onShopsChanged()
    })
  }

  async function handleUpdate() {
    if (!editing) return
    setConfirmEdit(true)
  }

  async function doUpdate() {
    if (!editing) return
    setConfirmEdit(false)
    setError('')
    startTransition(async () => {
      const res = await updateShopAction(masterPassword, editing.code, editing.name, editing.restaurantPassword, editing.managerPassword, editing.spreadsheetId)
      if ('error' in res) { setError(res.error); return }
      const updated = await getStoredShopsAction(masterPassword)
      if (updated) setShops(updated)
      setEditing(null)
      onShopsChanged()
    })
  }

  async function handleDelete(code: string, name: string) {
    setConfirmDelete({ code, name })
  }

  async function doDelete(code: string) {
    setConfirmDelete(null)
    setError('')
    startTransition(async () => {
      const res = await deleteShopAction(masterPassword, code)
      if ('error' in res) { setError(res.error); return }
      setShops((p) => p.filter((s) => s.code !== code))
      onShopsChanged()
    })
  }

  const inputCls = 'w-full border border-white/30 bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-900/90 border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4 my-auto">

        {step === 'auth' && (
          <>
            <h3 className="font-bold text-white tracking-widest text-sm">จัดการสาขา</h3>
            <p className="text-xs text-white/40">กรอก Owner Password เพื่อเข้าถึง</p>
            <form onSubmit={handleAuth} className="space-y-3">
              <PasswordInput
                autoFocus
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Owner Password"
                className={inputCls}
              />
              {authError && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{authError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-white/20 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-white/10 transition-colors">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 transition-colors">เข้าสู่ระบบ</button>
              </div>
            </form>
          </>
        )}

        {step === 'list' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white tracking-widest text-sm">จัดการสาขา</h3>
              <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none cursor-pointer">×</button>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shops.map((shop) => (
                <div key={shop.code}>
                  {editing?.code === shop.code ? (
                    <div className="border border-amber-700/40 rounded-xl p-3 space-y-2 bg-amber-900/20">
                      <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="ชื่อสาขา" maxLength={30} className={inputCls} />
                      <PasswordInput value={editing.restaurantPassword} onChange={(e) => setEditing({ ...editing, restaurantPassword: e.target.value })} placeholder="Restaurant Password" className={inputCls} />
                      <PasswordInput value={editing.managerPassword} onChange={(e) => setEditing({ ...editing, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                      <input required value={editing.spreadsheetId ?? ''} onChange={(e) => setEditing({ ...editing, spreadsheetId: e.target.value })} placeholder="Spreadsheet ID" className={inputCls} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
                        <button type="button" onClick={handleUpdate} disabled={isPending} className="flex-1 py-1.5 bg-amber-700/80 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">บันทึก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between border border-white/10 rounded-xl px-3 py-2.5 bg-white/5">
                      <div>
                        <div className="text-sm font-medium text-white">{shop.name}</div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => { setEditing({ ...shop }); setAdding(false) }}
                          className="rounded-md border border-blue-300/25 bg-blue-500/15 px-2 py-1 font-semibold text-blue-200 hover:bg-blue-500/25 hover:text-blue-100 cursor-pointer"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(shop.code, shop.name)}
                          disabled={isPending}
                          className="rounded-md border border-red-300/25 bg-red-500/15 px-2 py-1 font-semibold text-red-200 hover:bg-red-500/25 hover:text-red-100 disabled:opacity-50 cursor-pointer"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {adding ? (
              <div className="border border-amber-700/40 rounded-xl p-3 space-y-2 bg-amber-900/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-300">สาขาใหม่</p>
                  <button
                    type="button"
                    onClick={() => setShowSheetHelp(true)}
                    aria-label="วิธีสร้าง Google Sheet สำหรับสาขาใหม่"
                    className="grid h-6 w-6 place-items-center rounded-full border border-amber-300/60 bg-amber-300/10 text-[11px] font-bold text-amber-200 hover:bg-amber-300/20 cursor-pointer"
                  >
                    i
                  </button>
                </div>
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="ชื่อสาขา" maxLength={30} className={inputCls} />
                <PasswordInput value={newForm.restaurantPassword} onChange={(e) => setNewForm({ ...newForm, restaurantPassword: e.target.value })} placeholder="Restaurant Password" className={inputCls} />
                <PasswordInput value={newForm.managerPassword} onChange={(e) => setNewForm({ ...newForm, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                <input required value={newForm.spreadsheetId ?? ''} onChange={(e) => setNewForm({ ...newForm, spreadsheetId: e.target.value })} placeholder="Spreadsheet ID" className={inputCls} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setAdding(false); setNewForm(emptyForm()) }} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 cursor-pointer">ยกเลิก</button>
                  <button type="button" onClick={handleAdd} disabled={isPending} className="flex-1 py-1.5 bg-amber-700/80 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">เพิ่มสาขา</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setAdding(true); setEditing(null) }}
                className="w-full py-2 border-2 border-dashed border-white/20 text-white/50 text-sm rounded-xl hover:border-amber-500/50 hover:text-amber-400/70 transition-colors cursor-pointer"
              >
                + เพิ่มสาขา
              </button>
            )}

            {showSheetHelp && (
              <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
                <div className="w-full max-w-md rounded-2xl border border-white/15 bg-stone-950 p-5 text-left shadow-2xl">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">วิธีเตรียม Google Sheet ให้สาขาใหม่</h4>
                      <p className="mt-1 text-xs leading-5 text-white/55">ใช้เมื่อต้องการสร้าง Database ของสาขาใหม่</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSheetHelp(false)}
                      className="text-lg leading-none text-white/40 hover:text-white cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/4 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-stone-950">1</span>
                        <p className="text-xs font-semibold text-white">สร้าง Google Sheet ใหม่</p>
                      </div>
                      <div className="rounded-lg border border-emerald-400/30 bg-emerald-950/35 p-3">
                        <div className="mb-2 h-3 w-24 rounded bg-emerald-300/70" />
                        <div className="grid grid-cols-4 gap-1">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="h-4 rounded-sm bg-white/15" />
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/60">สร้าง Google Sheet โดยการกด New → ตั้งชื่อเช่น Spoonful - ชื่อสาขา</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/4 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-stone-950">2</span>
                        <p className="text-xs font-semibold text-white">แชร์ให้ระบบเป็น Editor</p>
                      </div>
                      <div className="rounded-lg border border-blue-400/30 bg-blue-950/35 p-3">
                        <div className="mb-2 h-3 w-16 rounded bg-blue-300/70" />
                        <div className="rounded-md bg-white/90 px-2 py-1.5 text-[10px] text-stone-700">sheet-backend@spoonful-491214.iam.gserviceaccount.com</div>
                        <div className="mt-2 ml-auto w-16 rounded-full bg-blue-500 px-2 py-1 text-center text-[10px] font-semibold text-white">Editor</div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/60">กด Share ในไฟล์ Sheet แล้วใส่อีเมลนี้ จากนั้นตั้งสิทธิ์เป็น Editor</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/4 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-stone-950">3</span>
                        <p className="text-xs font-semibold text-white">คัดลอก Spreadsheet ID มาใส่ช่องด้านล่าง</p>
                      </div>
                      <div className="rounded-lg border border-amber-400/30 bg-amber-950/35 p-3">
                        <p className="break-all rounded bg-stone-950/70 px-2 py-1.5 text-[10px] text-amber-100">docs.google.com/spreadsheets/d/<span className="text-amber-300">SPREADSHEET_ID</span>/edit</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/60">ดูตรง URL ของ Google Sheet ปัจจุบัน และเอาเฉพาะตัวอักษรยาวๆ ระหว่าง /d/ และ /edit ไปใส่ในช่อง Spreadsheet ID</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSheetHelp(false)}
                    className="mt-4 w-full rounded-xl bg-amber-700/80 py-2 text-xs font-semibold text-white hover:bg-amber-600/80 cursor-pointer"
                  >
                    เข้าใจแล้ว
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4">
          <div className="bg-stone-900 border border-white/15 rounded-2xl p-5 w-full max-w-xs space-y-4">
            <p className="text-sm text-white text-center">ยืนยันการลบสาขา <span className="font-bold text-red-300">&ldquo;{confirmDelete.name}&rdquo;</span> ?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="flex-1 py-2 border border-white/20 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
              <button type="button" onClick={() => doDelete(confirmDelete.code)} disabled={isPending} className="flex-1 py-2 bg-red-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-red-600/80 disabled:opacity-50">ยืนยันลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Edit Dialog */}
      {confirmEdit && editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4">
          <div className="bg-stone-900 border border-white/15 rounded-2xl p-5 w-full max-w-xs space-y-4">
            <p className="text-sm text-white text-center">ยืนยันการแก้ไขสาขา <span className="font-bold text-amber-300">&ldquo;{editing.name}&rdquo;</span> ?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmEdit(false)} className="flex-1 py-2 border border-white/20 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
              <button type="button" onClick={doUpdate} disabled={isPending} className="flex-1 py-2 bg-amber-700/80 text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-amber-600/80 disabled:opacity-50">ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Login Form ────────────────────────────────────────────────────────────

export default function LoginForm({ shops: initialShops }: { shops: ShopConfig[] }) {
  const [shops, setShops] = useState(initialShops)
  const [selectedShop, setSelectedShop] = useState<string | null>(null)
  const [state, action, pending] = useActionState(loginAction, null)
  const [showManager, setShowManager] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotification, setShowNotification] = useState(false)
  const [dueData, setDueData] = useState<DueExpenseShop[]>([])
  const [, startTransition] = useTransition()

  const dueCount = dueData.reduce((s, d) => s + d.expenses.length, 0)

  useEffect(() => {
    getDueExpensesAction().then((res) => setDueData(res ?? []))
  }, [])

  function refreshShops() {
    startTransition(async () => {
      const { getShopsAction } = await import('./shop-actions')
      const updated = await getShopsAction()
      setShops(updated)
      if (selectedShop && !updated.find((s) => s.code === selectedShop)) {
        setSelectedShop(null)
      }
    })
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden">

      {/* Top-right buttons */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Notification */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotification((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/20 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
          >
            <span className="relative">
              <BellIcon className="w-3.5 h-3.5" />
              {dueCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
                  {dueCount}
                </span>
              )}
            </span>
            Notification
          </button>
          {showNotification && (
            <NotificationDropdown data={dueData} onClose={() => setShowNotification(false)} />
          )}
        </div>
        {/* Setting */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/20 hover:text-white transition-colors cursor-pointer backdrop-blur-sm"
        >
          <GearIcon className="w-3.5 h-3.5" />
          Setting
        </button>
      </div>

      {/* Background image */}
      <Image
        src="/bg.png"
        alt="background"
        fill
        className="object-cover object-center"
        priority
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/55" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 w-full max-w-2xl">

        {/* Restaurant management system */}
        <h1 className="font-brand text-[clamp(1.2rem,2.8vw,1.8rem)] text-white tracking-[0.15em] leading-snug mb-8">
          <span className="block whitespace-nowrap">Restaurant</span>
          <span className="block whitespace-nowrap">management system</span>
        </h1>

        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/LOGO.png"
            alt="Spoonful Logo"
            width={150}
            height={150}
            className="rounded-full object-cover"
            priority
          />
        </div>

        {/* Please Select */}
        <p className="text-white text-lg tracking-[0.4em] mb-6 font-light">
          Please Select
        </p>

        {/* Shop buttons */}
        <div className="grid grid-cols-3 gap-4 w-full mb-6">
          {shops.map((shop) => (
            <button
              key={shop.code}
              type="button"
              onClick={() => setSelectedShop(selectedShop === shop.code ? null : shop.code)}
              className={`min-h-19 rounded-2xl p-5 text-center transition-all cursor-pointer border backdrop-blur-sm flex items-center justify-center ${
                selectedShop === shop.code
                  ? 'bg-amber-700/60 border-amber-400/60 shadow-lg shadow-amber-900/40'
                  : 'bg-white/10 border-white/15 hover:bg-white/20 hover:border-white/30'
              }`}
            >
              <div className="text-white text-base font-bold tracking-wide">{shop.name}</div>
            </button>
          ))}
        </div>

        {/* Password form */}
        {selectedShop && (
          <form
            action={action}
            className="w-full max-w-xs bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 space-y-3"
          >
            <input type="hidden" name="shopCode" value={selectedShop} />
            <PasswordInput
              keyVal={selectedShop}
              name="password"
              required
              autoFocus
              className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
              placeholder="Password"
            />
            {state?.error && (
              <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{state.error}</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full py-2.5 bg-amber-700/80 text-white rounded-lg text-sm font-semibold hover:bg-amber-600/80 disabled:opacity-50 transition-colors cursor-pointer tracking-widest"
            >
              {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        {/* Manage branches */}
        <button
          type="button"
          onClick={() => setShowManager(true)}
          className="mt-6 text-xs text-white/60 hover:text-white/90 transition-colors cursor-pointer tracking-widest"
        >
          ⚙ จัดการสาขา
        </button>
      </div>

      {showManager && (
        <BranchManagerModal
          onClose={() => setShowManager(false)}
          onShopsChanged={refreshShops}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

    </div>
  )
}
