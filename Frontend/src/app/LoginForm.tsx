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
    startTransition(async () => {
      const res = await addShopAction(masterPassword, newForm.name, newForm.restaurantPassword, newForm.managerPassword, newForm.ownerPassword ?? '')
      if ('error' in res) { setError(res.error); return }
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
      const res = await updateShopAction(masterPassword, editing.code, editing.name, editing.restaurantPassword, editing.managerPassword, editing.ownerPassword ?? '')
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
                      <input type="password" value={editing.ownerPassword ?? ''} onChange={(e) => setEditing({ ...editing, ownerPassword: e.target.value })} placeholder="Owner Password (optional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="flex-1 py-1.5 border border-white/20 rounded-lg text-xs text-white/70 cursor-pointer hover:bg-white/10">ยกเลิก</button>
                        <button onClick={handleUpdate} disabled={isPending} className="flex-1 py-1.5 bg-amber-700/80 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">บันทึก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between border border-white/10 rounded-xl px-3 py-2.5 bg-white/5">
                      <div>
                        <div className="text-sm font-medium text-white">{shop.name}</div>
                        <div className="text-xs text-white/40">#{shop.code}</div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => { setEditing({ ...shop }); setAdding(false) }} className="text-blue-400 hover:text-blue-300 cursor-pointer">แก้ไข</button>
                        <button onClick={() => handleDelete(shop.code, shop.name)} disabled={isPending} className="text-red-400 hover:text-red-300 cursor-pointer">ลบ</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {adding ? (
              <div className="border border-amber-700/40 rounded-xl p-3 space-y-2 bg-amber-900/20">
                <p className="text-xs font-semibold text-amber-300">สาขาใหม่</p>
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="ชื่อสาขา" className={inputCls} />
                <input type="password" value={newForm.restaurantPassword} onChange={(e) => setNewForm({ ...newForm, restaurantPassword: e.target.value })} placeholder="Staff Password" className={inputCls} />
                <input type="password" value={newForm.managerPassword} onChange={(e) => setNewForm({ ...newForm, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                <input type="password" value={newForm.ownerPassword ?? ''} onChange={(e) => setNewForm({ ...newForm, ownerPassword: e.target.value })} placeholder="Owner Password (optional)" className={inputCls} />
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
              className={`rounded-2xl p-5 text-center transition-all cursor-pointer border backdrop-blur-sm ${
                selectedShop === shop.code
                  ? 'bg-amber-700/60 border-amber-400/60 shadow-lg shadow-amber-900/40'
                  : 'bg-white/10 border-white/15 hover:bg-white/20 hover:border-white/30'
              }`}
            >
              <div className="text-white text-sm font-semibold tracking-wide">{shop.name}</div>
              <div className="text-white/50 text-xs mt-1 tracking-widest">#{shop.code.toUpperCase()}</div>
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
