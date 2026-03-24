'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useShop } from '@/components/ShopProvider'
import { useState, useActionState } from 'react'
import { elevateToOwnerAction } from '@/app/actions'

const NAV_ITEMS = [
  {
    label: 'ตารางเวลา',
    sub: 'จัดตารางกะพนักงาน',
    href: 'schedule',
    icon: '📅',
    bg: 'bg-white',
    border: 'border-brand-accent',
    text: 'text-brand-green',
  },
  {
    label: 'กรอกเวลา',
    sub: 'บันทึกการเข้างาน',
    href: 'time-record',
    icon: '⏰',
    bg: 'bg-white',
    border: 'border-brand-accent',
    text: 'text-brand-green',
  },
  {
    label: 'รายรับ',
    sub: 'ยอดขายประจำวัน',
    href: 'revenue',
    icon: '💰',
    bg: 'bg-white',
    border: 'border-brand-accent',
    text: 'text-brand-green',
  },
  {
    label: 'รายจ่าย',
    sub: 'บันทึกค่าใช้จ่าย',
    href: 'expense',
    icon: '🧾',
    bg: 'bg-white',
    border: 'border-brand-accent',
    text: 'text-brand-green',
  },
  {
    label: 'สรุปยอด',
    sub: 'รายงานรวมทุกวัน',
    href: 'summary',
    icon: '📊',
    bg: 'bg-brand-green',
    border: 'border-brand-green',
    text: 'text-white',
  },
]

function OwnerModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(elevateToOwnerAction, null)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xs p-6 space-y-4">
        <h3 className="font-bold text-brand-green">เข้าสู่ Owner Mode</h3>
        <p className="text-sm text-brand-accent">กรอก Owner Password เพื่อจัดการพนักงานและข้อมูลร้าน</p>
        <form action={action} className="space-y-3">
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Owner Password"
            className="w-full px-3 py-2.5 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
          {state?.error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-brand-green cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer hover:bg-brand-gold-dark transition-colors"
            >
              {pending ? '...' : 'เข้าสู่ระบบ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function HomePage() {
  const params = useParams()
  const shopCode = params.shopCode as string
  const { session } = useShop()
  const [showOwnerModal, setShowOwnerModal] = useState(false)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={`/${shopCode}/${item.href}`}
            className={`flex flex-col items-start gap-1 p-5 rounded-2xl border-2 transition-all hover:shadow-md active:scale-95 ${item.bg} ${item.border} ${item.href === 'summary' ? 'col-span-2' : ''}`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className={`text-sm font-bold ${item.text}`}>{item.label}</span>
            <span className={`text-xs ${item.href === 'summary' ? 'text-brand-accent' : 'text-brand-accent'}`}>{item.sub}</span>
          </Link>
        ))}
      </div>

      {session.role !== 'owner' && (
        <button
          onClick={() => setShowOwnerModal(true)}
          className="w-full py-2.5 border border-brand-accent bg-white text-brand-green rounded-xl text-sm hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
        >
          🔑 เข้าสู่ Owner Mode
        </button>
      )}

      {showOwnerModal && <OwnerModal onClose={() => setShowOwnerModal(false)} />}
    </div>
  )
}
