'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type {
  Employee,
  TimeRecord,
  DeliveryTrip,
  RevenueEntry,
  ExpenseEntry,
  DailyNote,
  MealRevenue,
} from '@/lib/types'
import { getSummaryData, getSummaryDataAll, saveDailyNote, syncReportSheets, hideReportSheets, saveExpenseEntry, syncSumSheet, getAllExpenses, getCashReportAll, saveCashReportWeek, getWageWeekSummary } from './actions'
import type { CashReportRow, WageWeekSummary } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

type Pov = 'daily' | 'weekly' | 'monthly'
type Shift = 'am' | 'pm' | 'total'


function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}


function addMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  })
}

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`,
  )
}

function dayPovLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${dayNames[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
}

function addDaysIso(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function fmtIsoDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(d)}/${parseInt(m)}/${y}`
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDaysIso(dateStr, diff)
}

function weekPovLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(weekStart + 'T00:00:00')
  end.setDate(end.getDate() + 6)
  const fmtDate = (dt: Date) => `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  return `Week ${fmtDate(start)} – ${fmtDate(end)}`
}

function monthPovLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${monthNames[m - 1]} ${y}`
}

function weekPovLabelSafe(weekStart: string): string {
  return `Week ${fmtIsoDate(weekStart)} - ${fmtIsoDate(addDaysIso(weekStart, 6))}`
}

interface DaySummary {
  date: string
  // full day (lunch + dinner)
  netSales: number
  onlineOrders: number
  totalSale: number
  totalEftpos: number
  cashRevenue: number
  cashExpense: number
  cashLeave: number
  labor: number
  lunchLabor: number
  dinnerLabor: number
  // lunch only
  lunchSale: number
  lunchEftpos: number
  lunchOnline: number
  lunchCash: number
  // dinner only
  dinnerSale: number
  dinnerEftpos: number
  dinnerOnline: number
  dinnerCash: number
  note: string
  hasData: boolean
}

interface Totals {
  netSales: number
  onlineOrders: number
  totalSale: number
  totalEftpos: number
  cashRevenue: number
  cashExpense: number
  cashLeave: number
  labor: number
}

interface WeekGroup {
  weekStart: string
  days: DaySummary[]
  totals: Totals
}

function sumTotals(rows: DaySummary[]): Totals {
  return rows.reduce(
    (acc, d) => ({
      netSales: acc.netSales + d.netSales,
      onlineOrders: acc.onlineOrders + d.onlineOrders,
      totalSale: acc.totalSale + d.totalSale,
      totalEftpos: acc.totalEftpos + d.totalEftpos,
      cashRevenue: acc.cashRevenue + d.cashRevenue,
      cashExpense: acc.cashExpense + d.cashExpense,
      cashLeave: acc.cashLeave + d.cashLeave,
      labor: acc.labor + d.labor,
    }),
    { netSales: 0, onlineOrders: 0, totalSale: 0, totalEftpos: 0, cashRevenue: 0, cashExpense: 0, cashLeave: 0, labor: 0 },
  )
}

function groupByWeek(rows: DaySummary[]): WeekGroup[] {
  const map = new Map<string, DaySummary[]>()
  for (const row of rows) {
    const ws = getWeekStart(row.date)
    if (!map.has(ws)) map.set(ws, [])
    map.get(ws)!.push(row)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, days]) => ({ weekStart, days, totals: sumTotals(days) }))
}

function mealTotal(m: MealRevenue): number {
  if (m.totalSale > 0) return m.totalSale
  return m.eftpos + m.lfyOnline + m.uberOnline + m.doorDash + (m.cashSale ?? 0)
}

function mealCreditForSum(m: MealRevenue): number {
  return m.eftpos + m.lfyOnline + m.uberOnline + m.doorDash
}

function mealCashForSum(m: MealRevenue): number {
  return mealTotal(m) - mealCreditForSum(m)
}

function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
}

function getWeekCashSalesFromSumLogic(weekStart: string, revenue: RevenueEntry[]): number {
  const weekDates = getWeekDates(weekStart)
  const weekRevenue = revenue.filter((e) => weekDates.includes(e.date))
  return weekDates.reduce((sum, date) => {
    const rev = weekRevenue.find((e) => e.date === date)
    if (!rev) return sum
    return sum + mealCashForSum(rev.lunch) + mealCashForSum(rev.dinner)
  }, 0)
}

