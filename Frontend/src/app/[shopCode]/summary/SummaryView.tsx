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
} from '@/lib/types'
import { getSummaryData, saveDailyNote, syncReportSheets } from './actions'
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
  const d = new Date(dateStr + 'T00:00:00')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().split('T')[0]
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
      cashExpense: acc.cashExpense + d.cashExpense,
      cashLeave: acc.cashLeave + d.cashLeave,
      labor: acc.labor + d.labor,
    }),
    { netSales: 0, onlineOrders: 0, totalSale: 0, totalEftpos: 0, cashExpense: 0, cashLeave: 0, labor: 0 },
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

  const totalSale = dayRevenue.reduce((s, e) => s + e.lunch.totalSale + e.dinner.totalSale, 0)
  const totalEftpos = dayRevenue.reduce((s, e) => s + e.lunch.eftpos + e.dinner.eftpos, 0)
  const onlineOrders = dayRevenue.reduce(
    (s, e) => s + e.lunch.lfyOnline + e.lunch.uberOnline + e.lunch.doorDash
              + e.dinner.lfyOnline + e.dinner.uberOnline + e.dinner.doorDash, 0)
  const netSales = totalSale - onlineOrders
  const cashRevenue = dayRevenue.reduce(
    (s, e) =>
      s + (e.lunch.totalSale - e.lunch.eftpos - e.lunch.lfyOnline - e.lunch.uberOnline - e.lunch.doorDash)
        + (e.dinner.totalSale - e.dinner.eftpos - e.dinner.lfyOnline - e.dinner.uberOnline - e.dinner.doorDash),
    0,
  )

  const cashExpense = dayExpenses
    .filter((e) => e.paymentMethod === 'Cash')
    .reduce((s, e) => s + e.total, 0)

  const staffLabor = employees
    .filter((e) => !e.positions.includes('Home'))
    .reduce((sum, emp) => {
      const rec = dayRecords.find((r) => r.employeeId === emp.id)
      if (!rec || (rec.morning === 0 && rec.evening === 0)) return sum
      return sum + rec.morning + rec.evening
    }, 0)
  const deliveryLabor = dayTrips.reduce((s, t) => s + t.fee, 0)
  const labor = staffLabor + deliveryLabor

  const cashLeave = cashRevenue - cashExpense - labor

  const hasData =
    totalSale > 0 || dayExpenses.length > 0 || labor > 0 || note !== ''

  // Per-meal breakdowns
  const lunchSale   = dayRevenue.reduce((s, e) => s + e.lunch.totalSale, 0)
  const lunchEftpos = dayRevenue.reduce((s, e) => s + e.lunch.eftpos, 0)
  const lunchOnline = dayRevenue.reduce((s, e) => s + e.lunch.lfyOnline + e.lunch.uberOnline + e.lunch.doorDash, 0)
  const lunchCash   = dayRevenue.reduce((s, e) => s + (e.lunch.totalSale - e.lunch.eftpos - e.lunch.lfyOnline - e.lunch.uberOnline - e.lunch.doorDash), 0)
  const dinnerSale   = dayRevenue.reduce((s, e) => s + e.dinner.totalSale, 0)
  const dinnerEftpos = dayRevenue.reduce((s, e) => s + e.dinner.eftpos, 0)
  const dinnerOnline = dayRevenue.reduce((s, e) => s + e.dinner.lfyOnline + e.dinner.uberOnline + e.dinner.doorDash, 0)
  const dinnerCash   = dayRevenue.reduce((s, e) => s + (e.dinner.totalSale - e.dinner.eftpos - e.dinner.lfyOnline - e.dinner.uberOnline - e.dinner.doorDash), 0)

  return {
    date, netSales, onlineOrders, totalSale, totalEftpos, cashRevenue, cashExpense, cashLeave, labor,
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
  const cashLeave = cashRevenue - d.cashExpense - d.labor
  return { totalSale, totalEftpos, onlineOrders, netSales, cashRevenue, cashExpense: d.cashExpense, labor: d.labor, cashLeave }
}

