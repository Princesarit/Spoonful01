'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord } from '@/lib/types'
import { getWageData, getWagePayments, saveWagePayments } from './actions'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMondayStr(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addWeeks(weekStr: string, delta: number): string {
  const [y, mo, day] = weekStr.split('-').map(Number)
  const d = new Date(y, mo - 1, day + delta * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const [y, mo, day] = weekStart.split('-').map(Number)
    const d = new Date(y, mo - 1, day + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function calcShiftWage(emp: Employee, hrs: number, isLunch: boolean): number {
  if (hrs <= 0) return 0
  const hourly = emp.hourlyWage ?? 0
  if (isLunch) return emp.wageLunch ?? hourly * hrs
  return emp.wageDinner ?? hourly * hrs
}

// Full-bleed style: break out of parent max-w-2xl container
const fullBleed: React.CSSProperties = {
  width: '100vw',
  position: 'relative',
  left: '50%',
  marginLeft: '-50vw',
}

const inputCls = 'w-14 border border-gray-300 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

export default function WageView() {
  const { shopCode } = useParams() as { shopCode: string }
  const [weekStart, setWeekStart] = useState(() => getMondayStr(new Date()))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([])
  const [revenueByDate, setRevenueByDate] = useState<Map<string, { lf: number; lk: number; df: number; dk: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [wageTax, setWageTax] = useState<Record<string, number>>({})
  const [wagePaid, setWagePaid] = useState<Record<string, number>>({})
  // dayOverrides: empId → { "0L": 86, "0D": 97, ... }
  const [dayOverrides, setDayOverrides] = useState<Record<string, Record<string, number>>>({})
  const [weekNote, setWeekNote] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (ws: string) => {
    setLoading(true)
    setSaved(false)
    setEditMode(false)
    try {
      const [data, pmtResult] = await Promise.all([
        getWageData(shopCode, ws),
        getWagePayments(shopCode, ws),
      ])
      setEmployees(data.employees.filter((e) => !e.positions?.includes('Home') && !e.fired))
      setTimeRecords(data.timeRecords)
      const rbd = new Map<string, { lf: number; lk: number; df: number; dk: number }>()
      for (const r of data.revenue ?? []) {
        rbd.set(r.date, {
          lf: (rbd.get(r.date)?.lf ?? 0) + (r.lunchFrontExtra ?? 0),
          lk: (rbd.get(r.date)?.lk ?? 0) + (r.lunchKitchenExtra ?? 0),
          df: (rbd.get(r.date)?.df ?? 0) + (r.dinnerFrontExtra ?? 0),
          dk: (rbd.get(r.date)?.dk ?? 0) + (r.dinnerKitchenExtra ?? 0),
        })
      }
      setRevenueByDate(rbd)

      const tax: Record<string, number> = {}
      const paid: Record<string, number> = {}
      const overrides: Record<string, Record<string, number>> = {}
      for (const [empId, p] of Object.entries(pmtResult.payments)) {
        if (p.tax)  tax[empId]  = p.tax
        if (p.paid) paid[empId] = p.paid
        if (p.overrides && Object.keys(p.overrides).length > 0) overrides[empId] = p.overrides
      }
      setWageTax(tax)
      setWagePaid(paid)
      setDayOverrides(overrides)
      setWeekNote(pmtResult.weekNote ?? '')
    } catch (err) {
      console.error('WageView load error:', err)
    } finally {
      setLoading(false)
    }
  }, [shopCode])

  async function handleSave() {
    setSaving(true)
    try {
      const payments = employees.map((emp) => ({
        employeeId: emp.id,
        tax: wageTax[emp.id] ?? 0,
        paid: wagePaid[emp.id] ?? 0,
        note: '',
        overrides: dayOverrides[emp.id] ?? {},
      }))
      await saveWagePayments(shopCode, weekStart, payments, weekNote)
      setSaved(true)
      setEditMode(false)
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + String(err))
    } finally {
      setSaving(false)
    }
  }

  function setOverride(empId: string, key: string, value: number) {
    setDayOverrides((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? {}), [key]: value },
    }))
    setSaved(false)
  }

  useEffect(() => { load(weekStart) }, [weekStart, load])

  const dates = weekDates(weekStart)

  const attend: Record<string, Record<string, { morning: number; evening: number }>> = {}
  for (const r of timeRecords) {
    if (!attend[r.date]) attend[r.date] = {}
    attend[r.date][r.employeeId] = { morning: r.morning, evening: r.evening }
  }

  const empRows = employees.map((emp) => {
    let lunchWage = 0, dinnerWage = 0
    const dayAmounts = dates.map((d, di) => {
      const a = attend[d]?.[emp.id] ?? { morning: 0, evening: 0 }
      const calcL = calcShiftWage(emp, a.morning, true)
      const calcD = calcShiftWage(emp, a.evening, false)
      const l = dayOverrides[emp.id]?.[`${di}L`] ?? calcL
      const dn = dayOverrides[emp.id]?.[`${di}D`] ?? calcD
      lunchWage += l
      dinnerWage += dn
      return { lunch: l, dinner: dn, calcLunch: calcL, calcDinner: calcD }
    })
    const isFront = emp.positions?.some((p) => ['Front', 'Cashier', 'Owner', 'Manager'].includes(p)) ?? false
    const isKitchen = emp.positions?.some((p) => ['Kitchen', 'Back'].includes(p)) ?? false
    let extra = 0
    for (const d of dates) {
      const a = attend[d]?.[emp.id] ?? { morning: 0, evening: 0 }
      const rev = revenueByDate.get(d)
      if (!rev) continue
      if (a.morning > 0) extra += isFront ? rev.lf : isKitchen ? rev.lk : 0
      if (a.evening > 0) extra += isFront ? rev.df : isKitchen ? rev.dk : 0
    }
    const wage = lunchWage + dinnerWage + extra
    return { emp, dayAmounts, lunchWage, dinnerWage, extra, wage }
  })

  const totalLunchWage = empRows.reduce((s, r) => s + r.lunchWage, 0)
  const totalDinnerWage = empRows.reduce((s, r) => s + r.dinnerWage, 0)
  const totalExtra = empRows.reduce((s, r) => s + r.extra, 0)
  const totalWage = empRows.reduce((s, r) => s + r.wage, 0)
  const totalTax = empRows.reduce((s, e) => s + (wageTax[e.emp.id] ?? 0), 0)
  const totalPaid = empRows.reduce((s, e) => s + (wagePaid[e.emp.id] ?? 0), 0)

  const dayTotals = dates.map((_, di) => ({
    lunch: empRows.reduce((s, r) => s + r.dayAmounts[di].lunch, 0),
    dinner: empRows.reduce((s, r) => s + r.dayAmounts[di].dinner, 0),
  }))

  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00')
    const e = new Date(weekStart + 'T00:00:00')
    e.setDate(e.getDate() + 6)
    const fmtD = (dt: Date) => `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
    return `${fmtD(s)} – ${fmtD(e)}`
  })()

  return (
    <div style={fullBleed}>
      <div className="px-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 pt-1">
          <Link href={`/${shopCode}/summary`} className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
          <h2 className="text-lg font-bold text-gray-800 flex-1">Wage Summary</h2>
        </div>

        {/* Week nav + Edit + Save */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 flex-1 max-w-lg">
            <button onClick={() => setWeekStart((w) => addWeeks(w, -1))} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded cursor-pointer">◀</button>
            <span className="text-sm font-semibold text-gray-700">{weekLabel}</span>
            <button onClick={() => setWeekStart((w) => addWeeks(w, 1))} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded cursor-pointer">▶</button>
          </div>
          {!loading && employees.length > 0 && (
            <>
              <button
                onClick={() => { setEditMode((v) => !v); setSaved(false) }}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer whitespace-nowrap transition-colors border ${editMode ? 'bg-yellow-100 border-yellow-400 text-yellow-800 hover:bg-yellow-200' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                {editMode ? '✏️ Editing' : '✏️ Edit'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer whitespace-nowrap transition-colors"
              >
                {saving ? 'Saving...' : saved ? '✓ Saved' : '💾 Save to Sheet'}
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ไม่มีพนักงาน</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="border-collapse w-full" style={{ fontSize: 11 }}>
                <thead>
                  {/* Row 1: Day headers */}
                  <tr className="bg-gray-200 font-semibold text-gray-700">
                    <th className="border border-gray-300 px-2 py-1.5 text-left bg-yellow-200 text-gray-800 dark:text-yellow-200 whitespace-nowrap">WAGE ADJUSTED</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-yellow-200 text-gray-700 dark:text-yellow-300 whitespace-nowrap">Since {dates[0]}</th>
                    {DAY_SHORT.map((name) => (
                      <th key={name} colSpan={2} className="border border-gray-300 px-1 py-1.5 text-center">
                        {name}
                      </th>
                    ))}
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-gray-300">Extra</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-green-100 text-green-800 dark:text-green-300">WAGE</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-gray-200">TAX</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-gray-200">PAID</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center bg-gray-200">Remaining</th>
                  </tr>

                  {/* Row 2: Dates */}
                  <tr className="bg-gray-100 text-gray-500">
                    <th className="border border-gray-300 px-2 py-1 text-left">4/4.5 hrs</th>
                    <th className="border border-gray-300 px-2 py-1" />
                    {dates.map((d) => (
                      <th key={d} colSpan={2} className="border border-gray-300 px-1 py-1 text-center font-medium text-gray-600">
                        {fmtDate(d)}
                      </th>
                    ))}
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                  </tr>

                  {/* Row 3: L / D sub-headers */}
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="border border-gray-300 px-2 py-1 text-left">Name</th>
                    <th className="border border-gray-300 px-2 py-1 text-center">Rate</th>
                    {dates.map((d) => (
                      <Fragment key={d}>
                        <th className="border border-gray-300 px-1 py-1 text-center bg-yellow-50 text-yellow-600 w-12">L</th>
                        <th className="border border-gray-300 px-1 py-1 text-center bg-blue-50 text-blue-500 w-12">D</th>
                      </Fragment>
                    ))}
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                    <th className="border border-gray-300 px-1 py-1" />
                  </tr>
                </thead>

                <tbody>
                  {empRows.map(({ emp, dayAmounts, extra, wage }) => {
                    const tax = wageTax[emp.id] ?? 0
                    const paid = wagePaid[emp.id] ?? 0
                    const remaining = wage - tax - paid
                    const rateLabel = (emp.wageLunch || emp.wageDinner)
                      ? `${emp.wageLunch ?? 0}/${emp.wageDinner ?? 0}`
                      : emp.hourlyWage ? `${emp.hourlyWage}/hr` : '—'
                    return (
                      <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-[#2A2318]">
                        <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap">{emp.name}</td>
                        <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-500 whitespace-nowrap">{rateLabel}</td>
                        {dayAmounts.map((a, di) => (
                          <Fragment key={di}>
                            <td className={`border border-gray-200 px-1 py-1 text-center w-12 ${a.lunch > 0 ? 'bg-orange-50' : ''}`}>
                              {editMode ? (
                                <input
                                  type="number" min="0"
                                  value={dayOverrides[emp.id]?.[`${di}L`] ?? (a.calcLunch > 0 ? a.calcLunch : '')}
                                  onChange={(e) => setOverride(emp.id, `${di}L`, parseFloat(e.target.value) || 0)}
                                  className={inputCls + ' w-14'}
                                  placeholder="0"
                                />
                              ) : (
                                <span className={a.lunch > 0 ? 'text-orange-700 font-semibold' : 'text-gray-200'}>
                                  {a.lunch > 0 ? a.lunch.toFixed(0) : ''}
                                </span>
                              )}
                            </td>
                            <td className={`border border-gray-200 px-1 py-1 text-center w-12 ${a.dinner > 0 ? 'bg-blue-50' : ''}`}>
                              {editMode ? (
                                <input
                                  type="number" min="0"
                                  value={dayOverrides[emp.id]?.[`${di}D`] ?? (a.calcDinner > 0 ? a.calcDinner : '')}
                                  onChange={(e) => setOverride(emp.id, `${di}D`, parseFloat(e.target.value) || 0)}
                                  className={inputCls + ' w-14'}
                                  placeholder="0"
                                />
                              ) : (
                                <span className={a.dinner > 0 ? 'text-blue-600 font-semibold' : 'text-gray-200'}>
                                  {a.dinner > 0 ? a.dinner.toFixed(0) : ''}
                                </span>
                              )}
                            </td>
                          </Fragment>
                        ))}
                        <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-600">
                          {extra > 0 ? extra.toFixed(0) : ''}
                        </td>
                        <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-green-700 whitespace-nowrap">
                          {wage > 0 ? wage.toFixed(0) : '—'}
                        </td>
                        <td className="border border-gray-200 px-1 py-1">
                          {editMode ? (
                            <input
                              type="number" min="0" value={tax || ''}
                              onChange={(e) => { setWageTax((p) => ({ ...p, [emp.id]: parseFloat(e.target.value) || 0 })); setSaved(false) }}
                              placeholder="0"
                              className={inputCls}
                            />
                          ) : (
                            <span className="block text-center text-gray-600">{tax > 0 ? tax : ''}</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-1 py-1">
                          {editMode ? (
                            <input
                              type="number" min="0" value={paid || ''}
                              onChange={(e) => { setWagePaid((p) => ({ ...p, [emp.id]: parseFloat(e.target.value) || 0 })); setSaved(false) }}
                              placeholder="0"
                              className={inputCls}
                            />
                          ) : (
                            <span className="block text-center text-gray-600">{paid > 0 ? paid : ''}</span>
                          )}
                        </td>
                        <td className={`border border-gray-200 px-2 py-1.5 text-center font-semibold whitespace-nowrap ${remaining < 0 ? 'text-red-500' : remaining > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {wage > 0 ? remaining.toFixed(0) : '—'}
                        </td>
                      </tr>
                    )
                  })}

                  {/* TOTAL row */}
                  <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                    <td className="border border-gray-300 px-2 py-1.5 text-gray-700" colSpan={2}>TOTAL</td>
                    {dayTotals.map((dt, i) => (
                      <Fragment key={i}>
                        <td className="border border-gray-300 px-1 py-1.5 text-center text-orange-700">
                          {dt.lunch > 0 ? dt.lunch.toFixed(0) : ''}
                        </td>
                        <td className="border border-gray-300 px-1 py-1.5 text-center text-blue-600">
                          {dt.dinner > 0 ? dt.dinner.toFixed(0) : ''}
                        </td>
                      </Fragment>
                    ))}
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-600">{totalExtra > 0 ? totalExtra.toFixed(0) : ''}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-green-700">{totalWage.toFixed(0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-600">{totalTax.toFixed(0)}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-600">{totalPaid.toFixed(0)}</td>
                    <td className={`border border-gray-300 px-2 py-1.5 text-center ${(totalWage - totalTax - totalPaid) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {(totalWage - totalTax - totalPaid).toFixed(0)}
                    </td>
                  </tr>

                  {/* Daily sum row */}
                  <tr className="bg-gray-50 text-gray-600">
                    <td className="border border-gray-200 px-2 py-1.5" colSpan={2} />
                    {dayTotals.map((dt, i) => (
                      <td key={i} colSpan={2} className="border border-gray-200 px-1 py-1.5 text-center font-semibold">
                        {(dt.lunch + dt.dinner) > 0 ? (dt.lunch + dt.dinner).toFixed(0) : ''}
                      </td>
                    ))}
                    <td className="border border-gray-200 px-2 py-1.5" colSpan={5} />
                  </tr>

                  {/* Extra row */}
                  <tr className="bg-gray-100 text-gray-500">
                    <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-600">Extra</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400" />
                    {dates.map((d) => {
                      const dayExtra = empRows.reduce((s, r) => {
                        const a = attend[d]?.[r.emp.id] ?? { morning: 0, evening: 0 }
                        const rev = revenueByDate.get(d)
                        if (!rev) return s
                        const isFront = r.emp.positions?.some((p) => ['Front', 'Cashier', 'Owner', 'Manager'].includes(p)) ?? false
                        const isKitchen = r.emp.positions?.some((p) => ['Kitchen', 'Back'].includes(p)) ?? false
                        let e = 0
                        if (a.morning > 0) e += isFront ? rev.lf : isKitchen ? rev.lk : 0
                        if (a.evening > 0) e += isFront ? rev.df : isKitchen ? rev.dk : 0
                        return s + e
                      }, 0)
                      return (
                        <td key={d} colSpan={2} className={`border border-gray-200 px-1 py-1.5 text-center ${dayExtra > 0 ? 'text-gray-700 font-semibold' : ''}`}>
                          {dayExtra > 0 ? dayExtra.toFixed(0) : ''}
                        </td>
                      )
                    })}
                    <td className="border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-700">{totalExtra > 0 ? totalExtra.toFixed(0) : ''}</td>
                    <td className="border border-gray-200 px-2 py-1.5" colSpan={4} />
                  </tr>

                  {/* SALE row */}
                  <tr className="bg-gray-100">
                    <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-600" colSpan={2}>SALE</td>
                    <td className="border border-gray-200 px-2 py-1.5" colSpan={14} />
                    <td className="border border-gray-200 px-3 py-1.5 text-right" colSpan={2}>
                      <div className="text-[10px] text-gray-400">Lunch Wage</div>
                      <div className="font-bold text-orange-600">{totalLunchWage.toFixed(0)}</div>
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right" colSpan={3}>
                      <div className="text-[10px] text-gray-400">Dinner Wage</div>
                      <div className="font-bold text-blue-600">{totalDinnerWage.toFixed(0)}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Note section */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Note (optional)</div>
              {editMode ? (
                <textarea
                  value={weekNote}
                  onChange={(e) => { setWeekNote(e.target.value); setSaved(false) }}
                  placeholder="บันทึกประจำสัปดาห์..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                />
              ) : (
                <div className="text-sm text-gray-700 min-h-8">
                  {weekNote || <span className="text-gray-300 italic">ไม่มีบันทึก</span>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