function calcDay(
  date: string,
  employees: Employee[],
  timeRecords: TimeRecord[],
  deliveryTrips: DeliveryTrip[],
  revenue: RevenueEntry[],
  expenses: ExpenseEntry[],
  notes: DailyNote[],
): DaySummary {
  const dayRevenue = revenue.filter((e) => e.date === date)
  const dayExpenses = expenses.filter((e) => e.date === date)
  const dayRecords = timeRecords.filter((r) => r.date === date)
  const dayTrips = deliveryTrips.filter((t) => t.date === date)
  const note = notes.find((n) => n.date === date)?.note ?? ''

  const totalSale = dayRevenue.reduce((s, e) => s + mealTotal(e.lunch) + mealTotal(e.dinner), 0)
  const totalEftpos = dayRevenue.reduce((s, e) => s + e.lunch.eftpos + e.dinner.eftpos, 0)
  const onlineOrders = dayRevenue.reduce(
    (s, e) => s + e.lunch.lfyOnline + e.lunch.uberOnline + e.lunch.doorDash
              + e.dinner.lfyOnline + e.dinner.uberOnline + e.dinner.doorDash, 0)
  const netSales = totalSale - onlineOrders
  const cashRevenue = dayRevenue.reduce(
    (s, e) =>
      s + (mealTotal(e.lunch) - e.lunch.eftpos - e.lunch.lfyOnline - e.lunch.uberOnline - e.lunch.doorDash)
        + (mealTotal(e.dinner) - e.dinner.eftpos - e.dinner.lfyOnline - e.dinner.uberOnline - e.dinner.doorDash),
    0,
  )

  const cashExpense = dayExpenses
    .filter((e) => e.paymentMethod === 'Cash')
    .reduce((s, e) => s + e.total, 0)

  let staffLunchLabor = 0, staffDinnerLabor = 0
  employees.filter((e) => !e.positions.includes('Home')).forEach((emp) => {
    const rec = dayRecords.find((r) => r.employeeId === emp.id)
    if (!rec) return
    const h = emp.hourlyWage ?? 0
    if (rec.morning > 0) staffLunchLabor  += emp.wageLunch  ?? h * rec.morning
    if (rec.evening > 0) staffDinnerLabor += emp.wageDinner ?? h * rec.evening
  })
  const deliveryLabor = dayTrips.reduce((s, t) => s + t.fee, 0)
  const lunchExtra  = dayRevenue.reduce((s, e) => s + (e.lunchFrontExtra ?? 0)  + (e.lunchKitchenExtra ?? 0),  0)
  const dinnerExtra = dayRevenue.reduce((s, e) => s + (e.dinnerFrontExtra ?? 0) + (e.dinnerKitchenExtra ?? 0) + (e.frontExtra ?? 0) + (e.kitchenExtra ?? 0), 0)
  const lunchLabor  = staffLunchLabor  + lunchExtra
  const dinnerLabor = staffDinnerLabor + dinnerExtra
  const labor = lunchLabor + dinnerLabor + deliveryLabor

  const cashLeave = cashRevenue - cashExpense - labor

  const hasData =
    totalSale > 0 || dayRevenue.some(e => mealTotal(e.lunch) > 0 || mealTotal(e.dinner) > 0) || dayExpenses.length > 0 || labor > 0 || note !== ''

  // Per-meal breakdowns
  const lunchSale   = dayRevenue.reduce((s, e) => s + mealTotal(e.lunch), 0)
  const lunchEftpos = dayRevenue.reduce((s, e) => s + e.lunch.eftpos, 0)
  const lunchOnline = dayRevenue.reduce((s, e) => s + e.lunch.lfyOnline + e.lunch.uberOnline + e.lunch.doorDash, 0)
  const lunchCash   = dayRevenue.reduce((s, e) => s + (mealTotal(e.lunch) - e.lunch.eftpos - e.lunch.lfyOnline - e.lunch.uberOnline - e.lunch.doorDash), 0)
  const dinnerSale   = dayRevenue.reduce((s, e) => s + mealTotal(e.dinner), 0)
  const dinnerEftpos = dayRevenue.reduce((s, e) => s + e.dinner.eftpos, 0)
  const dinnerOnline = dayRevenue.reduce((s, e) => s + e.dinner.lfyOnline + e.dinner.uberOnline + e.dinner.doorDash, 0)
  const dinnerCash   = dayRevenue.reduce((s, e) => s + (mealTotal(e.dinner) - e.dinner.eftpos - e.dinner.lfyOnline - e.dinner.uberOnline - e.dinner.doorDash), 0)

  return {
    date, netSales, onlineOrders, totalSale, totalEftpos, cashRevenue, cashExpense, cashLeave, labor,
    lunchLabor, dinnerLabor,
    lunchSale, lunchEftpos, lunchOnline, lunchCash,
    dinnerSale, dinnerEftpos, dinnerOnline, dinnerCash,
    note, hasData,
  }
}

// Returns display values for a day based on the selected shift
function getDayDisplay(d: DaySummary, shift: Shift) {
  let totalSale: number, totalEftpos: number, onlineOrders: number, cashRevenue: number
  if (shift === 'am') {
    totalSale = d.lunchSale; totalEftpos = d.lunchEftpos; onlineOrders = d.lunchOnline; cashRevenue = d.lunchCash
  } else if (shift === 'pm') {
    totalSale = d.dinnerSale; totalEftpos = d.dinnerEftpos; onlineOrders = d.dinnerOnline; cashRevenue = d.dinnerCash
  } else {
    totalSale = d.totalSale; totalEftpos = d.totalEftpos; onlineOrders = d.onlineOrders; cashRevenue = d.cashRevenue
  }
  const netSales = totalSale - onlineOrders
  const labor = shift === 'am' ? d.lunchLabor : shift === 'pm' ? d.dinnerLabor : d.labor
  const cashLeave = cashRevenue - d.cashExpense - labor
  return { totalSale, totalEftpos, onlineOrders, netSales, cashRevenue, cashExpense: d.cashExpense, labor, cashLeave }
}

