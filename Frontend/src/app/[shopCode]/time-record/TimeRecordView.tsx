'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord, DeliveryTrip, DeliveryRate, Position } from '@/lib/types'
import { DEFAULT_DELIVERY_RATES, calcDeliveryFee } from '@/lib/config'
import { getWeekTimeRecords, getTimeRecordData, saveTimeRecords, deleteEmployee, saveEmployee } from './actions'
import { getDeliveryRates, getDeliveryFee } from '../config/actions'
import { saveRevenueEntry } from '../revenue/actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n * 7)
  return r
}

function weekLabel(monday: Date, locale: string): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString(locale, opts)} – ${sunday.toLocaleDateString(locale, { ...opts, year: '2-digit' })}`
}

const DAYS_SHORT_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const DAYS_SHORT_EN = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']

// ─── Types ────────────────────────────────────────────────────────────────────

type DayAttend = { morning: number; evening: number }
type WeekAttendMap = Record<string, Record<string, DayAttend>>
type TripMap = Record<string, DeliveryTrip[]>
type NewEmp = { name: string; positions: Position[]; defaultDays: boolean[] }

const EMPTY_NEW_EMP: NewEmp = {
  name: '',
  positions: ['Front'],
  defaultDays: [true, true, true, true, true, false, false],
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeRecordView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { session, lang } = useShop()
  const tr = translations[lang]
  const DAYS_SHORT = lang === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_TH
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  // ── Weekly state (Front / Back) ──
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [weekAttend, setWeekAttend] = useState<WeekAttendMap>({})
  const [staffEmps, setStaffEmps] = useState<Employee[]>([])
  const [weekLoading, setWeekLoading] = useState(true)
  const [weekSaving, setWeekSaving] = useState(false)

  // ── Delivery rates & fee ──
  const [deliveryRates, setDeliveryRates] = useState<DeliveryRate[]>(DEFAULT_DELIVERY_RATES)
  const [deliveryFee, setDeliveryFee] = useState<number>(0)

  useEffect(() => {
    getDeliveryRates(shopCode).then(setDeliveryRates).catch(() => {})
    getDeliveryFee(shopCode).then(setDeliveryFee).catch(() => {})
  }, [shopCode])

  // ── Daily state (Home) ──
  const [date, setDate] = useState(today)
  const [homeEmps, setHomeEmps] = useState<Employee[]>([])
  const [trips, setTrips] = useState<TripMap>({})
  const [codByEmp, setCodByEmp] = useState<Record<string, number>>({})
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeSaving, setHomeSaving] = useState(false)

  // ── Add employee modal ──
  const [showAdd, setShowAdd] = useState(false)
  const [newEmp, setNewEmp] = useState<NewEmp>(EMPTY_NEW_EMP)
  const [addSaving, setAddSaving] = useState(false)

  // ── Load weekly data ──
  useEffect(() => {
    setWeekLoading(true)
    getWeekTimeRecords(shopCode, isoDate(weekStart))
      .then(({ employees, timeRecords, weekDates: wd }) => {
        const staff = employees.filter((e) => e.positions.includes('Front') || e.positions.includes('Back'))
        setStaffEmps(staff)
        setWeekDates(wd)
        const map: WeekAttendMap = {}
        wd.forEach((d) => {
          map[d] = {}
          staff.forEach((e) => {
            const r = timeRecords.find((r) => r.date === d && r.employeeId === e.id)
            map[d][e.id] = {
              morning: r?.morning ?? 0,
              evening: r?.evening ?? 0,
            }
          })
        })
        setWeekAttend(map)
      })
      .catch(console.error)
      .finally(() => setWeekLoading(false))
  }, [shopCode, weekStart])

  // ── Load daily Home data ──
  useEffect(() => {
    setHomeLoading(true)
    getTimeRecordData(shopCode, date)
      .then(({ employees, deliveryTrips }) => {
        const home = employees.filter((e) => e.positions.includes('Home'))
        setHomeEmps(home)
        const t: TripMap = {}
        const cod: Record<string, number> = {}
        home.forEach((e) => {
          const empTrips = deliveryTrips.filter((tr) => tr.employeeId === e.id)
          t[e.id] = empTrips.map((tr) => ({ ...tr, cod: undefined }))
          cod[e.id] = empTrips.reduce((s, tr) => s + (tr.cod ?? 0), 0)
        })
        setTrips(t)
        setCodByEmp(cod)
      })
      .catch(console.error)
      .finally(() => setHomeLoading(false))
  }, [shopCode, date])

  // ── Weekly handlers ──
  function setShift(date: string, empId: string, shift: 'morning' | 'evening', val: number) {
    setWeekAttend((p) => ({
      ...p,
      [date]: { ...p[date], [empId]: { ...p[date][empId], [shift]: val } },
    }))
  }

  async function handleSaveWeek() {
    setWeekSaving(true)
    try {
      const records: TimeRecord[] = weekDates.flatMap((d) =>
        staffEmps.map((e) => {
          const a = weekAttend[d]?.[e.id] ?? { morning: 0, evening: 0 }
          return { date: d, employeeId: e.id, morning: a.morning, evening: a.evening }
        }),
      )
      await saveTimeRecords(shopCode, isoDate(weekStart), records, [])
      alert(tr.save)
    } catch (err) {
      console.error('[handleSaveWeek]', err)
      alert(tr.save_fail)
    } finally {
      setWeekSaving(false)
    }
  }

  // ── Add employee ──
  async function handleAddEmployee() {
    if (!newEmp.name.trim() || newEmp.positions.length === 0) return
    setAddSaving(true)
    const emp: Employee = {
      id: Date.now().toString(),
      name: newEmp.name.trim(),
      positions: newEmp.positions,
      defaultDays: newEmp.defaultDays,
    }
    try {
      await saveEmployee(shopCode, emp)
      // update both lists
      if (emp.positions.includes('Front') || emp.positions.includes('Back')) {
        setStaffEmps((p) => [...p, emp])
        setWeekAttend((p) => {
          const updated = { ...p }
          weekDates.forEach((d) => {
            updated[d] = { ...updated[d], [emp.id]: { morning: 0, evening: 0 } }
          })
          return updated
        })
      }
      if (emp.positions.includes('Home')) {
        setHomeEmps((p) => [...p, emp])
        setTrips((p) => ({ ...p, [emp.id]: [] }))
        setCodByEmp((p) => ({ ...p, [emp.id]: 0 }))
      }
      setNewEmp(EMPTY_NEW_EMP)
      setShowAdd(false)
    } catch {
      alert(tr.add_emp_fail)
    } finally {
      setAddSaving(false)
    }
  }

  // ── Delete employee ──
  async function handleDeleteEmployee(empId: string, name: string) {
    if (!confirm(tr.confirm_delete_emp2(name))) return
    try {
      await deleteEmployee(shopCode, empId)
      setStaffEmps((p) => p.filter((e) => e.id !== empId))
      setHomeEmps((p) => p.filter((e) => e.id !== empId))
    } catch {
      alert(tr.save_fail)
    }
  }

  // ── Home/Delivery handlers ──
  function addTrip(empId: string) {
    const empName = homeEmps.find((e) => e.id === empId)?.name ?? ''
    const trip: DeliveryTrip = {
      id: Date.now().toString() + Math.random(),
      date,
      employeeId: empId,
      employeeName: empName,
      distance: 0,
      fee: 0,
    }
    setTrips((p) => ({ ...p, [empId]: [...(p[empId] ?? []), trip] }))
  }

  function updateTrip(empId: string, tripId: string, km: number) {
    const fee = calcDeliveryFee(km, deliveryRates)
    setTrips((p) => ({
      ...p,
      [empId]: p[empId].map((t) => (t.id === tripId ? { ...t, distance: km, fee } : t)),
    }))
  }

  function removeTrip(empId: string, tripId: string) {
    setTrips((p) => ({ ...p, [empId]: p[empId].filter((t) => t.id !== tripId) }))
  }

  async function handleSaveHome() {
    setHomeSaving(true)
    try {
      // Attach per-employee COD to first trip of each employee
      const allTrips = homeEmps.flatMap((emp) => {
        const empTrips = trips[emp.id] ?? []
        const cod = codByEmp[emp.id] ?? 0
        if (empTrips.length === 0) return []
        return empTrips.map((t, i) => ({ ...t, cod: i === 0 && cod > 0 ? cod : undefined }))
      })
      await saveTimeRecords(shopCode, date, [], allTrips)

      // Save total COD as revenue entry
      const totalCod = Object.values(codByEmp).reduce((s, v) => s + v, 0)
      if (totalCod > 0) {
        await saveRevenueEntry(shopCode, {
          id: `cod_${date}_${Date.now()}`,
          date,
          name: 'Cash on Delivery',
          netSales: totalCod,
          paidOnline: 0,
          card: 0,
          cash: totalCod,
          platforms: {},
        })
      }

      alert(tr.save)
    } catch {
      alert(tr.save_fail)
    } finally {
      setHomeSaving(false)
    }
  }

  const isPast = weekStart < getMonday(new Date())

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.time_record_title}</h2>
        {(session.role === 'manager' || session.role === 'owner') && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
          >
            {tr.add_employee_btn}
          </button>
        )}
      </div>

      {/* ═══ WEEKLY — Front / Back ═══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">{tr.front_back_weekly}</h3>
        </div>

        {/* Week Nav */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-brand-accent px-4 py-3">
          <button
            onClick={() => setWeekStart((p) => addWeeks(p, -1))}
            className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
          >
            ◀
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-700">{weekLabel(weekStart, locale)}</div>
            {isPast && <div className="text-xs text-gray-400 mt-0.5">{tr.read_only}</div>}
          </div>
          <button
            onClick={() => setWeekStart((p) => addWeeks(p, 1))}
            className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
          >
            ▶
          </button>
        </div>

        {weekLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">{tr.loading}</div>
        ) : (
          <>
            {[
              { label: 'Front', color: 'text-blue-600', emps: staffEmps.filter((e) => e.positions.includes('Front')) },
              { label: 'Back',  color: 'text-brand-gold', emps: staffEmps.filter((e) => e.positions.includes('Back')) },
            ].map(({ label, color, emps }) =>
              emps.length === 0 ? null : (
                <div key={label} className="bg-white rounded-xl border border-brand-accent overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <span className={`text-xs font-semibold ${color}`}>{label}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-50">
                          <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium min-w-20">{tr.name_label}</th>
                          {weekDates.map((d, i) => (
                            <th key={d} colSpan={2} className="text-center px-1 py-2 text-xs text-gray-400 font-medium">
                              <div>{DAYS_SHORT[i]}</div>
                              <div className="text-gray-300 text-[10px]">{new Date(d + 'T00:00:00').getDate()}</div>
                              <div className="flex gap-0.5 justify-center mt-0.5">
                                <span className="text-[9px] text-blue-300 w-8 text-center">{tr.morning}</span>
                                <span className="text-[9px] text-orange-300 w-8 text-center">{tr.evening}</span>
                              </div>
                            </th>
                          ))}
                          <th className="text-center px-2 py-2 text-xs text-gray-400 font-medium">{tr.total_col}</th>
                          {(session.role === 'manager' || session.role === 'owner') && <th className="w-6" />}
                        </tr>
                      </thead>
                      <tbody>
                        {emps.map((emp) => (
                          <tr key={emp.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                              {emp.name}
                            </td>
                            {weekDates.map((d) => {
                              const a = weekAttend[d]?.[emp.id] ?? { morning: 0, evening: 0 }
                              return (
                                <React.Fragment key={d}>
                                  {(['morning', 'evening'] as const).map((shift) => (
                                    <td key={shift} className="text-center px-0.5 py-1.5">
                                      <input
                                        type="number"
                                        min="0"
                                        disabled={isPast}
                                        value={a[shift] || ''}
                                        onChange={(e) => setShift(d, emp.id, shift, Number(e.target.value))}
                                        placeholder="0"
                                        className={`w-8 text-center border rounded px-0.5 py-1 text-xs focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-300 ${
                                          shift === 'morning'
                                            ? 'border-blue-200 focus:ring-blue-300'
                                            : 'border-orange-200 focus:ring-orange-300'
                                        }`}
                                      />
                                    </td>
                                  ))}
                                </React.Fragment>
                              )
                            })}
                            <td className="text-center px-2 py-1.5">
                              <span className="text-xs font-bold text-brand-green">
                                {(() => {
                                  const total = weekDates.reduce((sum, d) => {
                                    const a = weekAttend[d]?.[emp.id] ?? { morning: 0, evening: 0 }
                                    return sum + Number(a.morning) + Number(a.evening)
                                  }, 0)
                                  return total > 0 ? total : '—'
                                })()}
                              </span>
                            </td>
                            {(session.role === 'manager' || session.role === 'owner') && (
                              <td className="px-1">
                                <button
                                  onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                  className="text-red-300 hover:text-red-500 text-base leading-none cursor-pointer"
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            )}

            {staffEmps.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">{tr.no_front_back}</div>
            )}

            {!isPast && staffEmps.length > 0 && (
              <button
                onClick={handleSaveWeek}
                disabled={weekSaving}
                className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
              >
                {weekSaving ? tr.saving : tr.save_weekly}
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ DAILY — Home Delivery ════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700">{tr.home_delivery_daily}</h3>

        <div className="bg-white rounded-xl border border-brand-accent p-4">
          <label className="text-xs text-gray-500 block mb-1.5">{tr.date_label}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
        </div>

        {homeLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">{tr.loading}</div>
        ) : (
          <>
            {homeEmps.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{tr.no_home}</div>
            ) : (
              <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-600">Home Delivery</span>
                </div>
                <div className="px-4 py-2 bg-brand-parchment border-b border-gray-100 flex flex-wrap gap-2">
                  {deliveryRates.map((r, i) => {
                    const prev = i === 0 ? 0 : deliveryRates[i - 1].maxKm
                    const label = i === 0 ? `≤${r.maxKm}km` : r.maxKm >= 9999 ? `>${prev}km` : `>${prev}–${r.maxKm}km`
                    return (
                      <span key={i} className="text-xs text-gray-500">
                        {label} → ${r.fee.toFixed(2)}
                      </span>
                    )
                  })}
                </div>
                {homeEmps.map((emp) => (
                  <div key={emp.id} className="border-b border-gray-50 last:border-0">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-700">{emp.name}</span>
                          {emp.defaultDays[0] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Morning</span>}
                          {emp.defaultDays[1] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">Evening</span>}
                        </div>
                        <div className="text-xs text-gray-400">
                          {tr.total_col}: ${(trips[emp.id] ?? []).reduce((s, t) => s + t.fee, 0).toFixed(2)}
                          {deliveryFee > 0 && (
                            <span className="ml-1 text-orange-500">+ ${deliveryFee.toFixed(2)} fee = ${((trips[emp.id] ?? []).reduce((s, t) => s + t.fee, 0) + deliveryFee).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addTrip(emp.id)}
                          className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 cursor-pointer"
                        >
                          {tr.add_trip}
                        </button>
                        {(session.role === 'manager' || session.role === 'owner') && (
                          <button
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            className="text-red-300 hover:text-red-500 text-base leading-none cursor-pointer"
                            title={tr.delete}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {(trips[emp.id] ?? []).map((trip, ti) => (
                      <div key={trip.id} className="px-4 pb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 w-6">{ti + 1}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={trip.distance || ''}
                          onChange={(e) => updateTrip(emp.id, trip.id, Number(e.target.value))}
                          placeholder="ระยะ (km)"
                          className="w-24 border border-brand-accent rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold"
                        />
                        <span className="text-xs text-gray-400">km</span>
                        <span className="text-xs font-semibold text-green-700 w-10 text-right">
                          {trip.fee > 0 ? `$${trip.fee}` : '—'}
                        </span>
                        <button
                          onClick={() => removeTrip(emp.id, trip.id)}
                          className="text-red-300 hover:text-red-500 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="px-4 pb-3 flex items-center gap-2">
                      <label className="text-xs text-blue-500 font-medium">Cash on Delivery</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={codByEmp[emp.id] || ''}
                        onChange={(e) => setCodByEmp((p) => ({ ...p, [emp.id]: Number(e.target.value) }))}
                        placeholder="0"
                        className="w-28 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {homeEmps.length > 0 && (
              <button
                onClick={handleSaveHome}
                disabled={homeSaving}
                className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
              >
                {homeSaving ? tr.saving : tr.save_home}
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ Add Employee Modal ══════════════════════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">{tr.add_employee}</h3>

            <input
              type="text"
              placeholder={tr.name_placeholder}
              value={newEmp.name}
              onChange={(e) => setNewEmp((p) => ({ ...p, name: e.target.value }))}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />

            <div className="flex gap-2">
              {(['Front', 'Back', 'Home'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setNewEmp((p) => ({
                    ...p,
                    positions: [pos],
                    defaultDays: pos === 'Home'
                      ? Array(7).fill(false)
                      : [true, true, true, true, true, false, false],
                  }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    newEmp.positions[0] === pos
                      ? 'bg-brand-gold text-white border-brand-gold'
                      : 'border-brand-accent text-gray-600 hover:border-brand-gold/50'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            {newEmp.positions[0] === 'Home' ? (
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Shift</label>
                <div className="flex gap-2">
                  {(['Morning', 'Evening'] as const).map((shift, i) => (
                    <button
                      key={shift}
                      type="button"
                      onClick={() =>
                        setNewEmp((p) => ({
                          ...p,
                          defaultDays: p.defaultDays.map((_, j) => j === i),
                        }))
                      }
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        newEmp.defaultDays[i]
                          ? i === 0 ? 'bg-orange-100 text-orange-600 border-orange-300' : 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-brand-parchment text-gray-400 border-brand-accent'
                      }`}
                    >
                      {shift}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">{tr.default_days_label}</label>
                <div className="flex gap-1">
                  {DAYS_SHORT.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setNewEmp((p) => ({
                          ...p,
                          defaultDays: p.defaultDays.map((v, j) => (j === i ? !v : v)),
                        }))
                      }
                      className={`flex-1 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                        newEmp.defaultDays[i] ? 'bg-green-100 text-green-700' : 'bg-brand-parchment text-gray-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowAdd(false); setNewEmp(EMPTY_NEW_EMP) }}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleAddEmployee}
                disabled={addSaving || !newEmp.name.trim() || newEmp.positions.length === 0}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {addSaving ? '...' : tr.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
