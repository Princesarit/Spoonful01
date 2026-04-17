'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { MealRevenue, RevenueEntry } from '@/lib/types'
import { getRevenueData, saveRevenueEntry, deleteRevenueEntry, saveAuditLog } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

type FormMode = 'lunch' | 'dinner'

interface FormState {
  entry: RevenueEntry
  mode: FormMode
  isEditing: boolean  // true = editing existing meal, false = creating new
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function emptyMeal(): MealRevenue {
  return { eftpos: 0, lfyOnline: 0, lfyCards: 0, lfyCash: 0, uberOnline: 0, doorDash: 0, cashLeftInBag: 0, totalSale: 0 }
}

function emptyEntry(date: string): RevenueEntry {
  return {
    id: Date.now().toString(),
    date,
    lfyBills: 0,
    uberBills: 0,
    doorDashBills: 0,
    lunch: emptyMeal(),
    dinner: emptyMeal(),
  }
}

function calcCashSale(m: MealRevenue): number {
  return m.totalSale - m.eftpos - m.lfyOnline - m.uberOnline - m.doorDash
}

function mealHasData(m: MealRevenue): boolean {
  return m.totalSale > 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Numeric input ──────────────────────────────────────────────────────────────
function NumInput({
  value, onChange, yellow = false,
}: {
  value: number; onChange: (v: number) => void; yellow?: boolean
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
      placeholder="0"
      className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold ${yellow ? 'bg-yellow-50 border-yellow-300' : ''}`}
    />
  )
}

// ── Meal detail rows (card display) ───────────────────────────────────────────
function MealDetailRows({ meal }: { meal: MealRevenue }) {
  const cashSale = calcCashSale(meal)
  const rows: Array<{ label: string; value: number; dim?: boolean }> = [
    { label: 'Eftpos', value: meal.eftpos, dim: true },
    { label: 'LFY Online', value: meal.lfyOnline, dim: true },
    { label: 'LFY Cards', value: meal.lfyCards, dim: true },
    { label: 'LFY Cash', value: meal.lfyCash, dim: true },
    { label: 'Uber Online', value: meal.uberOnline, dim: true },
    { label: 'DoorDash', value: meal.doorDash, dim: true },
    { label: 'Cash in Bag', value: meal.cashLeftInBag, dim: true },
    { label: 'Cash Sale', value: cashSale, dim: true },
  ]
  return (
    <div className="space-y-0.5">
      {rows.map(({ label, value }) =>
        value !== 0 ? (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-gray-500">{label}</span>
            <span className={`font-medium ${value < 0 ? 'text-red-500' : 'text-gray-700'}`}>
              ${fmt(value)}
            </span>
          </div>
        ) : null,
      )}
      {/* Total Sale — prominent */}
      <div className="flex justify-between items-center pt-1.5 mt-1.5 border-t border-black/10">
        <span className="text-xs font-semibold text-gray-700">Total Sale</span>
        <span className="text-base font-bold text-gray-900">${fmt(meal.totalSale)}</span>
      </div>
    </div>
  )
}

// ── Meal form section ──────────────────────────────────────────────────────────
function MealSection({
  label, color, meal, onChange,
}: {
  label: string; color: string; meal: MealRevenue; onChange: (m: MealRevenue) => void
}) {
  function set(key: keyof MealRevenue, val: number) {
    onChange({ ...meal, [key]: val })
  }
  const cashSale = calcCashSale(meal)

  const fields: Array<{ key: keyof MealRevenue; label: string; yellow?: boolean }> = [
    { key: 'eftpos', label: 'Eftpos' },
    { key: 'lfyOnline', label: 'LFY Paid Online' },
    { key: 'lfyCards', label: 'LFY Cards' },
    { key: 'lfyCash', label: 'LFY Cash' },
    { key: 'uberOnline', label: 'Uber Eat Online' },
    { key: 'doorDash', label: 'DoorDash' },
    { key: 'cashLeftInBag', label: 'Cash Left in Bag', yellow: true },
    { key: 'totalSale', label: 'Total Sale' },
  ]

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-2.5 font-semibold text-sm ${color}`}>{label}</div>
      <div className="p-4 space-y-2.5">
        {fields.map(({ key, label: lbl, yellow }) => (
          <div key={key} className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-36 shrink-0">{lbl}</label>
            <NumInput value={meal[key]} onChange={(v) => set(key, v)} yellow={yellow} />
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          <label className="text-xs text-gray-600 font-medium w-36 shrink-0">Cash Sale</label>
          <div className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-right ${cashSale < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-700'}`}>
            ${fmt(cashSale)}
          </div>
        </div>
        <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
          <span className="text-xs text-green-700 font-medium">Total Sale</span>
          <span className="text-sm font-bold text-green-700">${fmt(meal.totalSale)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RevenueView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { lang } = useShop()
  const tr = translations[lang]

  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [formState, setFormState] = useState<FormState | null>(null)
  const [auditEditorName, setAuditEditorName] = useState('')
  const [auditNote, setAuditNote] = useState('')
  const [deleteAudit, setDeleteAudit] = useState<{ id: string; date: string } | null>(null)
  const [deleteAuditEditor, setDeleteAuditEditor] = useState('')
  const [deleteAuditNote, setDeleteAuditNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterDate, setFilterDate] = useState(today)

  useEffect(() => {
    setLoading(true)
    getRevenueData(shopCode)
      .then(({ entries: e }) => setEntries(e))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shopCode])

  // At most 1 entry per day
  const dayEntry = entries.find((e) => e.date === filterDate)
  const lunchDone = dayEntry ? mealHasData(dayEntry.lunch) : false
  const dinnerDone = dayEntry ? mealHasData(dayEntry.dinner) : false

  function openForm(mode: FormMode) {
    const base = dayEntry
      ? { ...dayEntry, lunch: { ...dayEntry.lunch }, dinner: { ...dayEntry.dinner } }
      : emptyEntry(filterDate)
    setAuditEditorName('')
    setAuditNote('')
    setFormState({ entry: base, mode, isEditing: false })
  }

  function setMeal(m: MealRevenue) {
    setFormState((prev) => {
      if (!prev) return prev
      return { ...prev, entry: { ...prev.entry, [prev.mode]: m } }
    })
  }

  function setEntryField<K extends keyof RevenueEntry>(key: K, val: RevenueEntry[K]) {
    setFormState((prev) => prev ? { ...prev, entry: { ...prev.entry, [key]: val } } : null)
  }

  async function handleSave() {
    if (!formState) return
    if (formState.isEditing && !auditEditorName.trim()) return
    setSaving(true)
    try {
      const toSave = formState.entry
      await saveRevenueEntry(shopCode, toSave)
      // Audit log
      const recorderName = formState.mode === 'lunch' ? toSave.lunchRecorderName : toSave.dinnerRecorderName
      const editorForLog = formState.isEditing ? auditEditorName : (recorderName || 'Staff')
      saveAuditLog(shopCode, {
        editorName: editorForLog,
        note: formState.isEditing ? auditNote : '',
        employeeName: toSave.date,
        shift: formState.mode,
        changes: formState.isEditing
          ? `Edit ${formState.mode} revenue: ${toSave.date}`
          : `Add ${formState.mode} revenue: ${toSave.date}`,
      }).catch(() => {})
      // Re-fetch from server to ensure local state matches persisted data
      const { entries: fresh } = await getRevenueData(shopCode)
      setEntries(fresh)
      setFormState(null)
    } catch {
      alert(tr.save_fail)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(id: string, date: string) {
    setDeleteAuditEditor('')
    setDeleteAuditNote('')
    setDeleteAudit({ id, date })
  }

  async function doDelete() {
    if (!deleteAudit || !deleteAuditEditor.trim()) return
    await deleteRevenueEntry(shopCode, deleteAudit.id)
    saveAuditLog(shopCode, {
      editorName: deleteAuditEditor,
      note: deleteAuditNote,
      employeeName: deleteAudit.date,
      shift: 'revenue',
      changes: `Delete revenue entry: ${deleteAudit.date}`,
    }).catch(() => {})
    setEntries((p) => p.filter((e) => e.id !== deleteAudit.id))
    setDeleteAudit(null)
  }

  function openEdit(entry: RevenueEntry, mode: FormMode) {
    setAuditEditorName('')
    setAuditNote('')
    setFormState({
      entry: { ...entry, lunch: { ...entry.lunch }, dinner: { ...entry.dinner } },
      mode,
      isEditing: true,
    })
  }

  const form = formState?.entry
  const mode = formState?.mode
  const isEditing = formState?.isEditing ?? false

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">{tr.back}</Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.revenue_title}</h2>
      </div>

      {/* Date filter + Lunch/Dinner buttons */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500 shrink-0">{tr.view_date}</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => openForm('lunch')}
            disabled={lunchDone}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              lunchDone
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-yellow-400 text-white hover:bg-yellow-500 active:scale-95'
            }`}
          >
            {lunchDone ? '🌞 Lunch ✓' : '🌞 Lunch'}
          </button>
          <button
            onClick={() => openForm('dinner')}
            disabled={dinnerDone}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              dinnerDone
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
            }`}
          >
            {dinnerDone ? '🌙 Dinner ✓' : '🌙 Dinner'}
          </button>
        </div>
      </div>

      {/* Entry card for the selected date */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : !dayEntry ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="text-xs text-gray-400">{dayEntry.date}</div>
            <button
              onClick={() => handleDelete(dayEntry.id, dayEntry.date)}
              className="text-xs text-red-400 cursor-pointer"
            >
              {tr.delete}
            </button>
          </div>

          {/* Bill counts */}
          {(dayEntry.lfyBills > 0 || dayEntry.uberBills > 0 || dayEntry.doorDashBills > 0) && (
            <div className="flex gap-2 text-xs flex-wrap">
              {dayEntry.lfyBills > 0 && <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">LFY ×{dayEntry.lfyBills}</span>}
              {dayEntry.uberBills > 0 && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Uber ×{dayEntry.uberBills}</span>}
              {dayEntry.doorDashBills > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">DoorDash ×{dayEntry.doorDashBills}</span>}
            </div>
          )}

          {/* Lunch & Dinner detail */}
          <div className="space-y-2">
            {/* LUNCH */}
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-yellow-700 text-sm">LUNCH</span>
                <div className="flex items-center gap-2">
                  {dayEntry.lunchRecorderName && (
                    <span className="text-[10px] text-yellow-600">👤 {dayEntry.lunchRecorderName}</span>
                  )}
                  {lunchDone && (
                    <button onClick={() => openEdit(dayEntry, 'lunch')} className="text-[10px] text-blue-500 cursor-pointer">
                      {tr.edit}
                    </button>
                  )}
                </div>
              </div>
              <MealDetailRows meal={dayEntry.lunch} />
            </div>

            {/* DINNER */}
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-blue-700 text-sm">DINNER</span>
                <div className="flex items-center gap-2">
                  {dayEntry.dinnerRecorderName && (
                    <span className="text-[10px] text-blue-600">👤 {dayEntry.dinnerRecorderName}</span>
                  )}
                  {dinnerDone && (
                    <button onClick={() => openEdit(dayEntry, 'dinner')} className="text-[10px] text-blue-500 cursor-pointer">
                      {tr.edit}
                    </button>
                  )}
                </div>
              </div>
              <MealDetailRows meal={dayEntry.dinner} />
            </div>
          </div>

          <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-2">
            <span className="text-gray-500 text-xs">Grand Total</span>
            <span className="font-bold text-brand-gold">${fmt(dayEntry.lunch.totalSale + dayEntry.dinner.totalSale)}</span>
          </div>
          {dayEntry.note && <div className="text-xs text-gray-400 italic">{dayEntry.note}</div>}
        </div>
      )}

      {/* Delete Audit Modal */}
      {deleteAudit && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-red-600">ยืนยันการลบ</h3>
            <div className="text-xs text-gray-500 bg-red-50 rounded-lg px-3 py-2">
              ลบข้อมูลรายรับ: <span className="font-semibold text-gray-700">{deleteAudit.date}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ชื่อผู้แก้ไข *</label>
                <input
                  type="text"
                  autoFocus
                  value={deleteAuditEditor}
                  onChange={(e) => setDeleteAuditEditor(e.target.value)}
                  placeholder="กรอกชื่อ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={deleteAuditNote}
                  onChange={(e) => setDeleteAuditNote(e.target.value)}
                  placeholder="เหตุผล (ถ้ามี)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleteAudit(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={doDelete}
                disabled={!deleteAuditEditor.trim()}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {tr.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {formState && form && mode && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 my-4">
            <h3 className="font-bold text-gray-900">
              {mode === 'lunch' ? '🌞 Lunch' : '🌙 Dinner'} — {form.date}
            </h3>

            {/* Recorder name — per meal */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name (ชื่อผู้กรอก)</label>
              <input
                type="text"
                value={(mode === 'lunch' ? form.lunchRecorderName : form.dinnerRecorderName) ?? ''}
                onChange={(e) => setEntryField(
                  mode === 'lunch' ? 'lunchRecorderName' : 'dinnerRecorderName',
                  e.target.value || undefined,
                )}
                placeholder="ชื่อพนักงาน"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
            </div>

            {/* Audit fields — shown only when editing existing data */}
            {isEditing && (
              <div className="border border-orange-200 rounded-xl bg-orange-50 p-3 space-y-2">
                <div className="text-xs font-semibold text-orange-700">บันทึกการแก้ไข</div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">ชื่อผู้แก้ไข *</label>
                  <input
                    type="text"
                    value={auditEditorName}
                    onChange={(e) => setAuditEditorName(e.target.value)}
                    placeholder="กรอกชื่อ"
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                  <input
                    type="text"
                    value={auditNote}
                    onChange={(e) => setAuditNote(e.target.value)}
                    placeholder="เหตุผลที่แก้ไข (ถ้ามี)"
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
            )}

            {/* Date (editable only when creating new) */}
            {!dayEntry && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">{tr.date_label}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setEntryField('date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            )}

            {/* Bill counts — shown only in Lunch form */}
            {mode === 'lunch' && (
              <div>
                <div className="text-xs text-gray-500 font-medium mb-2">Bill Counts</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'lfyBills', label: 'LFY' },
                    { key: 'uberBills', label: 'Uber' },
                    { key: 'doorDashBills', label: 'DoorDash' },
                  ] as const).map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[10px] text-gray-400 block mb-1">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={form[key] || ''}
                        onChange={(e) => setEntryField(key, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-gold"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meal section */}
            {mode === 'lunch' ? (
              <MealSection
                label="🌞 LUNCH"
                color="bg-yellow-50 text-yellow-800"
                meal={form.lunch}
                onChange={setMeal}
              />
            ) : (
              <MealSection
                label="🌙 DINNER"
                color="bg-blue-50 text-blue-800"
                meal={form.dinner}
                onChange={setMeal}
              />
            )}

            {/* Note */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Note (optional)</label>
              <input
                type="text"
                value={form.note ?? ''}
                onChange={(e) => setEntryField('note', e.target.value || undefined)}
                placeholder="—"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFormState(null)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (isEditing && !auditEditorName.trim())}
                className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
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
