'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord, DeliveryTrip, DeliveryRate } from '@/lib/types'
import { DEFAULT_DELIVERY_RATES, calcDeliveryFee } from '@/lib/config'
import { getWeekTimeRecords, getTimeRecordData, saveTimeRecords, getWeekSchedule } from './actions'
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

  // ── Select employee modal ──
  const [showSelect, setShowSelect] = useState(false)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [selectingEmp, setSelectingEmp] = useState<Employee | null>(null)

  // ── Load weekly data + schedule ──
  useEffect(() => {
    setWeekLoading(true)
    const weekStr = isoDate(weekStart)
    Promise.all([
      getWeekTimeRecords(shopCode, weekStr),
      getWeekSchedule(shopCode),
    ]).then(([{ employees, timeRecords, weekDates: wd }, { schedules }]) => {
      setAllEmployees(employees)
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
        const home = employees
          .filter((e) => e.positions.includes('Home') && (!isToday || !e.fired))
          .map((e) => ({ ...e, instanceId: e.id }))
        setHomeEmps(home)
        const t: TripMap = {}
        const cod: Record<string, number> = {}
        const saved: Record<string, boolean> = {}
        home.forEach((e) => {
          const iid = e.instanceId!
          const empTrips = deliveryTrips.filter((tr) => tr.employeeId === e.id)
          t[iid] = empTrips.map((tr) => ({ ...tr, cod: undefined }))
          cod[iid] = empTrips.reduce((s, tr) => s + (tr.cod ?? 0), 0)
          saved[iid] = empTrips.length > 0
        })
        setTrips(t)
        setCodByEmp(cod)
        setSavedByEmp(saved)
        setEditingByEmp({})
        setNoteByEmp({})
        // Capture original state for already-saved employees
        const originals: Record<string, { trips: DeliveryTrip[]; cod: number; note: string }> = {}
        home.forEach((e) => {
          const iid = e.instanceId!
          if (saved[iid]) {
            originals[iid] = {
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

  // ── Select employee from DB ──
  function handleSelectEmployee(emp: Employee, mealShift?: 'lunch' | 'dinner') {
    if (emp.positions.includes('Front') || emp.positions.includes('Kitchen')) {
      if (!staffEmps.some((e) => e.id === emp.id)) {
        setStaffEmps((p) => [...p, emp])
        setWeekAttend((p) => {
          const updated = { ...p }
          weekDates.forEach((d) => {
            updated[d] = { ...updated[d], [emp.id]: { morning: 0, evening: 0 } }
          })
          return updated
        })
      }
    }
    if (emp.positions.includes('Home')) {
      const iid = mealShift ? `${emp.id}_${mealShift}` : emp.id
      const empWithShift: Employee = {
        ...emp,
        instanceId: iid,
        defaultDays: mealShift
          ? emp.defaultDays.map((_, i) => i === (mealShift === 'lunch' ? 0 : 1))
          : emp.defaultDays,
      }
      setHomeEmps((p) => [...p, empWithShift])
      setTrips((p) => ({ ...p, [iid]: [] }))
      setCodByEmp((p) => ({ ...p, [iid]: 0 }))
      setSavedByEmp((p) => ({ ...p, [iid]: false }))
    }
    setSelectingEmp(null)
    setShowSelect(false)
  }

  // ── Remove from view only (does NOT delete from Employees) ──
  function handleDeleteEmployee(iid: string, name: string) {
    if (!confirm(tr.confirm_delete_emp2(name))) return
    setStaffEmps((p) => p.filter((e) => e.id !== iid))
    setHomeEmps((p) => p.filter((e) => (e.instanceId ?? e.id) !== iid))
  }

  // ── Home/Delivery handlers ──
  function addTrip(iid: string, emp: Employee) {
    const trip: DeliveryTrip = {
      id: Date.now().toString() + Math.random(),
      date,
      employeeId: emp.id,
      employeeName: emp.name,
      distance: 0,
      fee: 0,
    }
    setTrips((p) => ({ ...p, [iid]: [...(p[iid] ?? []), trip] }))
  }

  function updateTrip(iid: string, emp: Employee, tripId: string, km: number) {
    const fee = emp.deliveryFeePerTrip != null
      ? emp.deliveryFeePerTrip
      : calcDeliveryFee(km, deliveryRates)
    setTrips((p) => ({
      ...p,
      [iid]: p[iid].map((t) => (t.id === tripId ? { ...t, distance: km, fee } : t)),
    }))
  }

  function removeTrip(iid: string, tripId: string) {
    setTrips((p) => ({ ...p, [iid]: p[iid].filter((t) => t.id !== tripId) }))
  }

  function buildChangeSummary(emp: Employee): string {
    const iid = emp.instanceId ?? emp.id
    const orig = originalByEmp[iid]
    const newTrips = (trips[iid] ?? []).filter((t) => t.distance > 0)
    const newCod = codByEmp[iid] ?? 0
    const newNote = noteByEmp[iid] ?? ''

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
    const iid = emp.instanceId ?? emp.id
    setAuditModal(null)
    setEmpSaving((p) => ({ ...p, [iid]: true }))
    try {
      // Save ALL home trips together to avoid data loss (skip empty rows)
      const allTrips = homeEmps.flatMap((e) => {
        const eiid = e.instanceId ?? e.id
        const empTrips = (trips[eiid] ?? []).filter((t) => t.distance > 0)
        const cod = codByEmp[eiid] ?? 0
        if (empTrips.length === 0) return []
        return empTrips.map((t, i) => ({ ...t, employeeId: e.id, cod: i === 0 && cod > 0 ? cod : undefined }))
      })
      await saveTimeRecords(shopCode, date, [], allTrips)
      const shift = emp.defaultDays[0] ? 'Lunch' : emp.defaultDays[1] ? 'Dinner' : ''
      const changes = buildChangeSummary(emp)
      await saveAuditLog(shopCode, { editorName, note: remark, employeeName: emp.name, shift, changes })
      setSavedByEmp((p) => ({ ...p, [iid]: true }))
      setEditingByEmp((p) => ({ ...p, [iid]: false }))
      alert(tr.save)
    } catch {
      alert(tr.save_fail)
    } finally {
      setEmpSaving((p) => ({ ...p, [iid]: false }))
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
            onClick={() => { setShowSelect(true); setSelectingEmp(null) }}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
          >
            + Select
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
                {homeEmps.map((emp, empIdx) => {
                  const iid = emp.instanceId ?? emp.id
                  const isSaved = savedByEmp[iid] && !editingByEmp[iid]
                  const isSavingThis = empSaving[iid]
                  return (
                  <div key={`${iid}_${empIdx}`} className="border-b border-gray-50 last:border-0">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">{emp.name}</span>
                          {emp.defaultDays[0] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">Lunch</span>}
                          {emp.defaultDays[1] && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">Dinner</span>}
                          {emp.deliveryFeePerTrip != null && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">฿{emp.deliveryFeePerTrip}/รอบ</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {tr.total_col}: ${(trips[iid] ?? []).reduce((s, t) => s + t.fee, 0).toFixed(2)}
                          {deliveryFee > 0 && (
                            <span className="ml-1 text-orange-500">+ ${deliveryFee.toFixed(2)} fee = ${((trips[iid] ?? []).reduce((s, t) => s + t.fee, 0) + deliveryFee).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isSaved && (
                          <button
                            onClick={() => addTrip(iid, emp)}
                            disabled={isSaved || !isToday}
                            className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {tr.add_trip}
                          </button>
                        )}
                        {isSaved ? (
                          <button
                            onClick={() => {
                              setOriginalByEmp((p) => ({
                                ...p,
                                [iid]: {
                                  trips: [...(trips[iid] ?? [])],
                                  cod: codByEmp[iid] ?? 0,
                                  note: noteByEmp[iid] ?? '',
                                },
                              }))
                              setEditingByEmp((p) => ({ ...p, [iid]: true }))
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
                            onClick={() => handleDeleteEmployee(iid, emp.name)}
                            className="text-red-300 hover:text-red-500 text-base leading-none cursor-pointer"
                            title={tr.delete}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {(trips[iid] ?? []).map((trip, ti) => (
                      <div key={trip.id} className="px-4 pb-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 w-6">{ti + 1}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          disabled={isSaved}
                          value={trip.distance || ''}
                          onChange={(e) => updateTrip(iid, emp, trip.id, Number(e.target.value))}
                          placeholder="ระยะ (km)"
                          className="w-24 border border-brand-accent rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <span className="text-xs text-gray-400">km</span>
                        <span className="text-xs font-semibold text-green-700 w-10 text-right">
                          {trip.fee > 0 ? `$${trip.fee}` : '—'}
                        </span>
                        {!isSaved && (
                          <button
                            onClick={() => removeTrip(iid, trip.id)}
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
                        value={codByEmp[iid] || ''}
                        onChange={(e) => setCodByEmp((p) => ({ ...p, [iid]: Number(e.target.value) }))}
                        placeholder="0"
                        className="w-28 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                    <div className="px-4 pb-3 flex items-center gap-2">
                      <label className="text-xs text-gray-400 font-medium">Note</label>
                      <input
                        type="text"
                        disabled={isSaved}
                        value={noteByEmp[iid] || ''}
                        onChange={(e) => setNoteByEmp((p) => ({ ...p, [iid]: e.target.value }))}
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

      {/* ═══ Select Employee Modal ══════════════════════════════════════════ */}
      {showSelect && (() => {
        const staffIds = new Set(staffEmps.map((e) => e.id))
        const available = allEmployees.filter((e) => {
          if (e.fired) return false
          const isFrontKitchen = e.positions.some((p) => p === 'Front' || p === 'Kitchen')
          if (isFrontKitchen && staffIds.has(e.id)) return false
          return true
        })
        return (
          <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
              {selectingEmp ? (
                <>
                  <h3 className="font-bold text-gray-900">{selectingEmp.name} — เลือก Shift</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSelectEmployee(selectingEmp, 'lunch')}
                      className="flex-1 py-4 rounded-xl border-2 border-orange-300 bg-orange-50 text-orange-600 font-semibold text-sm hover:bg-orange-100 cursor-pointer transition-colors"
                    >
                      ☀️ Lunch
                    </button>
                    <button
                      onClick={() => handleSelectEmployee(selectingEmp, 'dinner')}
                      className="flex-1 py-4 rounded-xl border-2 border-blue-300 bg-blue-50 text-blue-600 font-semibold text-sm hover:bg-blue-100 cursor-pointer transition-colors"
                    >
                      🌙 Dinner
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectingEmp(null)}
                    className="w-full py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
                  >
                    {tr.cancel}
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-gray-900">เลือกพนักงาน</h3>
                  {available.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">ไม่มีพนักงานที่จะเพิ่ม</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {available.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => emp.positions.includes('Home') ? setSelectingEmp(emp) : handleSelectEmployee(emp)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-brand-accent hover:border-brand-gold hover:bg-brand-parchment text-left cursor-pointer transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-800">{emp.name}</span>
                          <span className="text-xs text-gray-400">{emp.positions.join(', ')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowSelect(false)}
                    className="w-full py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
                  >
                    {tr.cancel}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