function fmt(n: number): string {
  return n.toLocaleString()
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function RevenueExpenseChart({
  rows, weekGroups, allRevenue, allExpenses, shift, pov,
}: {
  rows: DaySummary[]
  weekGroups: WeekGroup[]
  allRevenue: RevenueEntry[]
  allExpenses: ExpenseEntry[]
  shift: Shift
  pov: Pov
}) {
  const fmtY = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)

  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const data = pov === 'daily'
    ? rows.map((d) => {
        const dv = getDayDisplay(d, shift)
        return { label: String(parseInt(d.date.split('-')[2])), dayOfWeek: DOW_SHORT[new Date(d.date + 'T00:00:00Z').getUTCDay()], revenue: dv.totalSale, expense: dv.cashExpense }
      })
    : pov === 'weekly'
    ? weekGroups.map((wg, i) => {
        const wt = wg.days.reduce(
          (acc, d) => {
            const dv = getDayDisplay(d, shift)
            return { revenue: acc.revenue + dv.totalSale, expense: acc.expense + dv.cashExpense }
          },
          { revenue: 0, expense: 0 },
        )
        const startDay = parseInt(wg.weekStart.split('-')[2])
        return { label: `W${i + 1} (${startDay})`, dayOfWeek: undefined as string | undefined, revenue: wt.revenue, expense: wt.expense }
      })
    : (() => {
        // Monthly: one point per month from all data
        const monthMap = new Map<string, { revenue: number; expense: number }>()
        for (const r of allRevenue) {
          const m = r.date.slice(0, 7)
          const prev = monthMap.get(m) ?? { revenue: 0, expense: 0 }
          monthMap.set(m, { ...prev, revenue: prev.revenue + mealTotal(r.lunch) + mealTotal(r.dinner) })
        }
        for (const e of allExpenses) {
          const m = e.date.slice(0, 7)
          const prev = monthMap.get(m) ?? { revenue: 0, expense: 0 }
          if (e.paymentMethod === 'Cash')
            monthMap.set(m, { ...prev, expense: prev.expense + e.total })
        }
        return [...monthMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([m, v]) => {
            const [, mm] = m.split('-')
            return { label: MONTH_SHORT[parseInt(mm) - 1], dayOfWeek: undefined as string | undefined, revenue: v.revenue, expense: v.expense }
          })
      })()

  if (data.length < 2) return null

  const W = 360, H = 290
  const padL = 52, padR = 16, padT = 30, padB = 50
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const maxVal = Math.max(...data.flatMap((d) => [d.revenue, d.expense]), 1)
  const niceMax = Math.ceil(maxVal / 1000) * 1000 || 1000
  const xScale = (i: number) => padL + (i / (data.length - 1)) * chartW
  const yScale = (v: number) => padT + chartH - (v / niceMax) * chartH

  const makePath = (key: 'revenue' | 'expense') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d[key]).toFixed(1)}`).join(' ')

  const makeArea = (key: 'revenue' | 'expense') => {
    const base = (padT + chartH).toFixed(1)
    return `${makePath(key)} L${xScale(data.length - 1).toFixed(1)},${base} L${xScale(0).toFixed(1)},${base} Z`
  }

  const yTicks = [0, Math.round(niceMax / 4), Math.round(niceMax / 2), Math.round((niceMax * 3) / 4), niceMax]
  const xStep = data.length > 20 ? 7 : data.length > 14 ? 5 : data.length > 7 ? 3 : 1

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-700">Revenue vs Expenses</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.75 bg-green-500 rounded-full" />
            <span className="text-xs text-gray-500 font-medium">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.75 bg-red-400 rounded-full" />
            <span className="text-xs text-gray-500 font-medium">Expenses</span>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 290 }}>
        <defs>
          <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Axis labels */}
        <text x={10} y={padT + chartH / 2} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif" transform={`rotate(-90 10 ${padT + chartH / 2})`}>Amount ($)</text>
        <text x={padL + chartW / 2} y={H - 1} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
          {pov === 'daily' ? 'Date' : pov === 'weekly' ? 'Week' : 'Month'}
        </text>

        {/* Horizontal grid lines + Y labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL} y1={yScale(v)} x2={padL + chartW} y2={yScale(v)}
              stroke={v === 0 ? '#e5e7eb' : '#f3f4f6'} strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text x={padL - 7} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="sans-serif">
              {fmtY(v)}
            </text>
          </g>
        ))}

        {/* Area fills */}
        <path d={makeArea('revenue')} fill="url(#gradGreen)" />
        <path d={makeArea('expense')} fill="url(#gradRed)" />

        {/* Lines */}
        <path d={makePath('revenue')} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={makePath('expense')} fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots with white ring + value labels */}
        {data.map((d, i) => {
          const cx = xScale(i)
          const cyR = yScale(d.revenue)
          const cyE = yScale(d.expense)
          const labelR = fmtY(d.revenue)
          const labelE = fmtY(d.expense)
          // Revenue label: above dot; Expense label: below dot
          const revLabelY = cyR - 10
          const expLabelY = cyE + 20
          return (
            <g key={i}>
              <circle cx={cx} cy={cyR} r="4" fill="white" stroke="#22c55e" strokeWidth="2" />
              <circle cx={cx} cy={cyE} r="4" fill="white" stroke="#f87171" strokeWidth="2" />
              <text x={cx} y={revLabelY} textAnchor="middle" fontSize="12" fill="#16a34a" fontWeight="700" fontFamily="sans-serif">{labelR}</text>
              <text x={cx} y={expLabelY} textAnchor="middle" fontSize="12" fill="#ef4444" fontWeight="700" fontFamily="sans-serif">{labelE}</text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xStep !== 0 && i !== data.length - 1) return null
          return (
            <g key={i}>
              <text x={xScale(i)} y={H - (d.dayOfWeek ? 20 : 8)} textAnchor="middle" fontSize="10" fill="#9ca3af" fontFamily="sans-serif">
                {d.label}
              </text>
              {d.dayOfWeek && (
                <text x={xScale(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
                  {d.dayOfWeek}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LunchDinnerBarChart({
  rows, weekGroups, allRevenue, shift, pov,
}: {
  rows: DaySummary[]
  weekGroups: WeekGroup[]
  allRevenue: RevenueEntry[]
  shift: Shift
  pov: Pov
}) {
  const fmtY = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(Math.round(v))

  const DOW_SHORT2 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const data: { label: string; dayOfWeek?: string; lunch: number; dinner: number }[] =
    pov === 'daily'
      ? rows.map((d) => ({
          label: String(parseInt(d.date.split('-')[2])),
          dayOfWeek: DOW_SHORT2[new Date(d.date + 'T00:00:00Z').getUTCDay()],
          lunch: d.lunchSale,
          dinner: d.dinnerSale,
        }))
      : pov === 'weekly'
      ? weekGroups.map((wg, i) => ({
          label: `W${i + 1}`,
          lunch: wg.days.reduce((s, d) => s + d.lunchSale, 0),
          dinner: wg.days.reduce((s, d) => s + d.dinnerSale, 0),
        }))
      : (() => {
          const monthMap = new Map<string, { lunch: number; dinner: number }>()
          for (const r of allRevenue) {
            const m = r.date.slice(0, 7)
            const prev = monthMap.get(m) ?? { lunch: 0, dinner: 0 }
            monthMap.set(m, { lunch: prev.lunch + mealTotal(r.lunch), dinner: prev.dinner + mealTotal(r.dinner) })
          }
          return [...monthMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([m, v]) => {
              const [, mm] = m.split('-')
              return { label: MONTH_SHORT[parseInt(mm) - 1], lunch: v.lunch, dinner: v.dinner }
            })
        })()

  if (data.length === 0) return null

  const W = 360, H = 240
  const padL = 52, padR = 16, padT = 24, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const n = data.length
  const barW = Math.max(4, Math.min(28, (chartW / n) * 0.65))
  const gap = chartW / n

  const maxVal = Math.max(...data.map((d) =>
    shift === 'am' ? d.lunch : shift === 'pm' ? d.dinner : d.lunch + d.dinner
  ), 1)
  const niceMax = Math.ceil(maxVal / 500) * 500 || 500
  const yScale = (v: number) => padT + chartH - (v / niceMax) * chartH
  const yH = (v: number) => (v / niceMax) * chartH

  const yTicks = [0, Math.round(niceMax / 2), niceMax]
  const xStep = n > 20 ? 7 : n > 14 ? 5 : n > 7 ? 3 : 1

  const YELLOW = '#f59e0b'
  const BLUE   = '#60a5fa'
  const YELLOW_LABEL = '#92400e'
  const BLUE_LABEL   = '#1e40af'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 pt-4 pb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-700">Lunch / Dinner Revenue</span>
        <div className="flex items-center gap-4">
          {shift !== 'pm'  && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: YELLOW }} /><span className="text-xs text-gray-500">Lunch</span></div>}
          {shift !== 'am'  && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: BLUE }}   /><span className="text-xs text-gray-500">Dinner</span></div>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Axis labels */}
        <text x={10} y={padT + chartH / 2} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif" transform={`rotate(-90 10 ${padT + chartH / 2})`}>Amount ($)</text>
        <text x={padL + chartW / 2} y={H - 1} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
          {pov === 'daily' ? 'Date' : pov === 'weekly' ? 'Week' : 'Month'}
        </text>

        {/* Y grid + labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={yScale(v)} x2={padL + chartW} y2={yScale(v)} stroke={v === 0 ? '#e5e7eb' : '#f3f4f6'} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={padL - 6} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">{fmtY(v)}</text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = padL + i * gap + gap / 2
          const x = cx - barW / 2

          const lunchH = shift !== 'pm' ? yH(d.lunch)  : 0
          const dinnerH = shift !== 'am' ? yH(d.dinner) : 0
          const baseY = padT + chartH

          return (
            <g key={i}>
              {/* Lunch bar (bottom) */}
              {lunchH > 0 && (
                <>
                  <rect x={x} y={baseY - lunchH} width={barW} height={lunchH} fill={YELLOW} rx="2" />
                  {lunchH > 14 && (
                    <text x={cx} y={baseY - lunchH / 2 + 4} textAnchor="middle" fontSize="8" fill={YELLOW_LABEL} fontWeight="700" fontFamily="sans-serif">
                      {fmtY(d.lunch)}
                    </text>
                  )}
                </>
              )}
              {/* Dinner bar (top) */}
              {dinnerH > 0 && (
                <>
                  <rect x={x} y={baseY - lunchH - dinnerH} width={barW} height={dinnerH} fill={BLUE} rx="2" />
                  {dinnerH > 14 && (
                    <text x={cx} y={baseY - lunchH - dinnerH / 2 + 4} textAnchor="middle" fontSize="8" fill={BLUE_LABEL} fontWeight="700" fontFamily="sans-serif">
                      {fmtY(d.dinner)}
                    </text>
                  )}
                </>
              )}
              {/* Total label above bar */}
              <text x={cx} y={baseY - lunchH - dinnerH - 4} textAnchor="middle" fontSize="9" fill="#374151" fontWeight="600" fontFamily="sans-serif">
                {fmtY((shift === 'am' ? d.lunch : shift === 'pm' ? d.dinner : d.lunch + d.dinner))}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xStep !== 0 && i !== n - 1) return null
          const bx = padL + i * gap + gap / 2
          return (
            <g key={i}>
              <text x={bx} y={H - (d.dayOfWeek ? 18 : 6)} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
                {d.label}
              </text>
              {d.dayOfWeek && (
                <text x={bx} y={H - 6} textAnchor="middle" fontSize="8" fill="#9ca3af" fontFamily="sans-serif">
                  {d.dayOfWeek}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function DonutChart({ netSales, onlineOrders }: { netSales: number; onlineOrders: number }) {
  const total = netSales + onlineOrders
  if (total <= 0) return null

  const r = 32, cx = 44, cy = 44
  const C = 2 * Math.PI * r
  const dineLen = (netSales / total) * C
  const delivLen = (onlineOrders / total) * C
  const dinePct = Math.round((netSales / total) * 100)

  return (
    <div className="flex flex-col items-center shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={13} />
        {dineLen > 0 && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke="#22c55e" strokeWidth={13}
            strokeDasharray={`${dineLen} ${C}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        {delivLen > 0 && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke="#f97316" strokeWidth={13}
            strokeDasharray={`${delivLen} ${C}`}
            strokeDashoffset={C - dineLen}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#374151" fontFamily="sans-serif">
          {dinePct}%
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">
          dine-in
        </text>
      </svg>
      <div className="flex flex-col gap-0.5 mt-0.5">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[9px] text-gray-500">Dine-in</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span className="text-[9px] text-gray-500">Delivery</span>
        </div>
      </div>
    </div>
  )
}

