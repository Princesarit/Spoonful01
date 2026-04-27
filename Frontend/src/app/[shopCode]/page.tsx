'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useShop } from '@/components/ShopProvider'
import { useState, useActionState, useEffect } from 'react'
import { elevateToOwnerAction, elevateToManagerAction } from '@/app/actions'
import { translations } from '@/lib/translations'
import { getRevenueData } from './revenue/actions'
import { getScheduleData } from './schedule/actions'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function mealTotal(m: { eftpos: number; lfyOnline: number; uberOnline: number; doorDash: number; cashSale?: number; totalSale: number }): number {
  if (m.totalSale > 0) return m.totalSale
  return m.eftpos + m.lfyOnline + m.uberOnline + m.doorDash + (m.cashSale ?? 0)
}

function ElevateModal({
  onClose,
  title,
  desc,
  placeholder,
  cancelLabel,
  action: elevateAction,
}: {
  onClose: () => void
  title: string
  desc: string
  placeholder: string
  cancelLabel: string
  action: (prev: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>
}) {
  const [state, action, pending] = useActionState(elevateAction, null)
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

type Shift = 'am' | 'pm' | 'total'

interface Stats {
  lunchSales: number
  dinnerSales: number
  lunchBills: number
  dinnerBills: number
  totalBills: number
}

export default function HomePage() {
  const params = useParams()
  const shopCode = params.shopCode as string
  const { session, lang, isDark } = useShop()
  const tr = translations[lang]
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [showOwnerModal, setShowOwnerModal] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [shift, setShift] = useState<Shift>('total')
  const [staffCounts, setStaffCounts] = useState<{
    morning: number; evening: number; total: number
    amPos: { front: number; kitchen: number; home: number }
    pmPos: { front: number; kitchen: number; home: number }
    totalPos: { front: number; kitchen: number; home: number }
  } | null>(null)

  function nextShift() {
    setShift((s) => s === 'am' ? 'pm' : s === 'pm' ? 'total' : 'am')
  }

  useEffect(() => {
    const todayDate = today()
    getRevenueData(shopCode).then(({ entries }) => {
      const todayEntries = entries.filter((e) => e.date === todayDate)
      const lunchBills = todayEntries.reduce((s, e) => s + (e.lunchLfyBills ?? 0) + (e.lunchUberBills ?? 0) + (e.lunchDoorDashBills ?? 0), 0)
      const dinnerBills = todayEntries.reduce((s, e) => s + (e.dinnerLfyBills ?? 0) + (e.dinnerUberBills ?? 0) + (e.dinnerDoorDashBills ?? 0), 0)
      setStats({
        lunchSales: todayEntries.reduce((s, e) => s + mealTotal(e.lunch), 0),
        dinnerSales: todayEntries.reduce((s, e) => s + mealTotal(e.dinner), 0),
        lunchBills,
        dinnerBills,
        totalBills: lunchBills + dinnerBills,
      })
    }).catch(() => {})

    getScheduleData(shopCode).then(({ employees, schedules }) => {
      const now = new Date()
      const dayOfWeek = now.getDay()
      const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Mon=0..Sun=6
      const d = new Date(now)
      d.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      d.setHours(0, 0, 0, 0)
      const weekStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const currentSchedule = schedules.find((s) => s.weekStart === weekStr)
      if (!currentSchedule) return

      const empMap = new Map(employees.map((e) => [e.id, e]))
      const countPos = (entries: typeof currentSchedule.entries) => {
        const ids = new Set(entries.map((e) => e.employeeId))
        let front = 0, kitchen = 0, home = 0
        ids.forEach((id) => {
          const pos = empMap.get(id)?.positions ?? []
          if (pos.includes('Front'))   front++
          if (pos.includes('Kitchen')) kitchen++
          if (pos.includes('Home'))    home++
        })
        return { front, kitchen, home }
      }

      const amEntries  = currentSchedule.entries.filter((e) => e.days[dayIdx * 2] != null)
      const pmEntries  = currentSchedule.entries.filter((e) => e.days[dayIdx * 2 + 1] != null)
      const allEntries = currentSchedule.entries.filter((e) => e.days[dayIdx * 2] != null || e.days[dayIdx * 2 + 1] != null)

      setStaffCounts({
        morning: amEntries.length,
        evening: pmEntries.length,
        total:   allEntries.length,
        amPos:    countPos(amEntries),
        pmPos:    countPos(pmEntries),
        totalPos: countPos(allEntries),
      })
    }).catch(() => {})
  }, [shopCode])

  const NAV_ITEMS = [
    {
      label: tr.nav_revenue,
      sub: tr.nav_revenue_sub,
      href: 'revenue',
      icon: '$',
      iconBg: 'bg-emerald-500 dark:bg-emerald-800',
      ownerOnly: false,
    },
    {
      label: tr.nav_expense,
      sub: tr.nav_expense_sub,
      href: 'expense',
      icon: '🧾',
      iconBg: 'bg-orange-500 dark:bg-orange-800',
      ownerOnly: false,
    },
    {
      label: tr.nav_summary,
      sub: tr.nav_summary_sub,
      href: 'summary',
      icon: '📊',
      iconBg: 'bg-blue-500 dark:bg-blue-800',
      ownerOnly: true,
    },
    {
      label: tr.nav_employees,
      sub: tr.nav_employees_sub,
      href: 'employees',
      icon: '👥',
      iconBg: 'bg-violet-500 dark:bg-violet-800',
      ownerOnly: false,
    },
    {
      label: tr.nav_time_record,
      sub: tr.nav_time_record_sub,
      href: 'time-record',
      icon: '⏰',
      iconBg: 'bg-pink-500 dark:bg-pink-800',
      ownerOnly: false,
    },
    {
      label: tr.nav_schedule,
      sub: tr.nav_schedule_sub,
      href: 'schedule',
      icon: '📅',
      iconBg: 'bg-teal-500 dark:bg-teal-800',
      ownerOnly: false,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Today's Sales */}
        {/* Today's Sales */}
        <button
          onClick={nextShift}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left w-full active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'ยอดวันนี้' : "Today's Sales"}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${shift === 'am' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300' : shift === 'pm' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'}`}>
              {shift === 'am' ? 'AM' : shift === 'pm' ? 'PM' : 'Total'}
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {stats
              ? `$${(shift === 'am' ? stats.lunchSales : shift === 'pm' ? stats.dinnerSales : stats.lunchSales + stats.dinnerSales).toLocaleString()}`
              : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {shift === 'am' ? 'Lunch' : shift === 'pm' ? 'Dinner' : 'All day'}
          </div>
        </button>

        {/* Active Staff */}
        <button
          onClick={nextShift}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left w-full active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'พนักงาน' : 'Active Staff'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${shift === 'am' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300' : shift === 'pm' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'}`}>
              {shift === 'am' ? 'AM' : shift === 'pm' ? 'PM' : 'Total'}
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {staffCounts
              ? shift === 'am' ? staffCounts.morning : shift === 'pm' ? staffCounts.evening : staffCounts.total
              : '—'}
          </div>
          {staffCounts && (() => {
            const pos = shift === 'am' ? staffCounts.amPos : shift === 'pm' ? staffCounts.pmPos : staffCounts.totalPos
            return (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {pos.front   > 0 && <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">F·{pos.front}</span>}
                {pos.kitchen > 0 && <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">K·{pos.kitchen}</span>}
                {pos.home    > 0 && <span className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded-full font-medium">H·{pos.home}</span>}
              </div>
            )
          })()}
          {!staffCounts && <div className="text-xs text-gray-400 mt-1">{lang === 'th' ? 'ตามตาราง' : 'from schedule'}</div>}
        </button>

        {/* Orders Today */}
        <button
          onClick={nextShift}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left w-full active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-gray-500">{lang === 'th' ? 'ออเดอร์' : 'Orders Today'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${shift === 'am' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300' : shift === 'pm' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'}`}>
              {shift === 'am' ? 'AM' : shift === 'pm' ? 'PM' : 'Total'}
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900">
            {stats ? (shift === 'am' ? stats.lunchBills : shift === 'pm' ? stats.dinnerBills : stats.totalBills) : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {lang === 'th' ? 'จำนวน Bill' : 'total bills'}
          </div>
        </button>
      </div>

      {/* Nav grid */}
      <div className="grid grid-cols-3 gap-3">
        {NAV_ITEMS.map((item) => {
          const locked = item.ownerOnly && session.role !== 'owner'
          const inner = (
            <>
              <div className={`w-10 h-10 rounded-xl ${item.iconBg} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
                {item.icon}
              </div>
              <div>
                <div className="text-sm font-bold text-gray-800 leading-tight">{item.label}</div>
                <div className="text-xs text-gray-400 mt-0.5 leading-tight">{item.sub}</div>
              </div>
            </>
          )
          if (locked) {
            return (
              <div
                key={item.href}
                className="relative flex flex-col items-start gap-2 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm cursor-not-allowed select-none"
              >
                {inner}
                <span className="absolute top-2 right-2 text-sm">🔒</span>
              </div>
            )
          }
          return (
          <Link
            key={item.href}
            href={`/${shopCode}/${item.href}`}
            className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md active:scale-95 transition-all"
          >
            {inner}
          </Link>
          )
        })}
      </div>

      {/* Role action buttons */}
      {session.role === 'staff' && (
        <button
          onClick={() => setShowManagerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: isDark ? 'linear-gradient(135deg, #1e2d46 0%, #2d1a4a 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' }}
        >
          {tr.manager_mode_btn}
        </button>
      )}

      {(session.role === 'staff' || session.role === 'manager') && (
        <button
          onClick={() => setShowOwnerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: isDark ? 'linear-gradient(135deg, #6b3208 0%, #7a1e1e 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}
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
          action={elevateToManagerAction}
        />
      )}
      {showOwnerModal && (
        <ElevateModal
          onClose={() => setShowOwnerModal(false)}
          title={lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
          desc={lang === 'th' ? 'กรอก Owner Password' : 'Enter your Owner Password'}
          placeholder="Owner Password"
          cancelLabel={tr.cancel}
          action={elevateToOwnerAction}
        />
      )}
    </div>
  )
}