function fmt(n: number): string {
  return n.toLocaleString()
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
          <div className={`text-sm font-bold ${color}`}>{fmt(value)} ฿</div>
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
  const [syncing, setSyncing] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([])
  const [deliveryTrips, setDeliveryTrips] = useState<DeliveryTrip[]>([])
  const [revenue, setRevenue] = useState<RevenueEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [notes, setNotes] = useState<DailyNote[]>([])

  useEffect(() => {
    setLoading(true)
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
      cashExpense:  acc.cashExpense  + d.cashExpense,
      cashLeave:    acc.cashLeave    + d.cashLeave,
      labor:        acc.labor        + d.labor,
    }),
    { netSales: 0, onlineOrders: 0, totalSale: 0, totalEftpos: 0, cashExpense: 0, cashLeave: 0, labor: 0 },
  )
  const weekGroups = groupByWeek(activeRows)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.summary_title}</h2>
        {session.role === 'owner' && (
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
                      <span className="text-sm font-semibold text-gray-700">{weekPovLabel(wg.weekStart)}</span>
                      <div className="text-right">
                        <div className="text-sm font-bold text-brand-gold">{fmt(wt.totalSale)} ฿</div>
                        <div className="text-xs text-gray-400">{wg.days.length} days</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div><span className="text-gray-400">Net sales</span><div className="font-semibold text-gray-700">{fmt(wt.netSales)} ฿</div></div>
                      <div><span className="text-gray-400">Online Orders</span><div className="font-semibold text-gray-700">{fmt(wt.onlineOrders)} ฿</div></div>
                      <div><span className="text-gray-400">Total eftpos</span><div className="font-semibold text-blue-600">{fmt(wt.totalEftpos)} ฿</div></div>
                      <div><span className="text-gray-400">{tr.labor_label}</span><div className="font-semibold text-brand-gold">{fmt(wt.labor)} ฿</div></div>
                      <div><span className="text-gray-400">Cash Expense</span><div className="font-semibold text-red-500">{fmt(wt.cashExpense)} ฿</div></div>
                      <div>
                        <span className="text-gray-400">{tr.cash_leave_day}</span>
                        <div className={`font-semibold ${wt.cashLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(wt.cashLeave)} ฿</div>
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
                {activeRows.map((d) => {
                  const dv = getDayDisplay(d, shift)
                  return (
                  <div key={d.date} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">{dayPovLabel(d.date)}</span>
                      <div className="text-right">
                        <div className="text-sm font-bold text-brand-gold">{fmt(dv.totalSale)} ฿</div>
                        <div className="text-xs text-gray-400">Total sale</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div>
                        <span className="text-gray-400">Net sales</span>
                        <div className="font-semibold text-gray-700">{fmt(dv.netSales)} ฿</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Online Orders</span>
                        <div className="font-semibold text-gray-700">{fmt(dv.onlineOrders)} ฿</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Total eftpos</span>
                        <div className="font-semibold text-blue-600">{fmt(dv.totalEftpos)} ฿</div>
                      </div>
                      <div>
                        <span className="text-gray-400">{tr.labor_label}</span>
                        <div className="font-semibold text-brand-gold">{fmt(dv.labor)} ฿</div>
                      </div>
                      <div>
                        <span className="text-gray-400">Cash Expense</span>
                        <div className="font-semibold text-red-500">{fmt(dv.cashExpense)} ฿</div>
                      </div>
                      <div>
                        <span className="text-gray-400">{tr.cash_leave_day}</span>
                        <div className={`font-semibold ${dv.cashLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {fmt(dv.cashLeave)} ฿
                        </div>
                      </div>
                    </div>

                    <NoteField shopCode={shopCode} date={d.date} initialNote={d.note} />
                  </div>
                  )
                })}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
