'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord, DeliveryTrip, DeliveryRate, Position } from '@/lib/types'
import { DEFAULT_DELIVERY_RATES, calcDeliveryFee } from '@/lib/config'
import { getWeekTimeRecords, getTimeRecordData, saveTimeRecords, saveEmployee, getWeekSchedule } from './actions'
import { getDeliveryRates, getDeliveryFee } from '../config/actions'
import { saveAuditLog } from './actions'
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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
  return `${monday.toLocaleDateString(locale, opts)} – ${sunday.toLocaleDateString(locale, { ...opts, year: 'numeric' })}`
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
  defaultDays: [true, true, true, true, true, true, true],
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeRecordView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { session, lang } = useShop()
  const tr = translations[lang]
  const DAYS_SHORT = lang === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_TH
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  // ── Weekly state (Front / Kitchen) ──
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [weekAttend, setWeekAttend] = useState<WeekAttendMap>({})
  const [staffEmps, setStaffEmps] = useState<Employee[]>([])
  const [weekLoading, setWeekLoading] = useState(true)
  const [weekSaving, setWeekSaving] = useState(false)
  const [weekSaved, setWeekSaved] = useState(false)
  const [weekEditing, setWeekEditing] = useState(false)
  const [weekAuditModal, setWeekAuditModal] = useState<{ editorName: string; note: string } | null>(null)
  // null = no schedule for this week (show all, allow all cells)
  // Map<empId, days[]> = schedule loaded — filter employees and lock unchecked cells
  const [weekScheduleMap, setWeekScheduleMap] = useState<Map<string, (string | null)[]> | null>(null)

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
  const [noteByEmp, setNoteByEmp] = useState<Record<string, string>>({})
  const [savedByEmp, setSavedByEmp] = useState<Record<string, boolean>>({})
  const [editingByEmp, setEditingByEmp] = useState<Record<string, boolean>>({})
  const [empSaving, setEmpSaving] = useState<Record<string, boolean>>({})
  const [originalByEmp, setOriginalByEmp] = useState<Record<string, { trips: DeliveryTrip[]; cod: number; note: string }>>({})
  const [auditModal, setAuditModal] = useState<{ emp: Employee; editorName: string; remark: string } | null>(null)
  const [homeLoading, setHomeLoading] = useState(true)

  // ── Add employee modal ──
  const [showAdd, setShowAdd] = useState(false)
  const [newEmp, setNewEmp] = useState<NewEmp>(EMPTY_NEW_EMP)
  const [addSaving, setAddSaving] = useState(false)

  // ── Load weekly data + schedule ──
  useEffect(() => {
    setWeekLoading(true)
    const weekStr = isoDate(weekStart)
    Promise.all([
      getWeekTimeRecords(shopCode, weekStr),
      getWeekSchedule(shopCode),
    ]).then(([{ employees, timeRecords, weekDates: wd }, { schedules }]) => {
      // Build schedule map for this week
      const sched = schedules.find((s) => s.weekStart === weekStr)
      const schedMap: Map<string, (string | null)[]> | null = sched
        ? new Map(sched.entries.map((e) => [e.employeeId, e.days]))
        : null

      // Filter staff: if schedule exists, only show employees who have entries in it
      // Also hide fired employees on current/future weeks
      const isPastWeek = new Date(weekStr + 'T00:00:00') < getMonday(new Date())
      const allStaff = employees.filter((e) =>
        (e.positions.includes('Front') || e.positions.includes('Kitchen')) &&
        (isPastWeek || !e.fired)
      )
      const staff = schedMap
        ? allStaff.filter((e) => schedMap.has(e.id))
        : allStaff

      setStaffEmps(staff)
      setWeekScheduleMap(schedMap)
      setWeekDates(wd)
      const map: WeekAttendMap = {}
      wd.forEach((d) => {
        map[d] = {}
        staff.forEach((e) => {
          const r = timeRecords.find((r) => r.date === d && r.employeeId === e.id)
          map[d][e.id] = { morning: r?.morning ?? 0, evening: r?.evening ?? 0 }
        })
      })
      setWeekAttend(map)
      setWeekSaved(timeRecords.some((r) => r.morning > 0 || r.evening > 0))
      setWeekEditing(false)
    })
      .catch(console.error)
      .finally(() => setWeekLoading(false))
  }, [shopCode, weekStart])

  // ── Load daily Home data ──
  useEffect(() => {
    setHomeLoading(true)
    getTimeRecordData(shopCode, date)
      .then(({ employees, deliveryTrips }) => {
        const isToday = date >= today()
        const home = employees.filter((e) => e.positions.includes('Home') && (!isToday || !e.fired))
        setHomeEmps(home)
        const t: TripMap = {}
        const cod: Record<string, number> = {}
        const saved: Record<string, boolean> = {}
        home.forEach((e) => {
          const empTrips = deliveryTrips.filter((tr) => tr.employeeId === e.id)
          t[e.id] = empTrips.map((tr) => ({ ...tr, cod: undefined }))
          cod[e.id] = empTrips.reduce((s, tr) => s + (tr.cod ?? 0), 0)
          saved[e.id] = empTrips.length > 0
        })
        setTrips(t)
        setCodByEmp(cod)
        setSavedByEmp(saved)
        setEditingByEmp({})
        setNoteByEmp({})
        // Capture original state for already-saved employees
        const originals: Record<string, { trips: DeliveryTrip[]; cod: number; note: string }> = {}
        home.forEach((e) => {
          if (saved[e.id]) {
            originals[e.id] = {
              trips: deliveryTrips.filter((tr) => tr.employeeId === e.id).map((tr) => ({ ...tr, cod: undefined })),
              cod: deliveryTrips.filter((tr) => tr.employeeId === e.id).reduce((s, tr) => s + (tr.cod ?? 0), 0),
              note: '',
            }
          }
        })
        setOriginalByEmp(originals)
      })
      .catch(console.error)
      .finally(() => setHomeLoading(false))
  }, [shopCode, date])

  // Returns true if employee is scheduled for this day+shift (or no schedule saved)
  function isScheduledSlot(empId: string, dayIdx: number, shift: 'morning' | 'evening'): boolean {
    if (!weekScheduleMap) return true  // no schedule → allow all
    const days = weekScheduleMap.get(empId)
    if (!days) return false
    const slotIdx = dayIdx * 2 + (shift === 'morning' ? 0 : 1)
    return days[slotIdx] !== null && days[slotIdx] !== undefined
  }

  // ── Weekly handlers ──
  function setShift(date: string, empId: string, shift: 'morning' | 'evening', val: number) {
    setWeekAttend((p) => ({
      ...p,
      [date]: { ...p[date], [empId]: { ...p[date][empId], [shift]: val } },
    }))
  }

  async function doSaveWeek(editorName: string, note: string) {
    setWeekAuditModal(null)
    setWeekSaving(true)
    const weekStr = isoDate(weekStart)
    const isEdit = weekSaved
    try {
      const records: TimeRecord[] = weekDates.flatMap((d) =>
        staffEmps.map((e) => {
          const a = weekAttend[d]?.[e.id] ?? { morning: 0, evening: 0 }
          return { date: d, employeeId: e.id, morning: a.morning, evening: a.evening }
        }),
      )
      await saveTimeRecords(shopCode, weekStr, records, [])
      const roleName = session.role.charAt(0).toUpperCase() + session.role.slice(1)
      await saveAuditLog(shopCode, {
        editorName: isEdit ? editorName : roleName,
        note: isEdit ? note : '',
        employeeName: 'weekly',
        shift: weekStr,
        changes: isEdit
          ? `Edit weekly time records: week ${weekStr}`
          : `Save weekly time records: week ${weekStr}`,
      })
      setWeekSaved(true)
      setWeekEditing(false)
    } catch (err) {
      console.error('[doSaveWeek]', err)
      alert(tr.save_fail)
    } finally {
      setWeekSaving(false)
    }
  }

  function handleSaveWeekClick() {
    if (weekSaved) {
      // Edit — require audit modal
      setWeekAuditModal({ editorName: '', note: '' })
    } else {
      // First save — auto-log with role
      doSaveWeek('', '')
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
      if (emp.positions.includes('Front') || emp.positions.includes('Kitchen')) {
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
        setSavedByEmp((p) => ({ ...p, [emp.id]: false }))
      }
      setNewEmp(EMPTY_NEW_EMP)
      setShowAdd(false)
      // Auto-log without requiring name/note — use role as editorName
      const shift = emp.positions.includes('Home')
        ? (emp.defaultDays[0] ? 'Morning' : 'Evening')
        : emp.positions.join(', ')
      const roleName = session.role.charAt(0).toUpperCase() + session.role.slice(1)
      saveAuditLog(shopCode, {
        editorName: roleName,
        note: '',
        employeeName: emp.name,
        shift,
        changes: `Add employee: ${emp.name} (${emp.positions.join(', ')})`,
      }).catch(() => {})
    } catch {
      alert(tr.add_emp_fail)
    } finally {
      setAddSaving(false)
    }
  }

  // ── Remove from view only (does NOT delete from Employees) ──
  function handleDeleteEmployee(empId: string, name: string) {
    if (!confirm(tr.confirm_delete_emp2(name))) return
    setStaffEmps((p) => p.filter((e) => e.id !== empId))
    setHomeEmps((p) => p.filter((e) => e.id !== empId))
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
    const emp = homeEmps.find((e) => e.id === empId)
    const fee = emp?.deliveryFeePerTrip != null
      ? emp.deliveryFeePerTrip
      : calcDeliveryFee(km, deliveryRates)
    setTrips((p) => ({
      ...p,
      [empId]: p[empId].map((t) => (t.id === tripId ? { ...t, distance: km, fee } : t)),
    }))
  }

  function removeTrip(empId: string, tripId: string) {
    setTrips((p) => ({ ...p, [empId]: p[empId].filter((t) => t.id !== tripId) }))
  }

  function buildChangeSummary(emp: Employee): string {
    const orig = originalByEmp[emp.id]
    const newTrips = (trips[emp.id] ?? []).filter((t) => t.distance > 0)
    const newCod = codByEmp[emp.id] ?? 0
    const newNote = noteByEmp[emp.id] ?? ''

    if (!orig) {
      // First save
      const parts: string[] = []
      if (newTrips.length > 0) parts.push(`trips=[${newTrips.map((t) => t.distance).join(', ')}]km`)
      if (newCod > 0) parts.push(`cod=${newCod}`)
      if (newNote) parts.push(`note="${newNote}"`)
      return parts.length > 0 ? `New: ${parts.join(', ')}` : 'New (empty)'
    }

    // Edit — show what changed
    const changes: string[] = []
    const origDists = orig.trips.filter((t) => t.distance > 0).map((t) => t.distance)
    const newDists = newTrips.map((t) => t.distance)
    if (JSON.stringify(origDists) !== JSON.stringify(newDists)) {
      changes.push(`trips=[${origDists.join(', ')}]→[${newDists.join(', ')}]km`)
    }
    if (orig.cod !== newCod) changes.push(`cod=${orig.cod}→${newCod}`)
    if (orig.note !== newNote) changes.push(`note="${orig.note}"→"${newNote}"`)
    return changes.length > 0 ? changes.join(' | ') : 'No changes'
  }

  async function doSaveEmp(emp: Employee, editorName: string, remark: string) {
    setAuditModal(null)
    setEmpSaving((p) => ({ ...p, [emp.id]: true }))
    try {
      // Save ALL home trips together to avoid data loss (skip empty rows)
      const allTrips = homeEmps.flatMap((e) => {
        const empTrips = (trips[e.id] ?? []).filter((t) => t.distance > 0)
        const cod = codByEmp[e.id] ?? 0
        if (empTrips.length === 0) return []
        return empTrips.map((t, i) => ({ ...t, cod: i === 0 && cod > 0 ? cod : undefined }))
      })
      await saveTimeRecords(shopCode, date, [], allTrips)
      // COD is tracked via audit log — no longer auto-saved to revenue
      // Save audit log with change summary
      const shift = emp.defaultDays[0] ? 'Morning' : emp.defaultDays[1] ? 'Evening' : ''
      const changes = buildChangeSummary(emp)
      await saveAuditLog(shopCode, { editorName, note: remark, employeeName: emp.name, shift, changes })
      setSavedByEmp((p) => ({ ...p, [emp.id]: true }))
      setEditingByEmp((p) => ({ ...p, [emp.id]: false }))
      alert(tr.save)
    } catch {
      alert(tr.save_fail)
    } finally {
      setEmpSaving((p) => ({ ...p, [emp.id]: false }))
    }
  }

  const todayMonday = getMonday(new Date())
  const isPast = weekStart < todayMonday
  const isFuture = weekStart > todayMonday
  const weekLocked = weekSaved && !weekEditing
  const isToday = date === today()

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

      {/* ═══ WEEKLY — Front / Kitchen ═══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">{tr.front_back_weekly}</h3>
        </div>

        {/* Week Nav */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <button
            onClick={() => { setWeekStart((p) => addWeeks(p, -1)); setWeekEditing(false) }}
            className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
          >
            ◀
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-700" suppressHydrationWarning>{weekLabel(weekStart, locale)}</div>
            {isPast && <div className="text-xs text-gray-400 mt-0.5">{tr.read_only}</div>}
            {isFuture && <div className="text-xs text-orange-400 mt-0.5">ยังไม่ถึงสัปดาห์นี้</div>}
          </div>
          <button
            onClick={() => { setWeekStart((p) => addWeeks(p, 1)); setWeekEditing(false) }}
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
              { label: 'Kitchen', color: 'text-brand-gold', emps: staffEmps.filter((e) => e.positions.includes('Kitchen')) },
            ].map(({ label, color, emps }) =>
              emps.length === 0 ? null : (
                <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
                                <span className="text-[9px] text-orange-300 w-8 text-center">{tr.morning}</span>
                                <span className="text-[9px] text-blue-300 w-8 text-center">{tr.evening}</span>
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
                            {weekDates.map((d, dayIdx) => {
                              const a = weekAttend[d]?.[emp.id] ?? { morning: 0, evening: 0 }
                              return (
                                <React.Fragment key={d}>
                                  {(['morning', 'evening'] as const).map((shift) => {
                                    const scheduled = isScheduledSlot(emp.id, dayIdx, shift)
                                    return (
                                    <td key={shift} className="text-center px-0.5 py-1.5">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        disabled={isPast || weekLocked || isFuture || !scheduled}
                                        value={a[shift] || ''}
                                        onChange={(e) => setShift(d, emp.id, shift, Number(e.target.value))}
                                        placeholder="0"
                                        className={`w-8 text-center border rounded px-0.5 py-1 text-xs focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-300 ${
                                          shift === 'morning'
                                            ? 'border-orange-200 focus:ring-orange-300'
                                            : 'border-blue-200 focus:ring-blue-300'
                                        }`}
                                      />
                                    </td>
                                  )})}
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

            {!isPast && !isFuture && staffEmps.length > 0 && (
              weekLocked ? (
                <button
                  onClick={() => setWeekEditing(true)}
                  className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark transition-colors cursor-pointer"
                >
                  ✏️ {tr.edit ?? 'Edit'}
                </button>
              ) : (
                <button
                  onClick={handleSaveWeekClick}
                  disabled={weekSaving}
                  className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {weekSaving ? tr.saving : tr.save_weekly}
                </button>
              )
            )}
          </>
        )}
      </div>

      {/* ═══ DAILY — Home Delivery ════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700">{tr.home_delivery_daily}</h3>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="text-xs text-gray-500 block mb-1.5">{tr.date_label}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
          {!isToday && (
            <p className="text-xs text-orange-500 mt-1">⚠ ดูได้อย่างเดียว (ไม่ใช่วันนี้)</p>
          )}
        </div>

        {/* ── Delivery Count Summary ─────────────────────────────────────── */}
        {!homeLoading && (() => {
          const allTrips = Object.values(trips).flat().filter((t) => t.distance > 0)
          const TIER_COLORS = [
            'bg-green-50 text-green-700',
            'bg-yellow-50 text-yellow-700',
            'bg-orange-50 text-orange-700',
            'bg-red-50 text-red-700',
            'bg-purple-50 text-purple-700',
            'bg-blue-50 text-blue-700',
            'bg-teal-50 text-teal-700',
          ]
          const buckets = deliveryRates.map((r, i) => {
            const prevMax = i === 0 ? 0 : deliveryRates[i - 1].maxKm
            const label = i === 0
              ? `≤${r.maxKm}km`
              : r.maxKm >= 9999
                ? `>${prevMax}km`
                : `>${prevMax}–${r.maxKm}km`
            const count = allTrips.filter((t) =>
              i === 0 ? t.distance <= r.maxKm : t.distance > prevMax && t.distance <= r.maxKm
            ).length
            return { label, count, color: TIER_COLORS[i % TIER_COLORS.length] }
          })
          const total = buckets.reduce((s, b) => s + b.count, 0)
          // choose grid cols: ≤3 tiers → cols = tiers+1, else → 4
          const gridCols = buckets.length <= 3 ? `grid-cols-${buckets.length + 1}` : 'grid-cols-4'
          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs font-semibold text-gray-600 mb-3">Delivery Count</div>
              <div className={`grid ${gridCols} gap-2 text-center`}>
                {buckets.map(({ label, count, color }) => (
                  <div key={label} className={`rounded-lg py-2 ${color}`}>
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-[10px] mt-0.5">{label}</div>
                  </div>
                ))}
                <div className="rounded-lg py-2 bg-brand-gold-light text-brand-gold font-bold">
                  <div className="text-lg">{total}</div>
                  <div className="text-[10px] mt-0.5">Total</div>
                </div>
              </div>
            </div>
          )
        })()}

        {homeLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">{tr.loading}</div>
        ) : (
          <>
            {homeEmps.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{tr.no_home}</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-600">Home Delivery</span>
                </div>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2">
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
                {homeEmps.map((emp) => {
                  const isSaved = savedByEmp[emp.id] && !editingByEmp[emp.id]
                  const isSavingThis = empSaving[emp.id]
                  return (
                  <div key={emp.id} className="border-b border-gray-50 last:border-0">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">{emp.name}</span>
                          {emp.defaultDays[0] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Morning</span>}
                          {emp.defaultDays[1] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">Evening</span>}
                          {emp.deliveryFeePerTrip != null && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">฿{emp.deliveryFeePerTrip}/รอบ</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {tr.total_col}: ${(trips[emp.id] ?? []).reduce((s, t) => s + t.fee, 0).toFixed(2)}
                          {deliveryFee > 0 && (
                            <span className="ml-1 text-orange-500">+ ${deliveryFee.toFixed(2)} fee = ${((trips[emp.id] ?? []).reduce((s, t) => s + t.fee, 0) + deliveryFee).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isSaved && (
                          <button
                            onClick={() => addTrip(emp.id)}
                            disabled={isSaved || !isToday}
                            className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {tr.add_trip}
                          </button>
                        )}
                        {isSaved ? (
                          <button
                            onClick={() => {
                              // Snapshot current saved state as "original" before editing
                              setOriginalByEmp((p) => ({
                                ...p,
                                [emp.id]: {
                                  trips: [...(trips[emp.id] ?? [])],
                                  cod: codByEmp[emp.id] ?? 0,
                                  note: noteByEmp[emp.id] ?? '',
                                },
                              }))
                              setEditingByEmp((p) => ({ ...p, [emp.id]: true }))
                            }}
                            className="text-xs bg-brand-gold text-white px-2.5 py-1 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            onClick={() => setAuditModal({ emp, editorName: '', remark: '' })}
                            disabled={!isToday || isSavingThis}
                            className="text-xs bg-brand-gold text-white px-2.5 py-1 rounded-lg hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isSavingThis ? '...' : tr.save}
                          </button>
                        )}
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
                          disabled={isSaved}
                          value={trip.distance || ''}
                          onChange={(e) => updateTrip(emp.id, trip.id, Number(e.target.value))}
                          placeholder="ระยะ (km)"
                          className="w-24 border border-brand-accent rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <span className="text-xs text-gray-400">km</span>
                        <span className="text-xs font-semibold text-green-700 w-10 text-right">
                          {trip.fee > 0 ? `$${trip.fee}` : '—'}
                        </span>
                        {!isSaved && (
                          <button
                            onClick={() => removeTrip(emp.id, trip.id)}
                            className="text-red-300 hover:text-red-500 cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="px-4 pb-1 flex items-center gap-2">
                      <label className="text-xs text-blue-500 font-medium">Cash on Delivery</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        disabled={isSaved}
                        value={codByEmp[emp.id] || ''}
                        onChange={(e) => setCodByEmp((p) => ({ ...p, [emp.id]: Number(e.target.value) }))}
                        placeholder="0"
                        className="w-28 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                    <div className="px-4 pb-3 flex items-center gap-2">
                      <label className="text-xs text-gray-400 font-medium">Note</label>
                      <input
                        type="text"
                        disabled={isSaved}
                        value={noteByEmp[emp.id] || ''}
                        onChange={(e) => setNoteByEmp((p) => ({ ...p, [emp.id]: e.target.value }))}
                        placeholder="optional"
                        className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                  )
                })}
              </div>
            )}

          </>
        )}
      </div>

      {/* ═══ Week Audit Modal ═══════════════════════════════════════════════ */}
      {weekAuditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">บันทึกการแก้ไข</h3>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Edit weekly time records: week of {isoDate(weekStart)}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ชื่อผู้แก้ไข *</label>
                <input
                  type="text"
                  autoFocus
                  value={weekAuditModal.editorName}
                  onChange={(e) => setWeekAuditModal((p) => p && ({ ...p, editorName: e.target.value }))}
                  placeholder="กรอกชื่อ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={weekAuditModal.note}
                  onChange={(e) => setWeekAuditModal((p) => p && ({ ...p, note: e.target.value }))}
                  placeholder="เหตุผลการแก้ไข (ถ้ามี)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setWeekAuditModal(null)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={() => doSaveWeek(weekAuditModal.editorName, weekAuditModal.note)}
                disabled={!weekAuditModal.editorName.trim()}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Audit Modal ════════════════════════════════════════════════════ */}
      {auditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">บันทึกการแก้ไข</h3>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium text-gray-700">{auditModal.emp.name}</span>
              {' · '}
              {auditModal.emp.defaultDays[0] ? 'Morning' : 'Evening'}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ชื่อผู้แก้ไข *</label>
                <input
                  type="text"
                  autoFocus
                  value={auditModal.editorName}
                  onChange={(e) => setAuditModal((p) => p && ({ ...p, editorName: e.target.value }))}
                  placeholder="กรอกชื่อ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={auditModal.remark}
                  onChange={(e) => setAuditModal((p) => p && ({ ...p, remark: e.target.value }))}
                  placeholder="เหตุผลการแก้ไข (ถ้ามี)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAuditModal(null)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={() => doSaveEmp(auditModal.emp, auditModal.editorName, auditModal.remark)}
                disabled={!auditModal.editorName.trim()}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {(['Front', 'Kitchen', 'Home'] as const).map((pos) => (
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
                  {(['Morning', 'Evening'] as const).map((shift, i) => {
                    const occupied = homeEmps.some(
                      (e) => savedByEmp[e.id] && !editingByEmp[e.id] && e.defaultDays[i]
                    )
                    return (
                      <button
                        key={shift}
                        type="button"
                        disabled={occupied}
                        onClick={() =>
                          setNewEmp((p) => ({
                            ...p,
                            defaultDays: p.defaultDays.map((_, j) => j === i),
                          }))
                        }
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                          occupied
                            ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                            : newEmp.defaultDays[i]
                            ? i === 0 ? 'bg-orange-100 text-orange-600 border-orange-300 cursor-pointer' : 'bg-blue-100 text-blue-700 border-blue-300 cursor-pointer'
                            : 'bg-brand-parchment text-gray-400 border-brand-accent cursor-pointer'
                        }`}
                      >
                        {shift}{occupied ? ' (taken)' : ''}
                      </button>
                    )
                  })}
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
