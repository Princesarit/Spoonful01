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
import { getSummaryData, saveDailyNote } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

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

function thDate(date: string, locale: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

interface DaySummary {
  date: string
  netSales: number
  onlineOrders: number
  totalSale: number
  totalEftpos: number
  cashRevenue: number
  cashExpense: number
  cashLeave: number
  labor: number
  note: string
  hasData: boolean
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

  // Revenue breakdown
  const netSales = dayRevenue.reduce((s, e) => s + e.netSales, 0)
  const paidOnline = dayRevenue.reduce((s, e) => s + e.paidOnline, 0)
  const platformTotal = dayRevenue.reduce(
    (s, e) => s + Object.values(e.platforms).reduce((a, v) => a + v, 0),
    0,
  )
  const onlineOrders = paidOnline + platformTotal
  const totalSale = netSales + onlineOrders
  const totalEftpos = dayRevenue.reduce((s, e) => s + e.card, 0)
  const cashRevenue = dayRevenue.reduce((s, e) => s + e.cash, 0)

  // Cash expenses
  const cashExpense = dayExpenses
    .filter((e) => e.paymentMethod === 'Cash')
    .reduce((s, e) => s + e.total, 0)

  // Labor
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
    netSales > 0 || onlineOrders > 0 || dayExpenses.length > 0 || labor > 0 || note !== ''

  return {
    date,
    netSales,
    onlineOrders,
    totalSale,
    totalEftpos,
    cashRevenue,
    cashExpense,
    cashLeave,
    labor,
    note,
    hasData,
  }
}

function fmt(n: number): string {
  return n.toLocaleString()
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
  const { lang } = useShop()
  const tr = translations[lang]
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  const [month, setMonth] = useState(currentMonth)
  const [loading, setLoading] = useState(true)
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

  const totals = activeRows.reduce(
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.summary_title}</h2>
      </div>

      {/* Month Nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-brand-accent px-4 py-3">
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

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : (
        <>
          {/* Monthly totals */}
          <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500">
                {tr.summary_total_prefix} {activeRows.length} {tr.days_suffix}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-0 divide-x divide-y divide-gray-100">
              {[
                { label: 'Total sale', value: totals.totalSale, color: 'text-brand-gold' },
                { label: 'Total eftpos', value: totals.totalEftpos, color: 'text-blue-600' },
                { label: 'Net sales', value: totals.netSales, color: 'text-gray-800' },
                { label: 'Online Orders', value: totals.onlineOrders, color: 'text-gray-800' },
                { label: 'Cash Expense', value: totals.cashExpense, color: 'text-red-500' },
                { label: 'Cash Leave', value: totals.cashLeave, color: totals.cashLeave >= 0 ? 'text-green-600' : 'text-red-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3">
                  <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                  <div className={`text-sm font-bold ${color}`}>{fmt(value)} ฿</div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily cards */}
          {activeRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data_month}</div>
          ) : (
            <div className="space-y-3">
              {activeRows.map((d) => (
                <div key={d.date} className="bg-white rounded-xl border border-brand-accent p-4">
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">{thDate(d.date, locale)}</span>
                    <div className="text-right">
                      <div className="text-sm font-bold text-brand-gold">{fmt(d.totalSale)} ฿</div>
                      <div className="text-xs text-gray-400">Total sale</div>
                    </div>
                  </div>

                  {/* Fields grid */}
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <span className="text-gray-400">Net sales</span>
                      <div className="font-semibold text-gray-700">{fmt(d.netSales)} ฿</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Online Orders</span>
                      <div className="font-semibold text-gray-700">{fmt(d.onlineOrders)} ฿</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Total eftpos</span>
                      <div className="font-semibold text-blue-600">{fmt(d.totalEftpos)} ฿</div>
                    </div>
                    <div>
                      <span className="text-gray-400">{tr.labor_label}</span>
                      <div className="font-semibold text-brand-gold">{fmt(d.labor)} ฿</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Cash Expense</span>
                      <div className="font-semibold text-red-500">{fmt(d.cashExpense)} ฿</div>
                    </div>
                    <div>
                      <span className="text-gray-400">{tr.cash_leave_day}</span>
                      <div className={`font-semibold ${d.cashLeave >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(d.cashLeave)} ฿
                      </div>
                    </div>
                  </div>

                  {/* Note */}
                  <NoteField shopCode={shopCode} date={d.date} initialNote={d.note} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
