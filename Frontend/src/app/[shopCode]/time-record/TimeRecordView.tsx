'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, TimeRecord, DeliveryTrip } from '@/lib/types'
import { DELIVERY_FEE_TABLE, calcDeliveryFee } from '@/lib/config'
import { getTimeRecordData, saveTimeRecords } from './actions'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

type AttendMap = Record<string, { attended: boolean; extra: number }>
type TripMap = Record<string, DeliveryTrip[]>

export default function TimeRecordView() {
  const { shopCode } = useParams() as { shopCode: string }
  const [date, setDate] = useState(today)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attend, setAttend] = useState<AttendMap>({})
  const [trips, setTrips] = useState<TripMap>({})
  const [cashInHand, setCashInHand] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    getTimeRecordData(shopCode, date)
      .then(({ employees: emps, timeRecords, deliveryTrips }) => {
        setEmployees(emps)
        const a: AttendMap = {}
        emps.forEach((e) => {
          const r = timeRecords.find((r) => r.employeeId === e.id)
          a[e.id] = { attended: r?.attended ?? false, extra: r?.extra ?? 0 }
        })
        setAttend(a)
        const t: TripMap = {}
        emps.filter((e) => e.position === 'Home').forEach((e) => {
          t[e.id] = deliveryTrips.filter((tr) => tr.employeeId === e.id)
        })
        setTrips(t)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shopCode, date])

  function setAttended(empId: string, val: boolean) {
    setAttend((p) => ({ ...p, [empId]: { ...p[empId], attended: val } }))
  }
  function setExtra(empId: string, val: number) {
    setAttend((p) => ({ ...p, [empId]: { ...p[empId], extra: val } }))
  }

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

  // Calculations
  const staffEmps = employees.filter((e) => e.position !== 'Home')
  const homeEmps = employees.filter((e) => e.position === 'Home')

  const staffWages = staffEmps.reduce((sum, e) => {
    const a = attend[e.id]
    if (!a?.attended) return sum
    return sum + e.dailyWage + (a.extra ?? 0)
  }, 0)

  const deliveryWages = homeEmps.reduce((sum, e) => {
    return sum + (trips[e.id] ?? []).reduce((s, t) => s + t.fee, 0)
  }, 0)

  const total = staffWages + deliveryWages
  const cashInHandNum = parseFloat(cashInHand) || 0
  const netReceive = cashInHandNum - total

  async function handleSave() {
    setSaving(true)
    try {
      const records: TimeRecord[] = employees.map((e) => ({
        date,
        employeeId: e.id,
        attended: attend[e.id]?.attended ?? false,
        extra: attend[e.id]?.extra ?? 0,
      }))
      const allTrips = Object.values(trips).flat()
      await saveTimeRecords(shopCode, date, records, allTrips)
      alert('บันทึกสำเร็จ')
    } catch {
      alert('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← กลับ
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">กรอกเวลา</h2>
      </div>

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

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด...</div>
      ) : (
        <>
          {/* Staff Table */}
          {staffEmps.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500">พนักงาน (Front / Back)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">ชื่อ</th>
                    <th className="text-center px-2 py-2 text-xs text-gray-400 font-medium">มา</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-400 font-medium">Extra (฿)</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-400 font-medium">ค่าแรง</th>
                  </tr>
                </thead>
                <tbody>
                  {staffEmps.map((emp) => {
                    const a = attend[emp.id] ?? { attended: false, extra: 0 }
                    const wage = a.attended ? emp.dailyWage + a.extra : 0
                    return (
                      <tr key={emp.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-medium text-gray-700">{emp.name}</div>
                          <div className="text-xs text-gray-400">{emp.position}</div>
                        </td>
                        <td className="text-center px-2 py-2">
                          <button
                            onClick={() => setAttended(emp.id, !a.attended)}
                            className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                              a.attended
                                ? 'bg-green-100 text-green-700'
                                : 'bg-brand-parchment text-gray-300'
                            }`}
                          >
                            {a.attended ? '✓' : '✗'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={a.extra || ''}
                            onChange={(e) => setExtra(emp.id, Number(e.target.value))}
                            placeholder="0"
                            className="w-20 text-right border border-brand-accent rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-gold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                          {wage > 0 ? `${wage.toLocaleString()}฿` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Home Delivery Table */}
          {homeEmps.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Home Delivery</span>
                <button
                  onClick={() => {
                    // Show fee table
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="ตารางค่าส่ง"
                >
                  📋 อัตราค่าส่ง
                </button>
              </div>

              {/* Fee reference */}
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
                      <div className="flex items-center gap-1 flex-1">
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
                      </div>
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

          {employees.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มีพนักงาน</div>
          )}

          {/* Summary */}
          <div className="bg-white rounded-xl border border-brand-accent overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500">สรุปประจำวัน</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Wages (พนักงาน)</span>
                <span className="font-semibold text-gray-800">{staffWages.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery</span>
                <span className="font-semibold text-gray-800">{deliveryWages.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-3">
                <span className="text-gray-700 font-medium">Total (จ่ายพนักงาน)</span>
                <span className="font-bold text-brand-gold">{total.toLocaleString()} ฿</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-3">
                <span className="text-gray-500">Cash in hand</span>
                <input
                  type="number"
                  value={cashInHand}
                  onChange={(e) => setCashInHand(e.target.value)}
                  placeholder="0"
                  className="w-28 text-right border border-brand-accent rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 font-medium">Net receive</span>
                <span
                  className={`font-bold ${netReceive >= 0 ? 'text-green-600' : 'text-red-500'}`}
                >
                  {cashInHand ? `${netReceive.toLocaleString()} ฿` : '—'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเข้างาน'}
          </button>
        </>
      )}
    </div>
  )
}
