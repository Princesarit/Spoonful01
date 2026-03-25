'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, WeekSchedule } from '@/lib/types'
import { saveWeekSchedule, saveEmployee, deleteEmployee } from './actions'

const DAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

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

const POSITIONS: Employee['position'][] = ['Front', 'Back', 'Home']
const POS_COLORS: Record<string, string> = {
  Front: 'text-blue-600 bg-blue-50',
  Back: 'text-brand-gold bg-brand-gold-light',
  Home: 'text-green-600 bg-green-50',
}

type NewEmp = {
  name: string
  position: Employee['position']
  dailyWage: number
  defaultDays: boolean[]
}

export default function ScheduleView({
  initialEmployees,
  initialSchedules,
  role,
}: {
  initialEmployees: Employee[]
  initialSchedules: WeekSchedule[]
  role: string
}) {
  const { shopCode } = useParams() as { shopCode: string }
  const [employees, setEmployees] = useState(initialEmployees)
  const [schedules, setSchedules] = useState(initialSchedules)
  const todayMonday = getMonday(new Date())
  const [weekStart, setWeekStart] = useState(todayMonday)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newEmp, setNewEmp] = useState<NewEmp>({
    name: '',
    position: 'Front',
    dailyWage: 350,
    defaultDays: [true, true, true, true, true, false, false],
  })

  const weekStr = isoDate(weekStart)
  const isPast = weekStart < todayMonday
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // days array: 14 elements — index (dayIdx*2) = เช้า, (dayIdx*2+1) = เย็น
  function getEntry(empId: string): boolean[] {
    const sched = schedules.find((s) => s.weekStart === weekStr)
    if (sched) {
      const e = sched.entries.find((e) => e.employeeId === empId)
      if (e && e.days.length === 14) return e.days
    }
    const defaultDays = employees.find((e) => e.id === empId)?.defaultDays ?? Array(7).fill(false)
    return defaultDays.flatMap((d) => [d, d])
  }

  function toggleShift(empId: string, slotIdx: number) {
    if (isPast) return
    setSchedules((prev) => {
      const all = [...prev]
      const si = all.findIndex((s) => s.weekStart === weekStr)
      const currentEntries =
        si >= 0
          ? all[si].entries
          : employees.map((e) => ({ employeeId: e.id, days: getEntry(e.id) }))
      const newEntries = currentEntries.map((e) =>
        e.employeeId === empId
          ? { ...e, days: e.days.map((d, i) => (i === slotIdx ? !d : d)) }
          : e,
      )
      const merged = employees.map((emp) => {
        const found = newEntries.find((e) => e.employeeId === emp.id)
        return found ?? { employeeId: emp.id, days: getEntry(emp.id) }
      })
      const ws: WeekSchedule = { weekStart: weekStr, entries: merged }
      if (si >= 0) all[si] = ws
      else all.push(ws)
      return all
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const entries = employees.map((emp) => ({ employeeId: emp.id, days: getEntry(emp.id) }))
      await saveWeekSchedule(shopCode, { weekStart: weekStr, entries })
    } catch (e) {
      alert('บันทึกไม่สำเร็จ')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddEmployee() {
    if (!newEmp.name.trim()) return
    const emp: Employee = {
      id: Date.now().toString(),
      name: newEmp.name.trim(),
      position: newEmp.position,
      dailyWage: newEmp.dailyWage,
      defaultDays: newEmp.defaultDays,
    }
    try {
      await saveEmployee(shopCode, emp)
      setEmployees((p) => [...p, emp])
      setNewEmp({ name: '', position: 'Front', dailyWage: 350, defaultDays: [true, true, true, true, true, false, false] })
      setShowAdd(false)
    } catch {
      alert('เพิ่มพนักงานไม่สำเร็จ (ต้องเป็น Manager)')
    }
  }

  async function handleDelete(empId: string) {
    if (!confirm('ลบพนักงานคนนี้?')) return
    try {
      await deleteEmployee(shopCode, empId)
      setEmployees((p) => p.filter((e) => e.id !== empId))
    } catch {
      alert('ลบไม่สำเร็จ')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← กลับ
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">ตารางเวลา</h2>
        {role === 'owner' && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
          >
            + พนักงาน
          </button>
        )}
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

      {/* Matrix per position group */}
      {POSITIONS.map((pos) => {
        const posEmps = employees.filter((e) => e.position === pos)
        if (!posEmps.length) return null
        return (
          <div key={pos} className="bg-white rounded-xl border border-brand-accent overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${POS_COLORS[pos]}`}>
                {pos}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium min-w-22.5">
                      ชื่อ
                    </th>
                    {DAYS_SHORT.map((d, i) => (
                      <th key={i} colSpan={2} className="text-center px-1 py-2 text-xs text-gray-400 font-medium">
                        <div>{d}</div>
                        <div className="text-gray-300 text-[10px]">{weekDates[i].getDate()}</div>
                        <div className="flex gap-0.5 justify-center mt-0.5">
                          <span className="text-[9px] text-blue-300 w-5 text-center">เช้า</span>
                          <span className="text-[9px] text-orange-300 w-5 text-center">เย็น</span>
                        </div>
                      </th>
                    ))}
                    {role === 'owner' && <th className="w-6" />}
                  </tr>
                </thead>
                <tbody>
                  {posEmps.map((emp) => {
                    const days = getEntry(emp.id)
                    return (
                      <tr key={emp.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">
                          {emp.name}
                        </td>
                        {Array.from({ length: 7 }, (_, dayIdx) => (
                          <>
                            {[0, 1].map((shift) => {
                              const slotIdx = dayIdx * 2 + shift
                              const checked = days[slotIdx] ?? false
                              const color = shift === 0
                                ? checked ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-brand-parchment text-gray-300 hover:bg-gray-100'
                                : checked ? 'bg-orange-100 text-orange-500 hover:bg-orange-200' : 'bg-brand-parchment text-gray-300 hover:bg-gray-100'
                              return (
                                <td key={slotIdx} className="text-center px-0.5 py-1.5">
                                  <button
                                    onClick={() => toggleShift(emp.id, slotIdx)}
                                    disabled={isPast}
                                    className={`w-5 h-6 rounded text-[10px] font-bold transition-colors cursor-pointer ${color} disabled:cursor-default`}
                                  >
                                    {checked ? '✓' : '·'}
                                  </button>
                                </td>
                              )
                            })}
                          </>
                        ))}
                        {role === 'owner' && (
                          <td className="px-1">
                            <button
                              onClick={() => handleDelete(emp.id)}
                              className="text-red-300 hover:text-red-500 text-base leading-none cursor-pointer"
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {employees.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          {role === 'owner' ? 'กด "+ พนักงาน" เพื่อเพิ่มพนักงาน' : 'ยังไม่มีพนักงาน — ติดต่อ Manager'}
        </div>
      )}

      {!isPast && employees.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกตาราง'}
        </button>
      )}

      {/* Add Employee Modal */}
      {showAdd && role === 'owner' && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">เพิ่มพนักงาน</h3>
            <input
              type="text"
              placeholder="ชื่อพนักงาน"
              value={newEmp.name}
              onChange={(e) => setNewEmp((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
            <div className="flex gap-2">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setNewEmp((p) => ({ ...p, position: pos }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    newEmp.position === pos
                      ? 'bg-brand-gold text-white border-brand-gold'
                      : 'border-brand-accent text-gray-600 hover:border-brand-gold/50'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-2 block">วันทำงานปกติ (default)</label>
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
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAddEmployee}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                เพิ่ม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