function TotalsGrid({ totals }: { totals: Totals }) {
  const { lang } = useShop()
  const tr = translations[lang]
  return (
    <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-100">
      {[
        { label: 'Total sale', value: totals.totalSale, color: 'text-brand-gold' },
        { label: 'Total eftpos', value: totals.totalEftpos, color: 'text-blue-600' },
        { label: 'Net sales', value: totals.netSales, color: 'text-gray-800' },
        { label: 'Online Orders', value: totals.onlineOrders, color: 'text-gray-800' },
        { label: 'Cash Expense', value: totals.cashExpense, color: 'text-red-500' },
        { label: tr.cash_leave_day, value: totals.cashLeave, color: totals.cashLeave >= 0 ? 'text-green-600' : 'text-red-600' },
      ].map(({ label, value, color }) => (
        <div key={label} className="p-3">
          <div className="text-xs text-gray-400 mb-0.5">{label}</div>
          <div className={`text-sm font-bold ${color}`}>{fmt(value)} $</div>
        </div>
      ))}
    </div>
  )
}

function NoteField({
  shopCode,
  date,
  initialNote,
}: {
  shopCode: string
  date: string
  initialNote: string
}) {
  const { lang } = useShop()
  const tr = translations[lang]
  const [note, setNote] = useState(initialNote)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await saveDailyNote(shopCode, date, note)
      setEditing(false)
    } catch {
      alert(tr.note_fail)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          autoFocus
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setNote(initialNote); setEditing(false) }
          }}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold"
          placeholder={tr.note_placeholder}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-brand-gold text-white px-2 py-1 rounded cursor-pointer disabled:opacity-50"
        >
          {saving ? '...' : tr.save}
        </button>
        <button
          onClick={() => { setNote(initialNote); setEditing(false) }}
          className="text-xs text-gray-400 cursor-pointer"
        >
          {tr.cancel}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 text-left w-full cursor-pointer"
    >
      {note ? (
        <span className="text-xs text-gray-600 italic">📝 {note}</span>
      ) : (
        <span className="text-xs text-gray-300 hover:text-gray-400">{tr.add_note}</span>
      )}
    </button>
  )
}

