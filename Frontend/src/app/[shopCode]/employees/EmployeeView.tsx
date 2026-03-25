'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Employee } from '@/lib/types'
import { saveEmployeeAction, deleteEmployeeAction } from './actions'
import { v4 as uuidv4 } from 'uuid'

const POSITIONS: Employee['position'][] = ['Front', 'Back', 'Home']
const DAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const POS_COLORS: Record<string, string> = {
  Front: 'text-blue-600 bg-blue-50',
  Back: 'text-brand-gold bg-yellow-50',
  Home: 'text-green-600 bg-green-50',
}

const EMPTY_FORM = {
  name: '',
  position: 'Front' as Employee['position'],
  dailyWage: 0,
  defaultDays: [true, true, true, true, true, false, false],
}

export default function EmployeeView({
  initialEmployees,
  shopCode,
  role,
}: {
  initialEmployees: Employee[]
  shopCode: string
  role: string
}) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const isOwner = role === 'owner'

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      name: emp.name,
      position: emp.position,
      dailyWage: emp.dailyWage,
      defaultDays: [...emp.defaultDays],
    })
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const id = editing?.id || uuidv4()
    const result = await saveEmployeeAction(shopCode, { id, ...form })
    if (result.ok) {
      const emp: Employee = { id, ...form }
      setEmployees((prev) =>
        editing ? prev.map((e) => (e.id === id ? emp : e)) : [...prev, emp],
      )
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('ลบพนักงานนี้?')) return
    await deleteEmployeeAction(shopCode, id)
    setEmployees((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href={`/${shopCode}`} className="text-brand-accent text-sm hover:text-brand-green">
          ← กลับ
        </Link>
        <h2 className="font-bold text-brand-green">พนักงานประจำ</h2>
        {isOwner && (
          <button
            onClick={openAdd}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-xl cursor-pointer hover:bg-brand-gold-dark transition-colors"
          >
            + เพิ่ม
          </button>
        )}
      </div>

      {/* Employee List */}
      {employees.length === 0 ? (
        <div className="text-center text-brand-accent py-12 text-sm">ยังไม่มีพนักงาน</div>
      ) : (
        <div className="space-y-2">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="bg-white border border-brand-accent rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-brand-green text-sm">{emp.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${POS_COLORS[emp.position]}`}>
                    {emp.position}
                  </span>
                </div>
                <div className="text-xs text-brand-accent mb-2">
                  ค่าจ้าง: <span className="text-brand-green font-medium">{emp.dailyWage.toLocaleString()} บาท/วัน</span>
                </div>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <span
                      key={d}
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        emp.defaultDays[i]
                          ? 'bg-brand-green text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              {isOwner && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(emp)}
                    className="text-xs px-3 py-1 border border-brand-accent rounded-lg text-brand-green hover:border-brand-gold cursor-pointer"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(emp.id)}
                    className="text-xs px-3 py-1 border border-red-200 rounded-lg text-red-500 hover:border-red-400 cursor-pointer"
                  >
                    ลบ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-brand-green">
              {editing ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-brand-accent block mb-1">ชื่อ</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  placeholder="ชื่อพนักงาน"
                />
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">ตำแหน่ง</label>
                <div className="flex gap-2">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm((f) => ({ ...f, position: p }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 cursor-pointer transition-colors ${
                        form.position === p
                          ? 'border-brand-gold bg-brand-gold text-white'
                          : 'border-brand-accent text-brand-green'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">ค่าจ้าง (บาท/วัน)</label>
                <input
                  type="number"
                  value={form.dailyWage}
                  onChange={(e) => setForm((f) => ({ ...f, dailyWage: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">วันทำงานปกติ</label>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() =>
                        setForm((f) => {
                          const days = [...f.defaultDays]
                          days[i] = !days[i]
                          return { ...f, defaultDays: days }
                        })
                      }
                      className={`flex-1 h-8 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        form.defaultDays[i]
                          ? 'bg-brand-green text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-brand-green cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer hover:bg-brand-gold-dark transition-colors"
              >
                {saving ? '...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
