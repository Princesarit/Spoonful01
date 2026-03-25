'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord, DeliveryTrip } from '@/lib/types'
import { DELIVERY_FEE_TABLE, calcDeliveryFee } from '@/lib/config'
import { getWeekTimeRecords, getTimeRecordData, saveTimeRecords } from './actions'

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

function weekLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('th-TH', opts)} – ${sunday.toLocaleDateString('th-TH', { ...opts, year: '2-digit' })}`
}

const DAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

// ─── Types ────────────────────────────────────────────────────────────────────

type DayAttend = { morning: number; evening: number }
// weekAttend[isoDate][empId]
type WeekAttendMap = Record<string, Record<string, DayAttend>>
type TripMap = Record<string, DeliveryTrip[]>

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeRecordView() {
  const { shopCode } = useParams() as { shopCode: string }

  // ── Weekly state (Front / Back) ──
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [weekAttend, setWeekAttend] = useState<WeekAttendMap>({})
  const [staffEmps, setStaffEmps] = useState<Employee[]>([])
  const [weekLoading, setWeekLoading] = useState(true)
  const [weekSaving, setWeekSaving] = useState(false)

  // ── Daily state (Home) ──
  const [date, setDate] = useState(today)
  const [homeEmps, setHomeEmps] = useState<Employee[]>([])
  const [trips, setTrips] = useState<TripMap>({})
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeSaving, setHomeSaving] = useState(false)

  // ── Load weekly data ──
  useEffect(() => {
    setWeekLoading(true)
    getWeekTimeRecords(shopCode, isoDate(weekStart))
      .then(({ employees, timeRecords, weekDates: wd }) => {
        const staff = employees.filter((e) => e.position !== 'Home')
        setStaffEmps(staff)
        setWeekDates(wd)
        // build weekAttend map
        const map: WeekAttendMap = {}
        wd.forEach((d) => {
          map[d] = {}
          staff.forEach((e) => {
            const r = timeRecords.find((r) => r.date === d && r.employeeId === e.id)
            const packed = r?.extra ?? 0
            map[d][e.id] = {
              morning: Math.floor(packed / 10000),
              evening: packed % 10000,
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
        const home = employees.filter((e) => e.position === 'Home')
        setHomeEmps(home)
        const t: TripMap = {}
        home.forEach((e) => {
          t[e.id] = deliveryTrips.filter((tr) => tr.employeeId === e.id)
        })
        setTrips(t)
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
      await Promise.all(
        weekDates.map((d) => {
          const records: TimeRecord[] = staffEmps.map((e) => {
            const a = weekAttend[d]?.[e.id] ?? { morning: 0, evening: 0 }
            return {
              date: d,
              employeeId: e.id,
              attended: a.morning > 0 || a.evening > 0,
              extra: a.morning * 10000 + a.evening,
            }
          })
          return saveTimeRecords(shopCode, d, records, [])
        }),
      )
      alert('บันทึกสำเร็จ')
    } catch {
      alert('บันทึกไม่สำเร็จ')
    } finally {
      setWeekSaving(false)
    }
  }

  // ── Home/Delivery handlers ──
  function addTrip(empId: string) {
    const trip: DeliveryTrip = {
      id: Date.now().toString() + Math.random(),
      date,
      employeeId: empId,
      distance: 0,
      fee: 0,
    }
    setTrips((p) => ({ ...p, [empId]: [...(p[empId] ?? []), trip] }))
  }

  function updateTrip(empId: string, tripId: string, km: number) {
    const fee = calcDeliveryFee(km)
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
      const allTrips = Object.values(trips).flat()
      await saveTimeRecords(shopCode, date, [], allTrips)
      alert('บันทึกสำเร็จ')
    } catch {
      alert('บันทึกไม่สำเร็จ')
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
          ← กลับ
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">กรอกเวลา</h2>
      </div>

      {/* ═══ WEEKLY — Front / Back ═══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">Front / Back (รายสัปดาห์)</h3>
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
            <div className="text-sm font-semibold text-gray-700">{weekLabel(weekStart)}</div>
            {isPast && <div className="text-xs text-gray-400 mt-0.5">ดูได้อย่างเดียว</div>}
          </div>
          <button
            onClick={() => setWeekStart((p) => addWeeks(p, 1))}
            className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
          >
            ▶
          </button>
        </div>

        {weekLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : (
          <>
            {[
              { label: 'Front', color: 'text-blue-600', emps: staffEmps.filter((e) => e.position === 'Front') },
              { label: 'Back', color: 'text-brand-gold', emps: staffEmps.filter((e) => e.position === 'Back') },
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
                          <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium min-w-20">ชื่อ</th>
                          {weekDates.map((d, i) => (
                            <th key={d} colSpan={2} className="text-center px-1 py-2 text-xs text-gray-400 font-medium">
                              <div>{DAYS_SHORT[i]}</div>
                              <div className="text-gray-300 text-[10px]">{new Date(d + 'T00:00:00').getDate()}</div>
                              <div className="flex gap-0.5 justify-center mt-0.5">
                                <span className="text-[9px] text-blue-300 w-8 text-center">เช้า</span>
                                <span className="text-[9px] text-orange-300 w-8 text-center">เย็น</span>
                              </div>
                            </th>
                          ))}
                          <th className="text-center px-2 py-2 text-xs text-gray-400 font-medium">รวม</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            )}

            {staffEmps.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีพนักงาน Front / Back</div>
            )}

            {!isPast && staffEmps.length > 0 && (
              <button
                onClick={handleSaveWeek}
                disabled={weekSaving}
                className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
              >
                {weekSaving ? 'กำลังบันทึก...' : 'บันทึกตารางสัปดาห์'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ═══ DAILY — Home Delivery ════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-700">Home Delivery (รายวัน)</h3>

        {/* Date picker */}
        <div className="bg-white rounded-xl border border-brand-accent p-4">
          <label className="text-xs text-gray-500 block mb-1.5">วันที่</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
        </div>

        {homeLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">กำลังโหลด...</div>
        ) : (
          <>
            {homeEmps.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีพนักงาน Home</div>
            ) : (
              <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-600">Home Delivery</span>
                </div>
                <div className="px-4 py-2 bg-brand-parchment border-b border-gray-100 flex flex-wrap gap-2">
                  {DELIVERY_FEE_TABLE.filter((r) => r.maxKm !== Infinity).map((r) => (
                    <span key={r.maxKm} className="text-xs text-gray-500">
                      ≤{r.maxKm}km → {r.fee}฿
                    </span>
                  ))}
                </div>
                {homeEmps.map((emp) => (
                  <div key={emp.id} className="border-b border-gray-50 last:border-0">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">{emp.name}</div>
                        <div className="text-xs text-gray-400">
                          รวม: {(trips[emp.id] ?? []).reduce((s, t) => s + t.fee, 0).toLocaleString()}฿
                        </div>
                      </div>
                      <button
                        onClick={() => addTrip(emp.id)}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-100 cursor-pointer"
                      >
                        + เพิ่มรอบ
                      </button>
                    </div>
                    {(trips[emp.id] ?? []).map((trip, ti) => (
                      <div key={trip.id} className="px-4 pb-2 flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-10">รอบ {ti + 1}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={trip.distance || ''}
                          onChange={(e) => updateTrip(emp.id, trip.id, Number(e.target.value))}
                          placeholder="ระยะ (km)"
                          className="w-28 border border-brand-accent rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold"
                        />
                        <span className="text-xs text-gray-400">km</span>
                        <span className="text-xs font-semibold text-green-700 w-12 text-right">
                          {trip.fee > 0 ? `${trip.fee}฿` : '—'}
                        </span>
                        <button
                          onClick={() => removeTrip(emp.id, trip.id)}
                          className="text-red-300 hover:text-red-500 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
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
                {homeSaving ? 'กำลังบันทึก...' : 'บันทึก Home Delivery'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
