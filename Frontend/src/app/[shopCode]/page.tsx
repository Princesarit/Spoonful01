'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useShop } from '@/components/ShopProvider'
import { useState, useActionState, useEffect } from 'react'
import { elevateToOwnerAction } from '@/app/actions'
import { translations } from '@/lib/translations'
import { getRevenueData } from './revenue/actions'
import { getTimeRecordData } from './time-record/actions'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function ElevateModal({
  onClose,
  title,
  desc,
  placeholder,
  cancelLabel,
}: {
  onClose: () => void
  title: string
  desc: string
  placeholder: string
  cancelLabel: string
}) {
  const [state, action, pending] = useActionState(elevateToOwnerAction, null)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xs p-6 space-y-4 shadow-xl">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{desc}</p>
        <form action={action} className="space-y-3">
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder={placeholder}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {state?.error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer hover:bg-gray-50"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer hover:bg-blue-600 transition-colors"
            >
              {pending ? '...' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface Stats {
  totalSales: number
  activeStaff: number
  totalEmployees: number
  ordersToday: number
}

export default function HomePage() {
  const params = useParams()
  const shopCode = params.shopCode as string
  const { session, lang } = useShop()
  const tr = translations[lang]
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [showOwnerModal, setShowOwnerModal] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const todayDate = today()
    Promise.all([
      getRevenueData(shopCode),
      getTimeRecordData(shopCode, todayDate),
    ]).then(([revData, trData]) => {
      const todayEntries = revData.entries.filter((e) => e.date === todayDate)
      const totalSales = todayEntries.reduce((s, e) => {
        const platTotal = Object.values(e.platforms).reduce((a, v) => a + v, 0)
        return s + e.netSales + e.paidOnline + platTotal
      }, 0)
      const activeStaff = trData.timeRecords.filter(
        (r) => (r.morning ?? 0) > 0 || (r.evening ?? 0) > 0
      ).length
      setStats({
        totalSales,
        activeStaff,
        totalEmployees: trData.employees.length,
        ordersToday: todayEntries.length,
      })
    }).catch(() => {})
  }, [shopCode])

  const NAV_ITEMS = [
    {
      label: tr.nav_revenue,
      sub: tr.nav_revenue_sub,
      href: 'revenue',
      icon: '$',
      iconBg: 'bg-emerald-500',
    },
    {
      label: tr.nav_expense,
      sub: tr.nav_expense_sub,
      href: 'expense',
      icon: '🧾',
      iconBg: 'bg-orange-500',
    },
    {
      label: tr.nav_summary,
      sub: tr.nav_summary_sub,
      href: 'summary',
      icon: '📊',
      iconBg: 'bg-blue-500',
    },
    {
      label: tr.nav_employees,
      sub: tr.nav_employees_sub,
      href: 'employees',
      icon: '👥',
      iconBg: 'bg-violet-500',
    },
    {
      label: tr.nav_time_record,
      sub: tr.nav_time_record_sub,
      href: 'time-record',
      icon: '⏰',
      iconBg: 'bg-pink-500',
    },
    {
      label: tr.nav_schedule,
      sub: tr.nav_schedule_sub,
      href: 'schedule',
      icon: '📅',
      iconBg: 'bg-teal-500',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'ยอดวันนี้' : "Today's Sales"}</span>
            <span className="text-green-500 text-sm">↗</span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {stats ? `฿${stats.totalSales.toLocaleString()}` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats ? `${stats.ordersToday} ${lang === 'th' ? 'รายการ' : 'entries'}` : '...'}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'พนักงาน' : 'Active Staff'}</span>
            <span className="text-blue-400 text-sm">👥</span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {stats ? stats.activeStaff : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats
              ? `${lang === 'th' ? 'จาก' : 'of'} ${stats.totalEmployees} ${lang === 'th' ? 'คน' : 'total'}`
              : '...'}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'ออเดอร์' : 'Orders Today'}</span>
            <span className="text-orange-400 text-sm">📋</span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {stats ? stats.ordersToday : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {lang === 'th' ? 'รายการวันนี้' : 'entries today'}
          </div>
        </div>
      </div>

      {/* Nav grid */}
      <div className="grid grid-cols-3 gap-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={`/${shopCode}/${item.href}`}
            className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md active:scale-95 transition-all"
          >
            <div className={`w-10 h-10 rounded-xl ${item.iconBg} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
              {item.icon}
            </div>
            <div>
              <div className="text-sm font-bold text-gray-800 leading-tight">{item.label}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{item.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Role action buttons */}
      {session.role === 'staff' && (
        <button
          onClick={() => setShowManagerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' }}
        >
          🔑 {tr.manager_mode_btn}
        </button>
      )}

      {(session.role === 'staff' || session.role === 'manager') && (
        <button
          onClick={() => setShowOwnerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
        >
          👑 {lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
        </button>
      )}

      {(session.role === 'manager' || session.role === 'owner') && (
        <Link
          href={`/${shopCode}/config`}
          className="w-full block text-center py-3 rounded-2xl text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
        >
          {tr.delivery_settings}
        </Link>
      )}

      {showManagerModal && (
        <ElevateModal
          onClose={() => setShowManagerModal(false)}
          title={tr.manager_modal_title}
          desc={tr.manager_modal_desc}
          placeholder="Manager Password"
          cancelLabel={tr.cancel}
        />
      )}
      {showOwnerModal && (
        <ElevateModal
          onClose={() => setShowOwnerModal(false)}
          title={lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
          desc={lang === 'th' ? 'กรอก Owner Password' : 'Enter your Owner Password'}
          placeholder="Owner Password"
          cancelLabel={tr.cancel}
        />
      )}
    </div>
  )
}