export default function SummaryView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { lang, session } = useShop()
  const tr = translations[lang]
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  const [month, setMonth] = useState(currentMonth)
  const [pov, setPov] = useState<Pov>('daily')
  const [shift, setShift] = useState<Shift>('total')
  function nextShift() { setShift((s) => s === 'am' ? 'pm' : s === 'pm' ? 'total' : 'am') }
  const [loading, setLoading] = useState(true)
  const [showAllDays, setShowAllDays] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [hiding, setHiding] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [panelExpenses, setPanelExpenses] = useState<ExpenseEntry[]>([])
  const [panelSaving, setPanelSaving] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportData, setReportData] = useState<Record<string, CashReportRow>>({})
  const [wageWeekSummaries, setWageWeekSummaries] = useState<Record<string, WageWeekSummary>>({})
  type ItemEdit = { label: string; amount: string; note: string }
  type WeekEdit = { cashFromBank: string; cashLeftInBag: string; incomeItems: ItemEdit[]; expenseItems: ItemEdit[] }
  const [reportEdits, setReportEdits] = useState<Record<string, WeekEdit>>({})
  const [reportSaving, setReportSaving] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(currentMonth)
  const [calendarAllExp, setCalendarAllExp] = useState<ExpenseEntry[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([])
  const [deliveryTrips, setDeliveryTrips] = useState<DeliveryTrip[]>([])
  const [revenue, setRevenue] = useState<RevenueEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [notes, setNotes] = useState<DailyNote[]>([])
  const [allRevenue, setAllRevenue] = useState<RevenueEntry[]>([])
  const [allExpenses, setAllExpenses] = useState<ExpenseEntry[]>([])

  useEffect(() => {
    setLoading(true)
    setShowAllDays(false)
    getSummaryData(shopCode, month)
      .then(({ employees: emps, timeRecords: trs, deliveryTrips: dts, revenue: rev, expenses: exp, notes: ns }) => {
        setEmployees(emps)
        setTimeRecords(trs)
        setDeliveryTrips(dts)
        setRevenue(rev)
        setExpenses(exp)
        setNotes(ns)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shopCode, month])

  // Sync panel expenses snapshot when panel opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (showExpense) {
      setPanelExpenses([...expenses])
      setCalendarMonth(month)
      getAllExpenses(shopCode).then(setCalendarAllExp).catch(() => {})
    }
  }, [showExpense])

  useEffect(() => {
    if (!showReport) return
    getCashReportAll(shopCode).then((data) => {
      setReportData(data)
      setReportEdits({})
    }).catch(() => {})
  }, [showReport, shopCode])

  useEffect(() => {
    if (pov !== 'monthly') return
    getSummaryDataAll(shopCode)
      .then(({ revenue: rev, expenses: exp }) => {
        setAllRevenue(rev)
        setAllExpenses(exp)
      })
      .catch(console.error)
  }, [shopCode, pov])

  const days = daysInMonth(month)
  const allRows = days.map((date) =>
    calcDay(date, employees, timeRecords, deliveryTrips, revenue, expenses, notes),
  )
  const activeRows = allRows.filter((d) => d.hasData)
  const activeDisplays = activeRows.map((d) => getDayDisplay(d, shift))
  const monthTotals: Totals = activeDisplays.reduce(
    (acc, d) => ({
      netSales:     acc.netSales     + d.netSales,
      onlineOrders: acc.onlineOrders + d.onlineOrders,
      totalSale:    acc.totalSale    + d.totalSale,
      totalEftpos:  acc.totalEftpos  + d.totalEftpos,
      cashRevenue:  acc.cashRevenue  + d.cashRevenue,
      cashExpense:  acc.cashExpense  + d.cashExpense,
      cashLeave:    acc.cashLeave    + d.cashLeave,
      labor:        acc.labor        + d.labor,
    }),
    { netSales: 0, onlineOrders: 0, totalSale: 0, totalEftpos: 0, cashRevenue: 0, cashExpense: 0, cashLeave: 0, labor: 0 },
  )
  const weekGroups = groupByWeek(activeRows)

  // Fetch actual wage cash (Total Wage - TAX - PAID) for each week when Report is open
  useEffect(() => {
    if (!showReport || weekGroups.length === 0) return
    Promise.all(weekGroups.map((wg) => getWageWeekSummary(shopCode, wg.weekStart).then((s) => [wg.weekStart, s] as const)))
      .then((entries) => setWageWeekSummaries(Object.fromEntries(entries)))
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReport, shopCode, weekGroups.length])

  function updatePanelExp<K extends keyof ExpenseEntry>(id: string, key: K, val: ExpenseEntry[K]) {
    setPanelExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, [key]: val } : e)))
  }

  async function handlePanelSave() {
    setPanelSaving(true)
    try {
      const changed = panelExpenses.filter((pe) => {
        const orig = expenses.find((e) => e.id === pe.id)
        return !orig || JSON.stringify(orig) !== JSON.stringify(pe)
      })
      await Promise.all(changed.map((e) => saveExpenseEntry(shopCode, e)))
      setExpenses(panelExpenses)
      syncSumSheet(shopCode).catch(() => {})
    } catch {
      alert('Save failed')
    } finally {
      setPanelSaving(false)
    }
  }

  function toSpecialItems(items: { label: string; amount: string; note: string }[]) {
    return items
      .filter((i) => i.label.trim() || parseFloat(i.amount) > 0)
      .map((i) => ({ label: i.label.trim(), amount: parseFloat(i.amount) || 0, note: i.note.trim() }))
  }

  async function handleReportSave() {
    setReportSaving(true)
    try {
      await Promise.all(
        Object.entries(reportEdits).map(([ws, edit]) => {
          const cfb = Math.max(0, parseFloat(edit.cashFromBank) || 0)
          const clb = edit.cashLeftInBag !== '' ? (parseFloat(edit.cashLeftInBag) || null) : null
          return saveCashReportWeek(shopCode, ws, cfb, clb, toSpecialItems(edit.incomeItems), toSpecialItems(edit.expenseItems))
        })
      )
      setReportData((prev) => {
        const next = { ...prev }
        for (const [ws, edit] of Object.entries(reportEdits)) {
          next[ws] = {
            cashFromBank: Math.max(0, parseFloat(edit.cashFromBank) || 0),
            cashLeftInBag: edit.cashLeftInBag !== '' ? (parseFloat(edit.cashLeftInBag) || null) : null,
            incomeItems: toSpecialItems(edit.incomeItems),
            expenseItems: toSpecialItems(edit.expenseItems),
          }
        }
        return next
      })
      setReportEdits({})
      syncSumSheet(shopCode).catch(() => {})
    } catch {
      alert('Save failed')
    } finally {
      setReportSaving(false)
    }
  }

  function fmtDateShort(dateStr: string): string {
    return fmtIsoDate(dateStr)
  }
  function dayShort(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })
  }
  function addDaysLocal(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }
  const expenseWeekGroups = (() => {
    const source = panelExpenses.length > 0 ? panelExpenses : expenses
    const map = new Map<string, ExpenseEntry[]>()
    for (const e of source) {
      const ws = getWeekStart(e.date)
      if (!map.has(ws)) map.set(ws, [])
      map.get(ws)!.push(e)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ws, entries]) => ({
        weekStart: ws,
        weekEnd: addDaysIso(ws, 6),
        entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)),
        total: entries.reduce((s, e) => s + e.total, 0),
      }))
  })()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.summary_title}</h2>
        <button
          onClick={() => setShowExpense(true)}
          className="text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        >
          Expense
        </button>
        <Link
          href={`/${shopCode}/wage`}
          className="text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        >
          Wage
        </Link>
        <button
          onClick={() => setShowReport(true)}
          className="text-xs px-3 py-1.5 rounded-lg cursor-pointer border transition-colors bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        >
          Report
        </button>
        {session.role === 'owner' && (
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setHiding(true)
                try {
                  await hideReportSheets(shopCode)
                  alert('Internal sheets hidden!')
                } catch (e) {
                  alert('Failed: ' + (e instanceof Error ? e.message : String(e)))
                } finally {
                  setHiding(false)
                }
              }}
              disabled={hiding}
              className="text-xs bg-gray-500 text-white px-3 py-1.5 rounded-lg hover:bg-gray-600 disabled:opacity-50 cursor-pointer"
            >
              {hiding ? 'Hiding...' : 'Hide Sheets'}
            </button>
            <button
              onClick={async () => {
                setSyncing(true)
                try {
                  await syncReportSheets(shopCode)
                  alert('Synced to Google Sheets!')
                } catch (e) {
                  alert('Sync failed: ' + (e instanceof Error ? e.message : String(e)))
                } finally {
                  setSyncing(false)
                }
              }}
              disabled={syncing}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {syncing ? 'Syncing...' : 'Sync Sheets'}
            </button>
          </div>
        )}
      </div>

      {/* Month Nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <button
          onClick={() => setMonth((m) => addMonth(m, -1))}
          className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
        >
          ◀
        </button>
        <span className="text-sm font-semibold text-gray-700">{monthLabel(month, locale)}</span>
        <button
          onClick={() => setMonth((m) => addMonth(m, 1))}
          className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
        >
          ▶
        </button>
      </div>

      {/* POV toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {(['daily', 'weekly', 'monthly'] as Pov[]).map((v) => (
          <button
            key={v}
            onClick={() => setPov(v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              pov === v ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'daily' ? 'Daily' : v === 'weekly' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : (
        <>
          {/* Monthly totals summary card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">
                {pov === 'monthly'
                  ? monthPovLabel(month)
                  : `${tr.summary_total_prefix} ${activeRows.length} ${tr.days_suffix}`}
              </span>
              <button
                onClick={nextShift}
                className={`text-xs px-2 py-0.5 rounded-full font-semibold cursor-pointer ${
                  shift === 'am' ? 'bg-orange-100 text-orange-600' : shift === 'pm' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {shift === 'am' ? '🌞 AM' : shift === 'pm' ? '🌙 PM' : 'Total'}
              </button>
            </div>
            <TotalsGrid totals={monthTotals} />
          </div>

          {/* Revenue vs Expenses chart */}
          {activeRows.length >= 2 && (
            <RevenueExpenseChart
              rows={activeRows}
              weekGroups={weekGroups}
              allRevenue={allRevenue}
              allExpenses={allExpenses}
              shift={shift}
              pov={pov}
            />
          )}

          {/* Lunch / Dinner stacked bar chart */}
          {activeRows.length >= 1 && (
            <LunchDinnerBarChart
              rows={activeRows}
              weekGroups={weekGroups}
              allRevenue={allRevenue}
              shift={shift}
              pov={pov}
            />
          )}

          {/* Per-pov content */}
          {pov === 'monthly' ? null : pov === 'weekly' ? (
            /* Weekly view */
            weekGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data_month}</div>
            ) : (
              <div className="space-y-3">
                {weekGroups.map((wg) => {
                  const wkDisplays = wg.days.map((d) => getDayDisplay(d, shift))
                  const wt = wkDisplays.reduce(
                    (acc, d) => ({
                      netSales: acc.netSales + d.netSales, onlineOrders: acc.onlineOrders + d.onlineOrders,
                      totalSale: acc.totalSale + d.totalSale, totalEftpos: acc.totalEftpos + d.totalEftpos,
                      cashExpense: acc.cashExpense + d.cashExpense, cashLeave: acc.cashLeave + d.cashLeave, labor: acc.labor + d.labor,
                    }),
                    { netSales: 0, onlineOrders: 0, totalSale: 0, totalEftpos: 0, cashExpense: 0, cashLeave: 0, labor: 0 },
                  )
                  return (
                  <div key={wg.weekStart} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">{weekPovLabelSafe(wg.weekStart)}</span>
                      <div className="text-right">
                        <div className="text-sm font-bold text-brand-gold">{fmt(wt.totalSale)} $</div>
                        <div className="text-xs text-gray-400">{wg.days.length} days</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div><span className="text-gray-400">Net sales</span><div className="font-semibold text-gray-700">{fmt(wt.netSales)} $</div></div>
                      <div><span className="text-gray-400">Online Orders</span><div className="font-semibold text-gray-700">{fmt(wt.onlineOrders)} $</div></div>
                      <div><span className="text-gray-400">Total eftpos</span><div className="font-semibold text-blue-600">{fmt(wt.totalEftpos)} $</div></div>
                      <div><span className="text-gray-400">{tr.labor_label}</span><div className="font-semibold text-brand-gold">{fmt(wt.labor)} $</div></div>
                      <div><span className="text-gray-400">Cash Expense</span><div className="font-semibold text-red-500">{fmt(wt.cashExpense)} $</div></div>
                      <div>
                        <span className="text-gray-400">{tr.cash_leave_day}</span>
                        <div className={`font-semibold ${wt.cashLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(wt.cashLeave)} $</div>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            )
          ) : (
            /* Daily view */
            activeRows.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data_month}</div>
            ) : (
              <div className="space-y-3">
                {[...activeRows].reverse().map((d, idx) => {
                  if (!showAllDays && idx > 0) return null
                  const dv = getDayDisplay(d, shift)
                  return (
                  <div key={d.date} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">{dayPovLabel(d.date)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={nextShift}
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold cursor-pointer ${
                            shift === 'am' ? 'bg-orange-100 text-orange-600' : shift === 'pm' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {shift === 'am' ? '🌞 AM' : shift === 'pm' ? '🌙 PM' : 'Total'}
                        </button>
                        <div className="text-right">
                          <div className="text-sm font-bold text-brand-gold">{fmt(dv.totalSale)} $</div>
                          <div className="text-xs text-gray-400">Total sale</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-y-2 text-xs">
                        <div>
                          <span className="text-gray-400">Net sales</span>
                          <div className="font-semibold text-gray-700">{fmt(dv.netSales)} $</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Online Orders</span>
                          <div className="font-semibold text-gray-700">{fmt(dv.onlineOrders)} $</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Total eftpos</span>
                          <div className="font-semibold text-blue-600">{fmt(dv.totalEftpos)} $</div>
                        </div>
                        <div>
                          <span className="text-gray-400">{tr.labor_label}</span>
                          <div className="font-semibold text-brand-gold">{fmt(dv.labor)} $</div>
                        </div>
                        <div>
                          <span className="text-gray-400">Cash Expense</span>
                          <div className="font-semibold text-red-500">{fmt(dv.cashExpense)} $</div>
                        </div>
                        <div>
                          <span className="text-gray-400">{tr.cash_leave_day}</span>
                          <div className={`font-semibold ${dv.cashLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {fmt(dv.cashLeave)} $
                          </div>
                        </div>
                      </div>
                      <DonutChart netSales={dv.netSales} onlineOrders={dv.onlineOrders} />
                    </div>

                    <NoteField shopCode={shopCode} date={d.date} initialNote={d.note} />
                  </div>
                  )
                })}
                {activeRows.length > 1 && (
                  <button
                    onClick={() => setShowAllDays((v) => !v)}
                    className="w-full py-2.5 text-xs text-gray-500 bg-white rounded-xl border border-gray-100 shadow-sm hover:bg-gray-50 cursor-pointer font-medium"
                  >
                    {showAllDays ? '▲ Show less' : `▼ Show more (${activeRows.length - 1} more day${activeRows.length - 1 !== 1 ? 's' : ''})`}
                  </button>
                )}
              </div>
            )
          )}
        </>
      )}

      {/* Report Panel */}
      {showReport && (
        <div className="fixed inset-0 bg-black/40 flex flex-col items-center justify-end z-50">
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">Weekly Cash Report</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReportSave}
                  disabled={reportSaving || Object.keys(reportEdits).length === 0}
                  className="text-xs bg-brand-gold text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {reportSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-xl leading-none">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
              {weekGroups.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No data this month</div>
              ) : [...weekGroups].reverse().map((wg) => {
                const ws = wg.weekStart
                const wt = wg.totals
                const cashSales = getWeekCashSalesFromSumLogic(ws, revenue)
                const weekTotalExp = wg.days.reduce((s, d) => s + expenses.filter((e) => e.date === d.date).reduce((s2, e) => s2 + e.total, 0), 0)
                const wageSummary = wageWeekSummaries[ws]
                const wageCash = wageSummary?.wageCash ?? wt.labor
                const stored = reportData[ws]
                const edit: { cashFromBank: string; cashLeftInBag: string; incomeItems: { label: string; amount: string; note: string }[]; expenseItems: { label: string; amount: string; note: string }[] } = reportEdits[ws] ?? {
                  cashFromBank: String(stored?.cashFromBank ?? 0),
                  cashLeftInBag: stored?.cashLeftInBag != null ? String(stored.cashLeftInBag) : '',
                  incomeItems: stored?.incomeItems?.map((i) => ({ ...i, amount: String(i.amount) })) ?? [],
                  expenseItems: stored?.expenseItems?.map((i) => ({ ...i, amount: String(i.amount) })) ?? [],
                }

                function setEdit(patch: Partial<typeof edit>) {
                  setReportEdits((prev) => ({ ...prev, [ws]: { ...edit, ...patch } }))
                }
                function updateIncomeItem(idx: number, key: 'label' | 'amount' | 'note', val: string) {
                  const next = edit.incomeItems.map((it, i) => i === idx ? { ...it, [key]: val } : it)
                  setEdit({ incomeItems: next })
                }
                function removeIncomeItem(idx: number) {
                  setEdit({ incomeItems: edit.incomeItems.filter((_, i) => i !== idx) })
                }
                function updateExpenseItem(idx: number, key: 'label' | 'amount' | 'note', val: string) {
                  const next = edit.expenseItems.map((it, i) => i === idx ? { ...it, [key]: val } : it)
                  setEdit({ expenseItems: next })
                }
                function removeExpenseItem(idx: number) {
                  setEdit({ expenseItems: edit.expenseItems.filter((_, i) => i !== idx) })
                }

                const incomeTotal = edit.incomeItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                const expenseItemTotal = edit.expenseItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                const fromBank = Math.max(0, parseFloat(edit.cashFromBank) || 0)
                const totalCash = incomeTotal + cashSales + fromBank
                const remaining = totalCash - weekTotalExp - wageCash - expenseItemTotal

                const inputCls = 'border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold'

                return (
                  <div key={ws} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-amber-50 px-3 py-2 border-b border-amber-100">
                      <span className="text-xs font-bold text-amber-700">{weekPovLabelSafe(ws)}</span>
                    </div>
                    <div className="p-3 space-y-2 text-sm">

                      {/* Income special items */}
                      {edit.incomeItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Description"
                            value={item.label}
                            onChange={(e) => updateIncomeItem(idx, 'label', e.target.value)}
                            className={`flex-1 min-w-0 ${inputCls}`}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0"
                            min="0"
                            value={item.amount}
                            onChange={(e) => updateIncomeItem(idx, 'amount', e.target.value)}
                            className={`w-20 text-right ${inputCls}`}
                          />
                          <input
                            type="text"
                            placeholder="Note"
                            value={item.note}
                            onChange={(e) => updateIncomeItem(idx, 'note', e.target.value)}
                            className={`w-20 ${inputCls}`}
                          />
                          <button onClick={() => removeIncomeItem(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer text-base leading-none shrink-0">✕</button>
                        </div>
                      ))}
                      {edit.incomeItems.length < 4 && (
                        <button
                          onClick={() => setEdit({ incomeItems: [...edit.incomeItems, { label: '', amount: '', note: '' }] })}
                          className="text-xs text-green-600 hover:text-green-700 cursor-pointer font-medium"
                        >
                          + Add cash item
                        </button>
                      )}

                      <div className="flex justify-between pt-1">
                        <span className="text-gray-500">Cash Sales</span>
                        <span className="font-semibold text-gray-800">${fmt(cashSales)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">+ Cash from Bank</span>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={edit.cashFromBank}
                            onChange={(e) => setEdit({ cashFromBank: String(Math.max(0, parseFloat(e.target.value) || 0)) })}
                            className={`w-24 text-right ${inputCls}`}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-gray-100 pt-2 text-gray-700">
                        <span>= Total Cash</span>
                        <span>${fmt(totalCash)}</span>
                      </div>

                      {/* Expense special items */}
                      <div className="pt-1 space-y-1">
                        {edit.expenseItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Description"
                              value={item.label}
                              onChange={(e) => updateExpenseItem(idx, 'label', e.target.value)}
                              className={`flex-1 min-w-0 ${inputCls}`}
                            />
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="0"
                              min="0"
                              value={item.amount}
                              onChange={(e) => updateExpenseItem(idx, 'amount', e.target.value)}
                              className={`w-20 text-right ${inputCls}`}
                            />
                            <input
                              type="text"
                              placeholder="Note"
                              value={item.note}
                              onChange={(e) => updateExpenseItem(idx, 'note', e.target.value)}
                              className={`w-20 ${inputCls}`}
                            />
                            <button onClick={() => removeExpenseItem(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer text-base leading-none shrink-0">✕</button>
                          </div>
                        ))}
                        {edit.expenseItems.length < 5 && (
                          <button
                            onClick={() => setEdit({ expenseItems: [...edit.expenseItems, { label: '', amount: '', note: '' }] })}
                            className="text-xs text-red-500 hover:text-red-600 cursor-pointer font-medium"
                          >
                            + Add expense item
                          </button>
                        )}
                      </div>

                      <div className="flex justify-between text-xs text-gray-400">
                        <span>− Expenses</span>
                        <span>${fmt(weekTotalExp)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>− Wages {wageSummary ? `(${fmt(wageSummary.totalWage)}−${fmt(wageSummary.tax + wageSummary.paid)})` : ''}</span>
                        <span>${fmt(wageCash)}</span>
                      </div>
                      <div className={`flex justify-between font-bold border-t border-gray-100 pt-2 ${remaining >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        <span>= Remaining</span>
                        <span>${fmt(remaining)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                        <span className="text-gray-700 font-medium">Cash Left in Bag</span>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={edit.cashLeftInBag}
                            onChange={(e) => setEdit({ cashLeftInBag: e.target.value })}
                            placeholder="0"
                            className={`w-24 text-right ${inputCls}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Expense Panel */}
      {showExpense && (
        <div className="fixed inset-0 bg-black/40 flex flex-col items-center justify-end z-50">
          <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">Expenses — {monthLabel(month, locale)}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePanelSave}
                  disabled={panelSaving}
                  className="text-xs bg-brand-gold text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {panelSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowExpense(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-xl leading-none">✕</button>
              </div>
            </div>
            {/* Content */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
              {/* Due Date Calendar */}
              {(() => {
                const [cy, cm] = calendarMonth.split('-').map(Number)
                const daysCount = new Date(cy, cm, 0).getDate()
                const firstDow = new Date(cy, cm - 1, 1).getDay()
                const startOffset = firstDow === 0 ? 6 : firstDow - 1
                // Use all-expenses if loaded, else fall back to panel expenses
                const sourceExp = calendarAllExp.length > 0
                  ? calendarAllExp.map((e) => panelExpenses.find((p) => p.id === e.id) ?? e)
                  : (panelExpenses.length > 0 ? panelExpenses : expenses)
                const dueMap = new Map<string, ExpenseEntry[]>()
                for (const e of sourceExp) {
                  if (e.dueDate && !e.paid) {
                    if (!dueMap.has(e.dueDate)) dueMap.set(e.dueDate, [])
                    dueMap.get(e.dueDate)!.push(e)
                  }
                }
                const todayStr = new Date().toISOString().split('T')[0]
                const cells: (number | null)[] = [
                  ...Array.from({ length: startOffset }, () => null as null),
                  ...Array.from({ length: daysCount }, (_, i) => i + 1),
                ]
                while (cells.length % 7 !== 0) cells.push(null)
                return (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-amber-50 px-3 py-2 border-b border-amber-100 flex items-center justify-between">
                      <button
                        onClick={() => setCalendarMonth((m) => addMonth(m, -1))}
                        className="text-amber-600 hover:text-amber-800 w-7 h-7 flex items-center justify-center rounded cursor-pointer text-base leading-none"
                      >◀</button>
                      <span className="text-xs font-bold text-amber-700">{monthLabel(calendarMonth, locale)} — Due Dates</span>
                      <button
                        onClick={() => setCalendarMonth((m) => addMonth(m, 1))}
                        className="text-amber-600 hover:text-amber-800 w-7 h-7 flex items-center justify-center rounded cursor-pointer text-base leading-none"
                      >▶</button>
                    </div>
                    <div className="p-2">
                      <div className="grid grid-cols-7 text-center mb-1">
                        {['Mo','Tu','We','Th','Fr','Sa','Su'].map((d) => (
                          <div key={d} className="text-[10px] font-semibold text-gray-400">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-y-1">
                        {cells.map((day, idx) => {
                          if (day === null) return <div key={idx} />
                          const dateStr = `${calendarMonth}-${String(day).padStart(2, '0')}`
                          const due = dueMap.get(dateStr) ?? []
                          const isToday = dateStr === todayStr
                          const hasDue = due.length > 0
                          return (
                            <div
                              key={idx}
                              className={`rounded text-center px-0.5 py-0.5 ${isToday ? 'ring-1 ring-brand-gold' : ''} ${hasDue ? 'bg-red-50' : ''}`}
                            >
                              <div className={`text-[11px] font-semibold leading-tight ${isToday ? 'text-brand-gold' : hasDue ? 'text-red-600' : 'text-gray-600'}`}>{day}</div>
                              {due.map((e, i) => (
                                <div key={i} className="text-[8px] leading-tight truncate text-red-600 font-semibold">
                                  {e.supplier}
                                  <span className="text-gray-500 font-normal"> · {e.paymentMethod === 'Online Banking' ? 'Online' : e.paymentMethod === 'Credit Card' ? 'CC' : 'Cash'} ${e.total.toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Week tables */}
              {expenseWeekGroups.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No expenses this month</div>
              ) : [...expenseWeekGroups].reverse().map((wg) => (
                <div key={wg.weekStart}>
                  <div className="bg-yellow-200 px-3 py-1.5 text-xs font-bold text-gray-800 rounded-t">
                    EXPENSES {fmtDateShort(wg.weekStart)} to {fmtDateShort(wg.weekEnd)}
                  </div>
                  <div className="border border-gray-200 rounded-b overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-left">
                          <th className="px-2 py-1.5 font-medium">Day</th>
                          <th className="px-2 py-1.5 font-medium">Date</th>
                          <th className="px-2 py-1.5 font-medium">By</th>
                          <th className="px-2 py-1.5 font-medium">Description</th>
                          <th className="px-2 py-1.5 font-medium text-right">$</th>
                          <th className="px-2 py-1.5 font-medium text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wg.entries.map((origEntry, i) => {
                          const e = panelExpenses.find((p) => p.id === origEntry.id) ?? origEntry
                          const showDate = i === 0 || wg.entries[i - 1].date !== origEntry.date
                          return (
                            <tr key={e.id} className="border-t border-gray-100">
                              <td className="px-2 py-2 text-gray-500">{showDate ? dayShort(e.date) : ''}</td>
                              <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{showDate ? fmtDateShort(e.date) : ''}</td>
                              <td className="px-2 py-2 text-gray-400">{e.filledBy ?? ''}</td>
                              <td className="px-2 py-2 font-medium text-gray-800">
                                <div>{e.supplier}</div>
                                {e.dueDate && <div className="text-[10px] text-gray-400">Due: {fmtDateShort(e.dueDate)}</div>}
                              </td>
                              <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{e.total.toFixed(2)}</td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => updatePanelExp(e.id, 'paid', !e.paid)}
                                  className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold cursor-pointer ${e.paid ? 'bg-green-500' : 'bg-red-500'}`}
                                >
                                  {e.paid ? 'Paid' : 'Unpaid'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 bg-green-50">
                          <td colSpan={4} className="px-2 py-2 font-bold text-gray-700 text-right">Total Expenses</td>
                          <td className="px-2 py-2 text-right font-bold text-gray-900">
                            {wg.entries.reduce((s, origEntry) => {
                              const e = panelExpenses.find((p) => p.id === origEntry.id) ?? origEntry
                              return s + e.total
                            }, 0).toFixed(2)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
