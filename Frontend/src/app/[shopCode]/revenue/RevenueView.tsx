'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { MealRevenue, RevenueEntry } from '@/lib/types'
import { getRevenueData, saveRevenueEntry, saveAuditLog } from './actions'
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
  return { eftpos: 0, lfyOnline: 0, lfyCards: 0, lfyCash: 0, uberOnline: 0, doorDash: 0, cashLeftInBag: 0, cashSale: 0, totalSale: 0 }
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

// For legacy entries that have totalSale but no cashSale, derive cashSale
function ensureCashSale(m: MealRevenue): MealRevenue {
  if ((m.cashSale === undefined || m.cashSale === 0) && m.totalSale > 0) {
    const derived = m.totalSale - m.eftpos - m.lfyOnline - m.uberOnline - m.doorDash
    return { ...m, cashSale: Math.max(0, derived) }
  }
  return m
}

function mealHasData(m: MealRevenue): boolean {
  return m.totalSale > 0 || m.eftpos > 0 || m.lfyOnline > 0 || m.lfyCards > 0 || m.lfyCash > 0 || m.uberOnline > 0 || m.doorDash > 0 || m.cashLeftInBag > 0 || (m.cashSale ?? 0) > 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Numeric input ──────────────────────────────────────────────────────────────
function NumInput({
  value, onChange, yellow = false, error = false,
}: {
  value: number; onChange: (v: number) => void; yellow?: boolean; error?: boolean
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
      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
        error ? 'border-red-400 bg-red-50 focus:ring-red-400' :
        yellow ? 'bg-yellow-50 border-yellow-300 focus:ring-brand-gold' :
        'border-gray-300 focus:ring-brand-gold'
      }`}
    />
  )
}

// ── Meal detail rows (card display) ───────────────────────────────────────────
function MealDetailRows({ meal }: { meal: MealRevenue }) {
  const displayTotal = meal.totalSale
  const displayCashSale = meal.cashSale ?? calcCashSale(meal)
  const rows: Array<{ label: string; value: number; dim?: boolean }> = [
    { label: 'Eftpos', value: meal.eftpos, dim: true },
    { label: 'LFY Online', value: meal.lfyOnline, dim: true },
    { label: 'LFY Cards', value: meal.lfyCards, dim: true },
    { label: 'LFY Cash', value: meal.lfyCash, dim: true },
    { label: 'Uber Online', value: meal.uberOnline, dim: true },
    { label: 'DoorDash', value: meal.doorDash, dim: true },
    { label: 'Cash Sale', value: displayCashSale, dim: true },
    { label: 'Cash in Bag', value: meal.cashLeftInBag, dim: true },
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
        <span className="text-base font-bold text-gray-900">${fmt(displayTotal)}</span>
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
    const updated = { ...meal, [key]: val }
    updated.cashSale = updated.totalSale - updated.eftpos - updated.lfyOnline - updated.uberOnline - updated.doorDash
    onChange(updated)
  }

  const fields: Array<{ key: keyof MealRevenue; label: string; yellow?: boolean }> = [
    { key: 'eftpos', label: 'Eftpos' },
    { key: 'lfyOnline', label: 'LFY Paid Online' },
    { key: 'lfyCards', label: 'LFY Cards' },
    { key: 'lfyCash', label: 'LFY Cash' },
    { key: 'uberOnline', label: 'Uber Eat Online' },
    { key: 'doorDash', label: 'DoorDash' },
    { key: 'totalSale', label: 'Total Sale' },
    { key: 'cashLeftInBag', label: 'Cash Left in Bag', yellow: true },
  ]

  const cashSale = meal.totalSale - meal.eftpos - meal.lfyOnline - meal.uberOnline - meal.doorDash
  const cashSaleError = cashSale < 0
  const lfyCardsError = (meal.lfyCards + meal.lfyCash) > meal.eftpos

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-2.5 font-semibold text-sm ${color}`}>{label}</div>
      <div className="p-4 space-y-2.5">
        {fields.map(({ key, label: lbl, yellow }) => {
          const isError = (key === 'lfyCards' || key === 'lfyCash') && lfyCardsError
          return (
            <div key={key}>
              <div className="flex items-center gap-3">
                <label className={`text-xs w-36 shrink-0 ${isError ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{lbl}</label>
                <NumInput value={(meal[key] as number) ?? 0} onChange={(v) => set(key, v)} yellow={yellow} error={isError} />
              </div>
              {isError && (
                <p className="text-[10px] text-red-500 mt-0.5 ml-39">LFY Cards + LFY Cash ต้องไม่เกิน Eftpos</p>
              )}
            </div>
          )
        })}
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${cashSaleError ? 'bg-red-50' : 'bg-gray-50'}`}>
          <span className={`text-xs font-medium ${cashSaleError ? 'text-red-600' : 'text-gray-600'}`}>Cash Sale (auto)</span>
          <span className={`text-sm font-bold ${cashSaleError ? 'text-red-600' : 'text-gray-700'}`}>${fmt(cashSale)}</span>
        </div>
        {cashSaleError && (
          <p className="text-[10px] text-red-500 -mt-1">Total Sale ต้องไม่น้อยกว่า Eftpos + Online orders</p>
        )}
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
  const [deleteMealAudit, setDeleteMealAudit] = useState<{ id: string; date: string; mode: FormMode } | null>(null)
  const [deleteMealEditor, setDeleteMealEditor] = useState('')
  const [deleteMealNote, setDeleteMealNote] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [extraFront, setExtraFront] = useState(0)
  const [extraKitchen, setExtraKitchen] = useState(0)
  const [extraSaving, setExtraSaving] = useState(false)
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
      ? { ...dayEntry, lunch: ensureCashSale(dayEntry.lunch), dinner: ensureCashSale(dayEntry.dinner) }
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
    const currentMeal = formState.mode === 'lunch' ? formState.entry.lunch : formState.entry.dinner
    const recorderName = formState.mode === 'lunch' ? formState.entry.lunchRecorderName : formState.entry.dinnerRecorderName
    if (!recorderName?.trim()) return
    if (formState.isEditing && !auditEditorName.trim()) return
    if ((currentMeal.lfyCards + currentMeal.lfyCash) > currentMeal.eftpos) return
    const cashSaleVal = currentMeal.totalSale - currentMeal.eftpos - currentMeal.lfyOnline - currentMeal.uberOnline - currentMeal.doorDash
    if (cashSaleVal < 0) return
    if (currentMeal.cashLeftInBag !== cashSaleVal && !formState.entry.note?.trim()) return
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

  async function doDeleteMeal() {
    if (!deleteMealAudit || !deleteMealEditor.trim()) return
    const entry = entries.find((e) => e.id === deleteMealAudit.id)
    if (!entry) return
    const updated: RevenueEntry = {
      ...entry,
      [deleteMealAudit.mode]: emptyMeal(),
      [`${deleteMealAudit.mode}RecorderName`]: undefined,
    }
    await saveRevenueEntry(shopCode, updated)
    saveAuditLog(shopCode, {
      editorName: deleteMealEditor,
      note: deleteMealNote,
      employeeName: deleteMealAudit.date,
      shift: deleteMealAudit.mode,
      changes: `Delete ${deleteMealAudit.mode} revenue: ${deleteMealAudit.date}`,
    }).catch(() => {})
    const { entries: fresh } = await getRevenueData(shopCode)
    setEntries(fresh)
    setDeleteMealAudit(null)
  }

  function openExtraModal(entry: RevenueEntry) {
    setExtraFront(entry.frontExtra ?? 0)
    setExtraKitchen(entry.kitchenExtra ?? 0)
    setShowExtra(true)
  }

  async function handleSaveExtra() {
    if (!dayEntry) return
    setExtraSaving(true)
    try {
      const updated: RevenueEntry = { ...dayEntry, frontExtra: extraFront || undefined, kitchenExtra: extraKitchen || undefined }
      await saveRevenueEntry(shopCode, updated)
      const { entries: fresh } = await getRevenueData(shopCode)
      setEntries(fresh)
      setShowExtra(false)
    } catch {
      alert(tr.save_fail)
    } finally {
      setExtraSaving(false)
    }
  }

  function openEdit(entry: RevenueEntry, mode: FormMode) {
    setAuditEditorName('')
    setAuditNote('')
    setFormState({
      entry: { ...entry, lunch: ensureCashSale(entry.lunch), dinner: ensureCashSale(entry.dinner) },
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
          <div className="text-xs text-gray-400">{dayEntry.date}</div>

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
                    <>
                      <button onClick={() => openEdit(dayEntry, 'lunch')} className="text-[10px] text-blue-500 cursor-pointer">{tr.edit}</button>
                      <button onClick={() => { setDeleteMealEditor(''); setDeleteMealNote(''); setDeleteMealAudit({ id: dayEntry.id, date: dayEntry.date, mode: 'lunch' }) }} className="text-[10px] text-red-400 cursor-pointer">{tr.delete}</button>
                    </>
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
                    <>
                      <button onClick={() => openEdit(dayEntry, 'dinner')} className="text-[10px] text-blue-500 cursor-pointer">{tr.edit}</button>
                      <button onClick={() => { setDeleteMealEditor(''); setDeleteMealNote(''); setDeleteMealAudit({ id: dayEntry.id, date: dayEntry.date, mode: 'dinner' }) }} className="text-[10px] text-red-400 cursor-pointer">{tr.delete}</button>
                    </>
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
          {(dayEntry.frontExtra || dayEntry.kitchenExtra) ? (
            <div className="flex justify-between items-center text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
              <span>Extra: Front ${fmt(dayEntry.frontExtra ?? 0)} / Kitchen ${fmt(dayEntry.kitchenExtra ?? 0)}</span>
              <button onClick={() => openExtraModal(dayEntry)} className="text-blue-500 cursor-pointer">Edit</button>
            </div>
          ) : (lunchDone || dinnerDone) ? (
            <button
              onClick={() => openExtraModal(dayEntry)}
              className="w-full py-2 rounded-xl text-sm font-semibold border-2 border-dashed border-purple-300 text-purple-500 hover:bg-purple-50 transition-colors cursor-pointer"
            >
              + Extra (ค่าแรงพิเศษ)
            </button>
          ) : null}
          {dayEntry.note && <div className="text-xs text-gray-400 italic">{dayEntry.note}</div>}
        </div>
      )}

      {/* Extra Modal */}
      {showExtra && dayEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-purple-700">Extra — ค่าแรงพิเศษ</h3>
            <p className="text-xs text-gray-400">{dayEntry.date}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Front Extra ($)</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number" min="0" step="0.5"
                    value={extraFront || ''}
                    onChange={(e) => setExtraFront(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Kitchen Extra ($)</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number" min="0" step="0.5"
                    value={extraKitchen || ''}
                    onChange={(e) => setExtraKitchen(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowExtra(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer">{tr.cancel}</button>
              <button
                onClick={handleSaveExtra}
                disabled={extraSaving}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {extraSaving ? tr.saving : tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-meal Delete Modal */}
      {deleteMealAudit && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-red-600">ยืนยันการลบ {deleteMealAudit.mode === 'lunch' ? '🌞 Lunch' : '🌙 Dinner'}</h3>
            <div className="text-xs text-gray-500 bg-red-50 rounded-lg px-3 py-2">
              ลบข้อมูล {deleteMealAudit.mode}: <span className="font-semibold text-gray-700">{deleteMealAudit.date}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ชื่อผู้แก้ไข *</label>
                <input
                  type="text"
                  autoFocus
                  value={deleteMealEditor}
                  onChange={(e) => setDeleteMealEditor(e.target.value)}
                  placeholder="กรอกชื่อ"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={deleteMealNote}
                  onChange={(e) => setDeleteMealNote(e.target.value)}
                  placeholder="เหตุผล (ถ้ามี)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteMealAudit(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer">{tr.cancel}</button>
              <button onClick={doDeleteMeal} disabled={!deleteMealEditor.trim()} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer">{tr.delete}</button>
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

            {/* Recorder name — required */}
            {(() => {
              const recorderVal = (mode === 'lunch' ? form.lunchRecorderName : form.dinnerRecorderName) ?? ''
              const nameEmpty = !recorderVal.trim()
              return (
                <div>
                  <label className="text-xs block mb-1">
                    <span className={nameEmpty ? 'text-red-500 font-medium' : 'text-gray-500'}>
                      Name (ชื่อผู้กรอก) *
                    </span>
                  </label>
                  <input
                    type="text"
                    value={recorderVal}
                    onChange={(e) => setEntryField(
                      mode === 'lunch' ? 'lunchRecorderName' : 'dinnerRecorderName',
                      e.target.value || undefined,
                    )}
                    placeholder="ชื่อพนักงาน *"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold ${nameEmpty ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                </div>
              )
            })()}

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

            {/* Note — required if cashLeftInBag ≠ cashSale */}
            {(() => {
              const currentMeal = mode === 'lunch' ? form.lunch : form.dinner
              const cashSaleVal = currentMeal.totalSale - currentMeal.eftpos - currentMeal.lfyOnline - currentMeal.uberOnline - currentMeal.doorDash
              const cashSaleInvalid = cashSaleVal < 0
              const discrepancy = currentMeal.cashLeftInBag !== cashSaleVal
              const noteRequired = discrepancy && !form.note?.trim()
              const recorderName = (mode === 'lunch' ? form.lunchRecorderName : form.dinnerRecorderName) ?? ''
              const lfyCardsInvalid = (currentMeal.lfyCards + currentMeal.lfyCash) > currentMeal.eftpos
              const canSave = !saving && !!recorderName.trim() && !noteRequired && !lfyCardsInvalid && !cashSaleInvalid && (!isEditing || !!auditEditorName.trim())
              return (
                <>
                  <div>
                    <label className="text-xs block mb-1">
                      <span className={noteRequired ? 'text-red-500 font-medium' : 'text-gray-500'}>
                        Note{noteRequired ? ' * (Cash in Bag ≠ Cash Sale — required)' : ' (optional)'}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.note ?? ''}
                      onChange={(e) => setEntryField('note', e.target.value || undefined)}
                      placeholder={noteRequired ? 'ต้องกรอก — ยอดไม่ตรงกัน' : '—'}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold ${noteRequired ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
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
                      disabled={!canSave}
                      className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? tr.saving : tr.save}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
