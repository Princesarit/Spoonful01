'use client'

import { useState, useActionState, useTransition } from 'react'
import Image from 'next/image'
import { loginAction } from './actions'
import {
  getStoredShopsAction,
  addShopAction,
  updateShopAction,
  deleteShopAction,
} from './shop-actions'
import type { ShopConfig } from '@/lib/config'
import type { StoredShop } from '@/lib/types'

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
    if (!confirm(`ลบสาขา "${name}" ?`)) return
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
            <p className="text-xs text-white/40">กรอก Master Manager Password เพื่อเข้าถึง</p>
            <form onSubmit={handleAuth} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Master Password"
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
              <button onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none cursor-pointer">×</button>
            </div>

            {error && <p className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shops.map((shop) => (
                <div key={shop.code}>
                  {editing?.code === shop.code ? (
                    <div className="border border-amber-700/40 rounded-xl p-3 space-y-2 bg-amber-900/20">
                      <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="ชื่อสาขา" className={inputCls} />
                      <input type="password" value={editing.restaurantPassword} onChange={(e) => setEditing({ ...editing, restaurantPassword: e.target.value })} placeholder="Staff Password" className={inputCls} />
                      <input type="password" value={editing.managerPassword} onChange={(e) => setEditing({ ...editing, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                      <input required value={editing.spreadsheetId ?? ''} onChange={(e) => setEditing({ ...editing, spreadsheetId: e.target.value })} placeholder="Spreadsheet ID" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
                        <button onClick={handleUpdate} disabled={isPending} className="flex-1 py-1.5 bg-amber-700/80 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">บันทึก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between border border-white/10 rounded-xl px-3 py-2.5 bg-white/5">
                      <div>
                        <div className="text-sm font-medium text-white">{shop.name}</div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => { setEditing({ ...shop }); setAdding(false) }}
                          className="rounded-md border border-blue-300/25 bg-blue-500/15 px-2 py-1 font-semibold text-blue-200 hover:bg-blue-500/25 hover:text-blue-100 cursor-pointer"
                        >
                          แก้ไข
                        </button>
                        <button
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
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="ชื่อสาขา" className={inputCls} />
                <input type="password" value={newForm.restaurantPassword} onChange={(e) => setNewForm({ ...newForm, restaurantPassword: e.target.value })} placeholder="Staff Password" className={inputCls} />
                <input type="password" value={newForm.managerPassword} onChange={(e) => setNewForm({ ...newForm, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                <input required value={newForm.spreadsheetId ?? ''} onChange={(e) => setNewForm({ ...newForm, spreadsheetId: e.target.value })} placeholder="Spreadsheet ID" className={inputCls} />
                <div className="flex gap-2">
                  <button onClick={() => { setAdding(false); setNewForm(emptyForm()) }} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 cursor-pointer">ยกเลิก</button>
                  <button onClick={handleAdd} disabled={isPending} className="flex-1 py-1.5 bg-amber-700/80 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">เพิ่มสาขา</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(true); setEditing(null) }}
                className="w-full py-2 border-2 border-dashed border-white/20 text-white/50 text-sm rounded-xl hover:border-amber-500/50 hover:text-amber-400/70 transition-colors cursor-pointer"
              >
                + เพิ่มสาขา
              </button>
            )}

            {showSheetHelp && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
                <div className="w-full max-w-md rounded-2xl border border-white/15 bg-stone-950 p-5 text-left shadow-2xl">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">วิธีเตรียม Google Sheet ให้สาขาใหม่</h4>
                      <p className="mt-1 text-xs leading-5 text-white/55">ใช้เมื่อต้องการแยกข้อมูลของแต่ละสาขาออกจาก main sheet</p>
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
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
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
                      <p className="mt-2 text-xs leading-5 text-white/60">ไปที่ Google Drive แล้วกด New → Google Sheets ตั้งชื่อเช่น Spoonful - ชื่อสาขา</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
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

                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] font-bold text-stone-950">3</span>
                        <p className="text-xs font-semibold text-white">คัดลอก Spreadsheet ID มาใส่ช่องด้านล่าง</p>
                      </div>
                      <div className="rounded-lg border border-amber-400/30 bg-amber-950/35 p-3">
                        <p className="break-all rounded bg-stone-950/70 px-2 py-1.5 text-[10px] text-amber-100">docs.google.com/spreadsheets/d/<span className="text-amber-300">SPREADSHEET_ID</span>/edit</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/60">เอาเฉพาะตัวอักษรยาว ๆ ระหว่าง /d/ และ /edit ไปใส่ช่อง Spreadsheet ID</p>
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
    </div>
  )
}

// ─── Login Form ────────────────────────────────────────────────────────────

export default function LoginForm({ shops: initialShops }: { shops: ShopConfig[] }) {
  const [shops, setShops] = useState(initialShops)
  const [selectedShop, setSelectedShop] = useState<string | null>(null)
  const [state, action, pending] = useActionState(loginAction, null)
  const [showManager, setShowManager] = useState(false)
  const [, startTransition] = useTransition()

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

        {/* Welcome to */}
        <p className="text-white/75 text-base tracking-[0.35em] mb-1 italic font-light">
          Welcome to
        </p>

        {/* SPOONFUL */}
        <h1 className="font-brand text-[clamp(2.8rem,7.5vw,5rem)] text-white tracking-[0.15em] leading-none mb-3">
          SPOONFUL
        </h1>

        {/* ── Thai Cuisine ── */}
        <div className="flex items-center justify-center gap-4 mb-8 w-full max-w-xs">
          <div className="flex-1 h-px bg-amber-400/70" />
          <span className="text-amber-300 tracking-[0.4em] text-sm font-light whitespace-nowrap">
            Thai Cuisine
          </span>
          <div className="flex-1 h-px bg-amber-400/70" />
        </div>

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

        {/* ── Restaurant management system ── */}
        <div className="flex items-center justify-center gap-3 mb-10 w-full max-w-sm">
          <div className="flex-1 h-px bg-white/30" />
          <span className="text-white/60 tracking-[0.25em] text-sm whitespace-nowrap">
            Restaurant management system
          </span>
          <div className="flex-1 h-px bg-white/30" />
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
              className={`min-h-[76px] rounded-2xl p-5 text-center transition-all cursor-pointer border backdrop-blur-sm flex items-center justify-center ${
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
            <input
              key={selectedShop}
              type="password"
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
          onClick={() => setShowManager(true)}
          className="mt-6 text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer tracking-widest"
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
    </div>
  )
}
