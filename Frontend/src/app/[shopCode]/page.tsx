'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useShop } from '@/components/ShopProvider'
import { useState, useActionState, useEffect, type CSSProperties } from 'react'
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
  onClose, title, desc, placeholder, cancelLabel,
  action: elevateAction, enterStyle,
}: {
  onClose: () => void; title: string; desc: string
  placeholder: string; cancelLabel: string
  action: (prev: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>
  enterStyle?: CSSProperties
}) {
  const { isDark } = useShop()
  const [state, action, pending] = useActionState(elevateAction, null)
  const modalBg   = isDark ? '#251E38' : '#FFFFFF'
  const titleClr  = isDark ? '#F0E8DA' : '#111827'
  const descClr   = isDark ? '#B0A8C8' : '#6B7280'
  const inputBdr  = isDark ? '#453858' : '#E5E7EB'
  const inputBg   = isDark ? '#1A1428' : '#FFFFFF'
  const inputClr  = isDark ? '#F0E8DA' : '#111827'
  const cancelBg  = isDark ? 'transparent' : 'transparent'
  const cancelBdr = isDark ? '#453858' : '#E5E7EB'
  const cancelClr = isDark ? '#C0B0D8' : '#4B5563'
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-xs p-6 space-y-4 shadow-xl" style={{ background: modalBg }}>
        <h3 className="font-bold" style={{ color: titleClr }}>{title}</h3>
        <p className="text-sm" style={{ color: descClr }}>{desc}</p>
        <form action={action} className="space-y-3">
          <input type="password" name="password" required autoFocus placeholder={placeholder}
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            style={{ border: `1px solid ${inputBdr}`, background: inputBg, color: inputClr }} />
          {state?.error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: cancelBg, border: `1px solid ${cancelBdr}`, color: cancelClr }}>
              {cancelLabel}
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 cursor-pointer hover:opacity-90 transition-opacity"
              style={enterStyle}>
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
  lunchSales: number; dinnerSales: number
  lunchBills: number; dinnerBills: number; totalBills: number
}

// Time colors — Day / Night per design palette
const SHIFT_COLOR = {
  am:    { day: { bg: '#ECC870', text: '#7A5A10', badge: 'rgba(236,200,112,0.22)' }, night: { bg: '#806020', text: '#ECC870', badge: 'rgba(128,96,32,0.45)'  } },
  pm:    { day: { bg: '#80A8D8', text: '#1A4A80', badge: 'rgba(128,168,216,0.22)' }, night: { bg: '#1A4878', text: '#80C0F0', badge: 'rgba(26,72,120,0.5)'   } },
  total: { day: { bg: '#C8B090', text: '#6A5030', badge: 'rgba(200,176,144,0.22)' }, night: { bg: '#5A4028', text: '#C8A880', badge: 'rgba(90,64,40,0.5)'    } },
}

