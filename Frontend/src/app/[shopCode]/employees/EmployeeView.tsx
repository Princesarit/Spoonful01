'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Employee, Position } from '@/lib/types'
import { saveEmployeeAction, deleteEmployeeAction } from './actions'
import { v4 as uuidv4 } from 'uuid'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

const ALL_POSITIONS: Position[] = ['Manager', 'Front', 'Back', 'Home']

const DAYS_SHORT_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const DAYS_SHORT_EN = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']

const POS_TAG: Record<Position, string> = {
  Manager: 'text-red-600 bg-red-50 border border-red-200',
  Front:   'text-blue-600 bg-blue-50',
  Back:    'text-amber-600 bg-amber-50',
  Home:    'text-green-600 bg-green-50',
}

const POS_BTN_ON: Record<Position, string> = {
  Manager: 'border-red-500 bg-red-500 text-white',
  Front:   'border-blue-500 bg-blue-500 text-white',
  Back:    'border-amber-500 bg-amber-500 text-white',
  Home:    'border-green-500 bg-green-500 text-white',
}

const POS_FILTER_ON: Record<Position, string> = {
  Manager: 'bg-red-500 text-white border-red-500',
  Front:   'bg-blue-500 text-white border-blue-500',
  Back:    'bg-amber-500 text-white border-amber-500',
  Home:    'bg-green-500 text-white border-green-500',
}

function sortKey(positions: Position[]): number {
  if (positions.includes('Manager')) return 0
  if (positions.length > 1)          return 1
  if (positions.includes('Front'))   return 2
  if (positions.includes('Back'))    return 3
  if (positions.includes('Home'))    return 4
  return 5
}

function sortEmployees(emps: Employee[]): Employee[] {
  return [...emps].sort((a, b) => {
    const diff = sortKey(a.positions) - sortKey(b.positions)
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'th')
  })
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  positions: ['Front'] as Position[],
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
  const { lang } = useShop()
  const tr = translations[lang]
  const DAYS = lang === 'en' ? DAYS_SHORT_EN : DAYS_SHORT_TH

  const [employees, setEmployees] = useState(() => sortEmployees(initialEmployees))
  const [filter, setFilter] = useState<Position | 'all'>('all')
  const [dayFilter, setDayFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const isOwner = role === 'manager' || role === 'owner'
  const filtered = employees.filter((e) => {
    if (filter !== 'all' && !e.positions.includes(filter)) return false
    if (dayFilter !== null && !e.defaultDays[dayFilter]) return false
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({ name: emp.name, phone: emp.phone ?? '', positions: [...emp.positions], defaultDays: [...emp.defaultDays] })
    setShowForm(true)
  }

  function togglePosition(pos: Position) {
    setForm((f) => ({
      ...f,
      positions: f.positions.includes(pos) ? f.positions.filter((p) => p !== pos) : [...f.positions, pos],
    }))
  }

  async function handleSave() {
    if (!form.name.trim() || form.positions.length === 0) return
    setSaving(true)
    const id = editing?.id || uuidv4()
    const emp: Employee = {
      id,
      name: form.name.trim(),
      positions: form.positions,
      phone: form.phone.trim() || undefined,
      defaultDays: form.defaultDays,
    }
    const result = await saveEmployeeAction(shopCode, emp)
    if ('ok' in result && result.ok) {
      setEmployees((prev) =>
        sortEmployees(editing ? prev.map((e) => (e.id === id ? emp : e)) : [...prev, emp]),
      )
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(tr.confirm_delete_emp)) return
    await deleteEmployeeAction(shopCode, id)
    setEmployees((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href={`/${shopCode}`} className="text-brand-accent text-sm hover:text-brand-green">
          {tr.back}
        </Link>
        <h2 className="font-bold text-brand-green">{tr.employees_title}</h2>
        {isOwner && (
          <button
            onClick={openAdd}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-xl cursor-pointer hover:bg-brand-gold-dark transition-colors"
          >
            {tr.add}
          </button>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tr.search_placeholder}
        className="w-full px-3 py-2 border border-brand-accent rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />

      {/* Position filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
            filter === 'all' ? 'bg-brand-green text-white border-brand-green' : 'bg-white text-gray-500 border-brand-accent hover:border-brand-gold'
          }`}
        >
          {tr.filter_all}
        </button>
        {ALL_POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setFilter(pos)}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
              filter === pos ? POS_FILTER_ON[pos] : 'bg-white text-gray-500 border-brand-accent hover:border-gray-400'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Day filter */}
      <div className="flex gap-1">
        {DAYS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDayFilter(dayFilter === i ? null : i)}
            className={`flex-1 h-8 rounded-full text-xs font-medium cursor-pointer transition-colors ${
              dayFilter === i ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center text-brand-accent py-12 text-sm">{tr.no_employees}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((emp) => (
            <div
              key={emp.id}
              className="bg-white border border-brand-accent rounded-2xl p-4 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-semibold text-brand-green text-sm">{emp.name}</span>
                  {emp.positions.map((pos) => (
                    <span key={pos} className={`text-xs px-2 py-0.5 rounded-full font-medium ${POS_TAG[pos]}`}>
                      {pos}
                    </span>
                  ))}
                </div>
                {emp.phone && (
                  <div className="text-xs text-gray-400 mb-1.5">{emp.phone}</div>
                )}
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <span
                      key={d}
                      className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        emp.defaultDays[i] ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
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
                    {tr.edit}
                  </button>
                  <button
                    onClick={() => handleDelete(emp.id)}
                    className="text-xs px-3 py-1 border border-red-200 rounded-lg text-red-500 hover:border-red-400 cursor-pointer"
                  >
                    {tr.delete}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-brand-green">{editing ? tr.edit_employee : tr.add_employee}</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-brand-accent block mb-1">{tr.name_label}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  placeholder={tr.name_placeholder}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">{tr.phone_label}</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-brand-accent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  placeholder={tr.phone_placeholder}
                />
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">{tr.position_label}</label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_POSITIONS.map((pos) => {
                    const on = form.positions.includes(pos)
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => togglePosition(pos)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-colors ${
                          on ? POS_BTN_ON[pos] : 'border-brand-accent text-gray-500 bg-white hover:border-gray-400'
                        }`}
                      >
                        {pos}
                      </button>
                    )
                  })}
                </div>
                {form.positions.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">{tr.select_position_warn}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-brand-accent block mb-1">{tr.default_days_label}</label>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setForm((f) => {
                          const days = [...f.defaultDays]
                          days[i] = !days[i]
                          return { ...f, defaultDays: days }
                        })
                      }
                      className={`flex-1 h-8 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        form.defaultDays[i] ? 'bg-brand-green text-white' : 'bg-gray-100 text-gray-400'
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
                {tr.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.positions.length === 0}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer hover:bg-brand-gold-dark transition-colors"
              >
                {saving ? tr.saving : tr.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
