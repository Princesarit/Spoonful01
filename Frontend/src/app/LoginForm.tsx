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

  const inputCls = 'w-full border border-brand-accent rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 my-auto">

        {step === 'auth' && (
          <>
            <h3 className="font-bold text-brand-green">จัดการสาขา</h3>
            <p className="text-xs text-gray-400">กรอก Master Manager Password เพื่อเข้าถึง</p>
            <form onSubmit={handleAuth} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Master Password"
                className={inputCls}
              />
              {authError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{authError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-brand-green cursor-pointer">ยกเลิก</button>
                <button type="submit" className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold cursor-pointer hover:bg-brand-gold-dark transition-colors">เข้าสู่ระบบ</button>
              </div>
            </form>
          </>
        )}

        {step === 'list' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-green">จัดการสาขา</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer">×</button>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shops.map((shop) => (
                <div key={shop.code}>
                  {editing?.code === shop.code ? (
                    <div className="border border-brand-gold/40 rounded-xl p-3 space-y-2 bg-brand-gold-light">
                      <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="ชื่อสาขา" className={inputCls} />
                      <input type="password" value={editing.restaurantPassword} onChange={(e) => setEditing({ ...editing, restaurantPassword: e.target.value })} placeholder="Staff Password" className={inputCls} />
                      <input type="password" value={editing.managerPassword} onChange={(e) => setEditing({ ...editing, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                      <input type="password" value={editing.ownerPassword ?? ''} onChange={(e) => setEditing({ ...editing, ownerPassword: e.target.value })} placeholder="Owner Password (optional)" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(null)} className="flex-1 py-1.5 border border-brand-accent rounded-lg text-xs text-brand-green cursor-pointer">ยกเลิก</button>
                        <button onClick={handleUpdate} disabled={isPending} className="flex-1 py-1.5 bg-brand-gold text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">บันทึก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between border border-brand-accent rounded-xl px-3 py-2.5">
                      <div>
                        <div className="text-sm font-medium text-brand-green">{shop.name}</div>
                        <div className="text-xs text-gray-400">#{shop.code}</div>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => { setEditing({ ...shop }); setAdding(false) }} className="text-blue-500 hover:text-blue-700 cursor-pointer">แก้ไข</button>
                        <button onClick={() => handleDelete(shop.code, shop.name)} disabled={isPending} className="text-red-400 hover:text-red-600 cursor-pointer">ลบ</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {adding ? (
              <div className="border border-brand-gold/40 rounded-xl p-3 space-y-2 bg-brand-gold-light">
                <p className="text-xs font-semibold text-brand-green">สาขาใหม่</p>
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="ชื่อสาขา" className={inputCls} />
                <input type="password" value={newForm.restaurantPassword} onChange={(e) => setNewForm({ ...newForm, restaurantPassword: e.target.value })} placeholder="Staff Password" className={inputCls} />
                <input type="password" value={newForm.managerPassword} onChange={(e) => setNewForm({ ...newForm, managerPassword: e.target.value })} placeholder="Manager Password" className={inputCls} />
                <input type="password" value={newForm.ownerPassword ?? ''} onChange={(e) => setNewForm({ ...newForm, ownerPassword: e.target.value })} placeholder="Owner Password (optional)" className={inputCls} />
                <div className="flex gap-2">
                  <button onClick={() => { setAdding(false); setNewForm(emptyForm()) }} className="flex-1 py-1.5 border border-brand-accent rounded-lg text-xs text-brand-green cursor-pointer">ยกเลิก</button>
                  <button onClick={handleAdd} disabled={isPending} className="flex-1 py-1.5 bg-brand-gold text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer">เพิ่มสาขา</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(true); setEditing(null) }}
                className="w-full py-2 border-2 border-dashed border-brand-gold/50 text-brand-gold text-sm rounded-xl hover:border-brand-gold hover:bg-brand-gold-light transition-colors cursor-pointer"
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-parchment p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mb-8 -mt-24 flex justify-center">
            <Image
              src="/Title.png"
              alt="Spoonful Thai Cuisine"
              width={280}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <div className="flex justify-center mb-3">
            <Image
              src="/LOGO.png"
              alt="Spoonful Thai Cuisine"
              width={88}
              height={88}
              className="rounded-full object-cover"
              priority
            />
          </div>
          <p className="text-brand-accent text-sm">ระบบจัดการร้านอาหาร</p>
        </div>

        <p className="text-sm font-medium text-brand-green mb-3">เลือกร้าน</p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {shops.map((shop) => (
            <button
              key={shop.code}
              type="button"
              onClick={() => setSelectedShop(shop.code)}
              className={`p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                selectedShop === shop.code
                  ? 'border-brand-gold bg-brand-gold-light text-brand-green'
                  : 'border-brand-accent bg-white text-brand-green hover:border-brand-gold'
              }`}
            >
              <div className="text-xs font-semibold leading-tight">{shop.name}</div>
              <div className="text-xs text-brand-accent mt-0.5">#{shop.code}</div>
            </button>
          ))}
        </div>

        {selectedShop && (
          <form
            action={action}
            className="bg-white rounded-2xl border border-brand-accent shadow-sm p-6 space-y-4"
          >
            <input type="hidden" name="shopCode" value={selectedShop} />
            <div>
              <label className="block text-sm font-medium text-brand-green mb-1.5">รหัสผ่าน</label>
              <input
                key={selectedShop}
                type="password"
                name="password"
                required
                autoFocus
                className="w-full px-3 py-2.5 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent"
                placeholder="กรอกรหัสผ่าน"
              />
            </div>
            {state?.error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full py-2.5 bg-brand-gold text-white rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
            >
              {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        )}

        <button
          onClick={() => setShowManager(true)}
          className="mt-4 w-full py-2 text-xs text-brand-accent hover:text-brand-gold transition-colors cursor-pointer"
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