// Icon colors — original vivid day / pastel muted night
const ICON_COLOR = {
  revenue:       { day: '#10b981', night: '#7BC8A0' },
  expense:       { day: '#f97316', night: '#D4A888' },
  summary:       { day: '#3b82f6', night: '#90B8D8' },
  employees:     { day: '#8b5cf6', night: '#C0A0D8' },
  schedule:      { day: '#14b8a6', night: '#78C8B0' },
  'time-record': { day: '#ec4899', night: '#D898B8' },
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

  useEffect(() => {
    const todayDate = today()
    getRevenueData(shopCode).then(({ entries }) => {
      const todayEntries = entries.filter((e) => e.date === todayDate)
      const lunchBills  = todayEntries.reduce((s, e) => s + (e.lunchLfyBills ?? 0) + (e.lunchUberBills ?? 0) + (e.lunchDoorDashBills ?? 0), 0)
      const dinnerBills = todayEntries.reduce((s, e) => s + (e.dinnerLfyBills ?? 0) + (e.dinnerUberBills ?? 0) + (e.dinnerDoorDashBills ?? 0), 0)
      setStats({
        lunchSales:  todayEntries.reduce((s, e) => s + mealTotal(e.lunch), 0),
        dinnerSales: todayEntries.reduce((s, e) => s + mealTotal(e.dinner), 0),
        lunchBills, dinnerBills, totalBills: lunchBills + dinnerBills,
      })
    }).catch(() => {})

    getScheduleData(shopCode).then(({ employees, schedules }) => {
      const now = new Date()
      const dayOfWeek = now.getDay()
      const dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1
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
        morning: amEntries.length, evening: pmEntries.length, total: allEntries.length,
        amPos: countPos(amEntries), pmPos: countPos(pmEntries), totalPos: countPos(allEntries),
      })
    }).catch(() => {})
  }, [shopCode])

  const NAV_ITEMS = [
    { label: tr.nav_revenue,     sub: tr.nav_revenue_sub,     href: 'revenue',      icon: '$',  key: 'revenue'      as keyof typeof ICON_COLOR, ownerOnly: false },
    { label: tr.nav_expense,     sub: tr.nav_expense_sub,     href: 'expense',      icon: '🧾', key: 'expense'      as keyof typeof ICON_COLOR, ownerOnly: false },
    { label: tr.nav_summary,     sub: tr.nav_summary_sub,     href: 'summary',      icon: '📊', key: 'summary'      as keyof typeof ICON_COLOR, ownerOnly: true  },
    { label: tr.nav_employees,   sub: tr.nav_employees_sub,   href: 'employees',    icon: '👥', key: 'employees'    as keyof typeof ICON_COLOR, ownerOnly: false },
    { label: tr.nav_schedule,    sub: tr.nav_schedule_sub,    href: 'schedule',     icon: '📅', key: 'schedule'     as keyof typeof ICON_COLOR, ownerOnly: false },
    { label: tr.nav_time_record, sub: tr.nav_time_record_sub, href: 'time-record',  icon: '⏰', key: 'time-record'  as keyof typeof ICON_COLOR, ownerOnly: false },
  ]

  const sc = SHIFT_COLOR[shift][isDark ? 'night' : 'day']
  const sales = stats
    ? shift === 'am' ? stats.lunchSales : shift === 'pm' ? stats.dinnerSales : stats.lunchSales + stats.dinnerSales
    : null
  const staff  = staffCounts ? (shift === 'am' ? staffCounts.morning : shift === 'pm' ? staffCounts.evening : staffCounts.total) : null
  const bills  = stats ? (shift === 'am' ? stats.lunchBills : shift === 'pm' ? stats.dinnerBills : stats.totalBills) : null
  const pos    = staffCounts ? (shift === 'am' ? staffCounts.amPos : shift === 'pm' ? staffCounts.pmPos : staffCounts.totalPos) : null
  const shiftLabel = shift === 'am' ? 'AM' : shift === 'pm' ? 'PM' : 'Total'

  const statCls = `bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1`

  return (
    <div className="space-y-4">

      {/* ── Shift Tab Bar ── */}
      <div
        className="relative flex rounded-2xl"
        style={{ background: isDark ? '#251E38' : '#E2D8C8', padding: 4 }}
      >
        <div
          style={{
            position: 'absolute',
            top: 4, bottom: 4,
            left: `calc(4px + ${(['am','pm','total'] as Shift[]).indexOf(shift)} * (100% - 8px) / 3)`,
            width: 'calc((100% - 8px) / 3)',
            borderRadius: 10,
            background: sc.bg,
            transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease',
          }}
        />
        {(['am', 'pm', 'total'] as Shift[]).map((s) => {
          const c = SHIFT_COLOR[s][isDark ? 'night' : 'day']
          const active = shift === s
          return (
            <button
              key={s}
              onClick={() => setShift(s)}
              style={{
                flex: 1, position: 'relative', zIndex: 10,
                padding: '8px 0',
                fontSize: 12, fontWeight: 600, textAlign: 'center' as const,
                cursor: 'pointer', userSelect: 'none' as const, border: 'none', background: 'none',
                color: active ? c.text : isDark ? '#8878A8' : '#A89684',
                transition: 'color 0.3s ease',
                borderRadius: 10,
              }}
            >
              {s === 'am' ? 'Lunch (AM)' : s === 'pm' ? 'Dinner (PM)' : 'Total (All Day)'}
            </button>
          )
        })}
      </div>

      {/* ── Grid (stat + nav cards) ── */}
      <div className="grid grid-cols-3 gap-3">

          {/* ── Row 1: Stat cards ── */}
          <div className={statCls}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-xs text-gray-500">{lang === 'th' ? 'ยอดวันนี้' : "Today's Sales"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: sc.badge, color: sc.text }}>{shiftLabel}</span>
            </div>
            <span className="text-lg font-bold text-gray-900">
              {sales != null ? `$${sales.toLocaleString()}` : '—'}
            </span>
            <span className="text-xs text-gray-400">
              {shift === 'am' ? 'Lunch' : shift === 'pm' ? 'Dinner' : lang === 'th' ? 'ทั้งวัน' : 'All day'}
            </span>
          </div>

          <div className={statCls}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-xs text-gray-500">{lang === 'th' ? 'พนักงาน' : 'Active Staff'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: sc.badge, color: sc.text }}>{shiftLabel}</span>
            </div>
            <span className="text-lg font-bold text-gray-900">{staff ?? '—'}</span>
            {pos ? (
              <div className="flex gap-1 flex-wrap mt-1">
                {pos.front   > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">F·{pos.front}</span>}
                {pos.kitchen > 0 && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">K·{pos.kitchen}</span>}
                {pos.home    > 0 && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full font-medium">H·{pos.home}</span>}
              </div>
            ) : (
              <span className="text-xs text-gray-400">{lang === 'th' ? 'ตามตาราง' : 'from schedule'}</span>
            )}
          </div>

          <div className={statCls}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-xs text-gray-500">{lang === 'th' ? 'ออเดอร์' : "Today's Orders"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: sc.badge, color: sc.text }}>{shiftLabel}</span>
            </div>
            <span className="text-lg font-bold text-gray-900">{bills ?? '—'}</span>
            <span className="text-xs text-gray-400">{lang === 'th' ? 'จำนวน Bill' : 'total bills'}</span>
          </div>

          {/* ── Rows 2–3: Nav cards ── */}
          {NAV_ITEMS.map((item) => {
            const locked = item.ownerOnly && session.role !== 'owner'
            const iconBg = ICON_COLOR[item.key][isDark ? 'night' : 'day']
            const inner = (
              <>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm"
                  style={{ background: iconBg }}>
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
                <div key={item.href}
                  className="relative flex flex-col items-start gap-2 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm cursor-not-allowed select-none">
                  {inner}
                  <span className="absolute top-2 right-2 text-sm">🔒</span>
                </div>
              )
            }
            return (
              <Link key={item.href} href={`/${shopCode}/${item.href}`}
                className="flex flex-col items-start gap-2 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md active:scale-95 transition-all">
                {inner}
              </Link>
            )
          })}

      </div>

      {/* ── Role buttons — full width (no left offset) ── */}
      {session.role === 'staff' && (
        <button onClick={() => setShowManagerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: isDark ? 'linear-gradient(135deg, #6A3870 0%, #8A4850 100%)' : 'linear-gradient(135deg, #E8A888 0%, #C87060 100%)' }}>
          {tr.manager_mode_btn}
        </button>
      )}

      {(session.role === 'staff' || session.role === 'manager') && (
        <button onClick={() => setShowOwnerModal(true)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: isDark ? 'linear-gradient(135deg, #483878 0%, #6A4858 100%)' : 'linear-gradient(135deg, #A08060 0%, #785040 100%)' }}>
          👑 {lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
        </button>
      )}

      {(session.role === 'manager' || session.role === 'owner') && (
        <Link href={`/${shopCode}/config`}
          className="w-full block text-center py-3 rounded-2xl text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer">
          {tr.delivery_settings}
        </Link>
      )}

      {showManagerModal && (
        <ElevateModal onClose={() => setShowManagerModal(false)}
          title={tr.manager_modal_title} desc={tr.manager_modal_desc}
          placeholder="Manager Password" cancelLabel={tr.cancel}
          action={elevateToManagerAction}
          enterStyle={{ background: isDark ? 'linear-gradient(135deg, #6A3870 0%, #8A4850 100%)' : 'linear-gradient(135deg, #E8A888 0%, #C87060 100%)' }} />
      )}
      {showOwnerModal && (
        <ElevateModal onClose={() => setShowOwnerModal(false)}
          title={lang === 'th' ? 'เข้าสู่โหมด Owner' : 'Enter Owner Mode'}
          desc={lang === 'th' ? 'กรอก Owner Password' : 'Enter your Owner Password'}
          placeholder="Owner Password" cancelLabel={tr.cancel}
          action={elevateToOwnerAction}
          enterStyle={{ background: isDark ? 'linear-gradient(135deg, #483878 0%, #6A4858 100%)' : 'linear-gradient(135deg, #A08060 0%, #785040 100%)' }} />
      )}
    </div>
  )
}
