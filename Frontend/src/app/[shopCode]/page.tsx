'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useShop } from '@/components/ShopProvider'
import { useState, useActionState } from 'react'
import { elevateToOwnerAction } from '@/app/actions'
import { translations } from '@/lib/translations'

function ElevateModal({
  onClose,
  tr,
  title,
  desc,
  placeholder,
}: {
  onClose: () => void
  tr: typeof translations.th
  title: string
  desc: string
  placeholder: string
}) {
  const [state, action, pending] = useActionState(elevateToOwnerAction, null)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xs p-6 space-y-4">
        <h3 className="font-bold text-brand-green">{title}</h3>
        <p className="text-sm text-brand-accent">{desc}</p>
        <form action={action} className="space-y-3">
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder={placeholder}
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
              {tr.cancel}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer hover:bg-brand-gold-dark transition-colors"
            >
              {pending ? '...' : tr.enter}
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
  const { session, lang } = useShop()
  const tr = translations[lang]
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [showOwnerModal, setShowOwnerModal] = useState(false)

  const NAV_ITEMS = [
    {
      label: tr.nav_revenue,
      sub: tr.nav_revenue_sub,
      href: 'revenue',
      icon: '💰',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
    {
      label: tr.nav_expense,
      sub: tr.nav_expense_sub,
      href: 'expense',
      icon: '🧾',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
    {
      label: tr.nav_summary,
      sub: tr.nav_summary_sub,
      href: 'summary',
      icon: '📊',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
    {
      label: tr.nav_employees,
      sub: tr.nav_employees_sub,
      href: 'employees',
      icon: '👥',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
    {
      label: tr.nav_time_record,
      sub: tr.nav_time_record_sub,
      href: 'time-record',
      icon: '⏰',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
    {
      label: tr.nav_schedule,
      sub: tr.nav_schedule_sub,
      href: 'schedule',
      icon: '📅',
      bg: 'bg-white',
      border: 'border-brand-accent',
      text: 'text-brand-green',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={`/${shopCode}/${item.href}`}
            className={`flex flex-col items-start gap-1 p-4 rounded-2xl border-2 transition-all hover:shadow-md active:scale-95 ${item.bg} ${item.border}`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className={`text-sm font-bold ${item.text}`}>{item.label}</span>
            <span className="text-xs text-brand-accent">{item.sub}</span>
          </Link>
        ))}
      </div>

      {session.role === 'staff' && (
        <button
          onClick={() => setShowManagerModal(true)}
          className="w-full py-2.5 border border-brand-accent bg-white text-brand-green rounded-xl text-sm hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
        >
          {tr.manager_mode_btn}
        </button>
      )}

      {session.role === 'staff' && (
        <button
          onClick={() => setShowOwnerModal(true)}
          className="w-full py-2.5 border border-brand-accent bg-white text-brand-green rounded-xl text-sm hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
        >
          {lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
        </button>
      )}

      {session.role === 'manager' && (
        <button
          onClick={() => setShowOwnerModal(true)}
          className="w-full py-2.5 border border-brand-accent bg-white text-brand-green rounded-xl text-sm hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
        >
          {lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
        </button>
      )}

      {(session.role === 'manager' || session.role === 'owner') && (
        <Link
          href={`/${shopCode}/config`}
          className="w-full block text-center py-2.5 border border-brand-accent bg-white text-brand-green rounded-xl text-sm hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
        >
          {tr.delivery_settings}
        </Link>
      )}

      {showManagerModal && (
        <ElevateModal
          onClose={() => setShowManagerModal(false)}
          tr={tr}
          title={tr.manager_modal_title}
          desc={tr.manager_modal_desc}
          placeholder="Manager Password"
        />
      )}
      {showOwnerModal && (
        <ElevateModal
          onClose={() => setShowOwnerModal(false)}
          tr={tr}
          title={lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
          desc={lang === 'th' ? 'กรอก Owner Password เพื่อเข้าสู่โหมด Owner' : 'Enter your Owner Password to access Owner mode'}
          placeholder="Owner Password"
        />
      )}
    </div>
  )
}
