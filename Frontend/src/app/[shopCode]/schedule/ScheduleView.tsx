'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee, WeekSchedule, Position } from '@/lib/types'
import { saveWeekSchedule, saveEmployee, saveAuditLog } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

const DAYS_SHORT_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const DAYS_SHORT_EN = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']

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

const POSITIONS: Position[] = ['Front', 'Back', 'Home']
const POS_COLORS: Record<string, string> = {
  Manager: 'text-red-600 bg-red-50',
  Front: 'text-blue-600 bg-blue-50',
  Back: 'text-brand-gold bg-brand-gold-light',
  Home: 'text-green-600 bg-green-50',
}

type NewEmp = {
  name: string
  positions: Position[]
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
  const { lang } = useShop()
  const tr = translations[lang]
  const DAYS_SHORT = lang === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_TH
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  const [employees, setEmployees] = useState(initialEmployees)
  const [schedules, setSchedules] = useState(initialSchedules)
  const todayMonday = getMonday(new Date())
  const [weekStart, setWeekStart] = useState(todayMonday)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [auditModal, setAuditModal] = useState<{
    label: string; editorName: string; note: string
    onConfirm: (name: string, note: string) => void
  } | null>(null)
  const [newEmp, setNewEmp] = useState<NewEmp>({
    name: '',
    positions: ['Front'],
    defaultDays: [true, true, true, true, true, false, false],
  })

  const weekStr = isoDate(weekStart)
  const isPast = weekStart < todayMonday
  const weekSaved = schedules.some((s) => s.weekStart === weekStr)
  const isLocked = !isPast && weekSaved && !isEditing
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // days array: 14 elements — index (dayIdx*2) = morning, (dayIdx*2+1) = evening
  function getEntry(empId: string): (string | null)[] {
    const sched = schedules.find((s) => s.weekStart === weekStr)
    if (sched) {
      const e = sched.entries.find((e) => e.employeeId === empId)
      if (e && e.days.length === 14) return e.days as (string | null)[]
    }
    const emp = employees.find((e) => e.id === empId)
    const defaultDays = emp?.defaultDays ?? Array(7).fill(false)
    const primaryPos = emp?.positions[0] ?? 'Front'
    return defaultDays.flatMap((d) => [d ? primaryPos : null, d ? primaryPos : null])
  }

  const canEdit = role === 'manager' || role === 'owner'

  function toggleShift(empId: string, slotIdx: number, pos: string) {
    if (isPast || isLocked || !canEdit) return
    setSchedules((prev) => {
      const all = [...prev]
      const si = all.findIndex((s) => s.weekStart === weekStr)
      const currentEntries =
        si >= 0
          ? all[si].entries
          : employees.map((e) => ({ employeeId: e.id, days: getEntry(e.id) }))
      const newEntries = currentEntries.map((e) =>
        e.employeeId === empId
          ? { ...e, days: e.days.map((d, i) => (i === slotIdx ? (d === pos ? null : pos) : d)) }
          : e,
      )
      const merged = employees.map((emp) => {
        const found = newEntries.find((e) => e.employeeId === emp.id)
        return found ?? { employeeId: emp.id, days: getEntry(emp.id) }
      })
      const ws = { weekStart: weekStr, entries: merged }
      if (si >= 0) all[si] = ws
      else all.push(ws)
      return all
    })
  }

  function handleSave() {
    const isEdit = weekSaved
    setAuditModal({
      label: isEdit ? `Edit schedule: week of ${weekStr}` : `Save schedule: week of ${weekStr}`,
      editorName: '', note: '',
      onConfirm: async (editorName, note) => {
        setSaving(true)
        try {
          const entries = employees.map((emp) => ({ employeeId: emp.id, days: getEntry(emp.id) }))
          await saveWeekSchedule(shopCode, { weekStart: weekStr, entries })
          await saveAuditLog(shopCode, {
            editorName, note, employeeName: 'schedule', shift: weekStr,
            changes: isEdit ? `Edit schedule: week ${weekStr}` : `Save schedule: week ${weekStr}`,
          })
          setIsEditing(false)
        } catch (e) {
          alert(tr.save_fail)
          console.error(e)
        } finally {
          setSaving(false)
        }
      },
    })
  }

  async function handleAddEmployee() {
    if (!newEmp.name.trim() || newEmp.positions.length === 0) return
    const emp: Employee = {
      id: Date.now().toString(),
      name: newEmp.name.trim(),
      positions: newEmp.positions,
      defaultDays: newEmp.defaultDays,
    }
    try {
      await saveEmployee(shopCode, emp)
      setEmployees((p) => [...p, emp])
      setNewEmp({ name: '', positions: ['Front'], defaultDays: [true, true, true, true, true, false, false] })
      setShowAdd(false)
    } catch {
      alert(tr.add_emp_fail)
    }
  }

  function handleDelete(empId: string) {
    const emp = employees.find((e) => e.id === empId)
    setAuditModal({
      label: `Remove from schedule: ${emp?.name ?? empId}`,
      editorName: '', note: '',
      onConfirm: async (editorName, note) => {
        // Remove from local state
        const updatedEmployees = employees.filter((e) => e.id !== empId)
        setEmployees(updatedEmployees)
        // Save schedule without this employee (does NOT delete from Employees page)
        const updatedEntries = updatedEmployees.map((e) => ({ employeeId: e.id, days: getEntry(e.id) }))
        try {
          await saveWeekSchedule(shopCode, { weekStart: weekStr, entries: updatedEntries })
        } catch {
          alert(tr.save_fail)
        }
        await saveAuditLog(shopCode, {
          editorName, note, employeeName: emp?.name ?? empId, shift: '',
          changes: `Remove from schedule: ${emp?.name ?? empId} (week ${weekStr})`,
        })
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.schedule_title}</h2>
        {(role === 'manager' || role === 'owner') && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
          >
            {tr.add_employee_btn}
          </button>
        )}
      </div>

      {/* Week Nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <button
          onClick={() => { setWeekStart((p) => addWeeks(p, -1)); setIsEditing(false) }}
          className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
        >
          ◀
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-700" suppressHydrationWarning>{weekLabel(weekStart, locale)}</div>
          {isPast && <div className="text-xs text-gray-400 mt-0.5">{tr.read_only}</div>}
        </div>
        <button
          onClick={() => { setWeekStart((p) => addWeeks(p, 1)); setIsEditing(false) }}
          className="text-gray-500 hover:text-gray-800 w-8 h-8 flex items-center justify-center rounded cursor-pointer"
        >
          ▶
        </button>
      </div>

      {/* Matrix per position group */}
      {POSITIONS.map((pos) => {
        const savedSched = schedules.find((s) => s.weekStart === weekStr)
        const posEmps = employees.filter((e) => {
          if (!e.positions.includes(pos)) return false
          if (!weekSaved || !savedSched) return true
          return savedSched.entries.some((entry) => entry.employeeId === e.id)
        })
        if (!posEmps.length) return null
        return (
          <div key={pos} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
                      {tr.name_label}
                    </th>
                    {DAYS_SHORT.map((d, i) => (
                      <th key={i} colSpan={2} className="text-center px-1 py-2 text-xs text-gray-400 font-medium">
                        <div>{d}</div>
                        <div className="text-gray-300 text-[10px]">{weekDates[i].getDate()}</div>
                        <div className="flex gap-0.5 justify-center mt-0.5">
                          <span className="text-[9px] text-orange-300 w-5 text-center">{tr.morning}</span>
                          <span className="text-[9px] text-blue-300 w-5 text-center">{tr.evening}</span>
                        </div>
                      </th>
                    ))}
                    {(role === 'manager' || role === 'owner') && <th className="w-6" />}
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
                          <Fragment key={dayIdx}>
                            {[0, 1].map((shift) => {
                              const slotIdx = dayIdx * 2 + shift
                              const slotVal = days[slotIdx] ?? null
                              const checked = slotVal === pos
                              const blockedByOther = slotVal !== null && slotVal !== pos
                              const color = blockedByOther
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                : shift === 0
                                ? checked ? 'bg-orange-100 text-orange-500 hover:bg-orange-200' : 'bg-brand-parchment text-gray-300 hover:bg-gray-100'
                                : checked ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-brand-parchment text-gray-300 hover:bg-gray-100'
                              return (
                                <td key={slotIdx} className="text-center px-0.5 py-1.5">
                                  <button
                                    onClick={() => toggleShift(emp.id, slotIdx, pos)}
                                    disabled={isPast || isLocked || !canEdit || blockedByOther}
                                    className={`w-5 h-6 rounded text-[10px] font-bold transition-colors cursor-pointer ${color} disabled:cursor-default`}
                                  >
                                    {checked ? '✓' : blockedByOther ? '—' : '·'}
                                  </button>
                                </td>
                              )
                            })}
                          </Fragment>
                        ))}
                        {(role === 'manager' || role === 'owner') && (
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
          {(role === 'manager' || role === 'owner') ? tr.no_emp_owner : tr.no_emp_staff}
        </div>
      )}

      {!isPast && canEdit && employees.length > 0 && (
        isLocked ? (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark transition-colors cursor-pointer"
          >
            ✏️ {tr.edit ?? 'Edit'}
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-brand-gold text-white rounded-xl font-semibold text-sm hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? tr.saving : tr.save_schedule}
          </button>
        )
      )}

      {/* Audit Modal */}
      {auditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">บันทึกการเปลี่ยนแปลง</h3>
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{auditModal.label}</div>
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
                  value={auditModal.note}
                  onChange={(e) => setAuditModal((p) => p && ({ ...p, note: e.target.value }))}
                  placeholder="เหตุผล (ถ้ามี)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAuditModal(null)} className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer">{tr.cancel}</button>
              <button
                onClick={() => { auditModal.onConfirm(auditModal.editorName, auditModal.note); setAuditModal(null) }}
                disabled={!auditModal.editorName.trim()}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAdd && (role === 'manager' || role === 'owner') && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">{tr.add_employee}</h3>
            <input
              type="text"
              placeholder={tr.name_placeholder}
              value={newEmp.name}
              onChange={(e) => setNewEmp((p) => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
            <div className="flex gap-2">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setNewEmp((p) => ({ ...p, positions: [pos] }))}
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
            <div>
              <label className="text-xs text-gray-500 mb-2 block">{tr.default_working_days}</label>
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
                {tr.cancel}
              </button>
              <button
                onClick={handleAddEmployee}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                {tr.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
