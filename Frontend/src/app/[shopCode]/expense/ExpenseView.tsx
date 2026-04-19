'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ExpenseEntry, PaymentMethod } from '@/lib/types'
import { getExpenses, saveExpenseEntry, deleteExpenseEntry, togglePaid } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function dayName(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })
}

function fmtAUD(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function emptyForm(): Omit<ExpenseEntry, 'id'> {
  return {
    date: today(),
    category: 'General',
    supplier: '',     // Description / Name
    description: '',  // Notes
    total: 0,
    paymentMethod: 'Cash',
    bankAccount: '',
    dueDate: '',
    paid: false,
  }
}

const METHOD_COLORS: Record<PaymentMethod, string> = {
  Cash: 'bg-green-100 text-green-700',
  'Credit Card': 'bg-blue-100 text-blue-700',
  'Online Banking': 'bg-purple-100 text-purple-700',
}

const METHOD_ICON: Record<PaymentMethod, string> = {
  Cash: '💵',
  'Credit Card': '💳',
  'Online Banking': '🏦',
}

export default function ExpenseView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { lang } = useShop()
  const tr = translations[lang]

  const [entries, setEntries] = useState<ExpenseEntry[]>([])
  const [form, setForm] = useState<(Omit<ExpenseEntry, 'id'> & { id?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterDate, setFilterDate] = useState('')

  useEffect(() => {
    setLoading(true)
    getExpenses(shopCode)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shopCode])

  function openNew() { setForm(emptyForm()) }
  function openEdit(entry: ExpenseEntry) { setForm({ ...entry }) }

  function setField<K extends keyof ExpenseEntry>(key: K, val: ExpenseEntry[K]) {
    setForm((p) => p && ({ ...p, [key]: val }))
  }

  async function handleSave() {
    if (!form || !form.supplier.trim()) return
    setSaving(true)
    const entry: ExpenseEntry = { ...form, id: form.id ?? Date.now().toString() }
    try {
      await saveExpenseEntry(shopCode, entry)
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id)
        return idx >= 0 ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev]
      })
      setForm(null)
    } catch {
      alert(tr.save_fail)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(tr.confirm_delete)) return
    await deleteExpenseEntry(shopCode, id)
    setEntries((p) => p.filter((e) => e.id !== id))
  }

  async function handleTogglePaid(id: string) {
    const newPaid = await togglePaid(shopCode, id)
    setEntries((p) => p.map((e) => (e.id === id ? { ...e, paid: newPaid } : e)))
  }

  const sortedFiltered = [...(filterDate ? entries.filter((e) => e.date === filterDate) : entries)]
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">{tr.back}</Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.expense_title}</h2>
        <button
          onClick={openNew}
          className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
        >
          {tr.add}
        </button>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <label className="text-xs text-gray-500 shrink-0">{tr.filter_date}</label>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
        />
        {filterDate && (
          <button onClick={() => setFilterDate('')} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
            {tr.clear}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data}</div>
      ) : (
        <div className="space-y-3">
          {sortedFiltered.map((entry) => (
            <div
              key={entry.id}
              className={`bg-white rounded-xl border shadow-sm p-4 ${entry.paid ? 'border-gray-100' : 'border-amber-200'}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  {/* Day + Date */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase">{dayName(entry.date)}</span>
                    <span className="text-xs text-gray-400">{entry.date}</span>
                  </div>
                  {/* Name */}
                  <div className="text-sm font-semibold text-gray-800">{entry.supplier || '—'}</div>
                  {/* Payment method badge */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[entry.paymentMethod]}`}>
                      {METHOD_ICON[entry.paymentMethod]} {entry.paymentMethod}
                    </span>
                  </div>
                  {/* Notes */}
                  {entry.description && (
                    <div className="text-xs text-gray-400 mt-1">{entry.description}</div>
                  )}
                  {/* Online banking extras */}
                  {entry.paymentMethod === 'Online Banking' && (entry.bankAccount || entry.dueDate) && (
                    <div className="text-xs text-purple-600 mt-1">
                      {entry.bankAccount && `🏦 ${entry.bankAccount}`}
                      {entry.dueDate && ` · Due: ${entry.dueDate}`}
                    </div>
                  )}
                </div>
                {/* Amount */}
                <div className="text-right ml-3 shrink-0">
                  <div className="text-base font-bold text-gray-800">${fmtAUD(entry.total)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                <button
                  onClick={() => handleTogglePaid(entry.id)}
                  className={`text-xs px-3 py-1 rounded-full font-medium cursor-pointer transition-colors ${
                    entry.paid ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {entry.paid ? tr.paid_status : tr.unpaid_status}
                </button>
                <button onClick={() => openEdit(entry)} className="text-xs text-blue-500 cursor-pointer">{tr.edit}</button>
                <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-400 cursor-pointer">{tr.delete}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 my-4">
            <h3 className="font-bold text-gray-900">{form.id ? tr.edit_expense : tr.add_expense}</h3>

            {/* Date + Day */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">{tr.date_label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
                <div className="text-sm font-semibold text-gray-500 bg-gray-100 rounded-lg px-3 py-2 min-w-12 text-center">
                  {dayName(form.date)}
                </div>
              </div>
            </div>

            {/* Filled by (required) */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Filled by <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.filledBy ?? ''}
                onChange={(e) => setField('filledBy', e.target.value)}
                placeholder="Your name..."
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                  !form.filledBy?.trim() ? 'border-red-300' : 'border-gray-300'
                }`}
              />
            </div>

            {/* Description / Name */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Description / Name</label>
              <input
                type="text"
                autoFocus
                value={form.supplier}
                onChange={(e) => setField('supplier', e.target.value)}
                placeholder="e.g. Woolworths, BBQ ducks, Home..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount (AUD $)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.total || ''}
                  onChange={(e) => setField('total', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Payment Method</label>
              <div className="flex gap-2">
                {(['Cash', 'Credit Card', 'Online Banking'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setField('paymentMethod', m)}
                    className={`flex-1 py-2.5 rounded-lg border cursor-pointer transition-colors flex flex-col items-center gap-1 ${
                      form.paymentMethod === m
                        ? 'bg-brand-gold text-white border-brand-gold'
                        : 'border-gray-200 text-gray-600 hover:border-brand-gold/50'
                    }`}
                  >
                    <span className="text-lg leading-none">{METHOD_ICON[m]}</span>
                    <span className="text-[10px] font-medium leading-none">
                      {m === 'Credit Card' ? 'Credit' : m === 'Online Banking' ? 'Online' : m}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Online Banking: bank account */}
            {form.paymentMethod === 'Online Banking' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Bank Account</label>
                <input
                  type="text"
                  value={form.bankAccount ?? ''}
                  onChange={(e) => setField('bankAccount', e.target.value)}
                  placeholder={tr.bank_placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            )}

            {/* Paid toggle */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">{tr.status_label}</label>
              <button
                type="button"
                onClick={() => setField('paid', !form.paid)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  form.paid ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
                }`}
              >
                {form.paid ? tr.paid_status : tr.unpaid_status}
              </button>
            </div>

            {/* Due Date — shown when Unpaid */}
            {!form.paid && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate ?? ''}
                  onChange={(e) => setField('dueDate', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Additional notes..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setForm(null)}
                className="flex-1 py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.supplier.trim() || form.total <= 0 || !form.filledBy?.trim()}
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
