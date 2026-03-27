'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ExpenseEntry, PaymentMethod } from '@/lib/types'
import { EXPENSE_CATEGORIES } from '@/lib/config'
import { getExpenses, saveExpenseEntry, deleteExpenseEntry, togglePaid } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function emptyForm(): Omit<ExpenseEntry, 'id'> {
  return {
    date: today(),
    category: EXPENSE_CATEGORIES[0],
    supplier: '',
    description: '',
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

  function openNew() {
    setForm(emptyForm())
  }

  function openEdit(entry: ExpenseEntry) {
    setForm({ ...entry })
  }

  function setField<K extends keyof ExpenseEntry>(key: K, val: ExpenseEntry[K]) {
    setForm((p) => p && ({ ...p, [key]: val }))
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    const entry: ExpenseEntry = {
      ...form,
      id: form.id ?? Date.now().toString(),
    }
    try {
      await saveExpenseEntry(shopCode, entry)
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id)
        if (idx >= 0) return prev.map((e) => (e.id === entry.id ? entry : e))
        return [entry, ...prev]
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

  const filtered = filterDate ? entries.filter((e) => e.date === filterDate) : entries
  const sortedFiltered = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.expense_title}</h2>
        <button
          onClick={openNew}
          className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
        >
          {tr.add}
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <label className="text-xs text-gray-500 shrink-0">{tr.filter_date}</label>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
        />
        {filterDate && (
          <button
            onClick={() => setFilterDate('')}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            {tr.clear}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : sortedFiltered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data}</div>
      ) : (
        <div className="space-y-3">
          {sortedFiltered.map((entry) => (
            <div
              key={entry.id}
              className={`bg-white rounded-xl border shadow-sm p-4 ${
                entry.paid ? 'border-gray-100' : 'border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {entry.supplier || '—'}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {entry.category}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${METHOD_COLORS[entry.paymentMethod]}`}
                    >
                      {entry.paymentMethod}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{entry.date}</div>
                  {entry.description && (
                    <div className="text-xs text-gray-500 mt-1">{entry.description}</div>
                  )}
                  {entry.paymentMethod === 'Online Banking' && (
                    <div className="text-xs text-purple-600 mt-1">
                      {entry.bankAccount && `🏦 ${entry.bankAccount}`}
                      {entry.dueDate && ` · Due: ${entry.dueDate}`}
                    </div>
                  )}
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="text-base font-bold text-gray-800">
                    {entry.total.toLocaleString()} ฿
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                <button
                  onClick={() => handleTogglePaid(entry.id)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                    entry.paid
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-brand-gold-light text-brand-gold hover:bg-brand-gold/20'
                  }`}
                >
                  {entry.paid ? tr.paid_status : tr.unpaid_status}
                </button>
                <button
                  onClick={() => openEdit(entry)}
                  className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
                >
                  {tr.edit}
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-xs text-red-400 hover:text-red-600 cursor-pointer"
                >
                  {tr.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 my-auto">
            <h3 className="font-bold text-gray-900">
              {form.id ? tr.edit_expense : tr.add_expense}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{tr.date_label}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => setField('supplier', e.target.value)}
                  placeholder={tr.supplier_placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder={tr.desc_placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Total (฿)</label>
                <input
                  type="number"
                  min="0"
                  value={form.total || ''}
                  onChange={(e) => setField('total', Number(e.target.value))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1.5">Payment Method</label>
                <div className="flex gap-2">
                  {(['Cash', 'Credit Card', 'Online Banking'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setField('paymentMethod', m)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                        form.paymentMethod === m
                          ? 'bg-brand-gold text-white border-brand-gold'
                          : 'border-brand-accent text-gray-600 hover:border-brand-gold/50'
                      }`}
                    >
                      {m === 'Cash' ? '💵' : m === 'Credit Card' ? '💳' : '🏦'} {m}
                    </button>
                  ))}
                </div>
              </div>

              {form.paymentMethod === 'Online Banking' && (
                <>
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
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Due Date</label>
                    <input
                      type="date"
                      value={form.dueDate ?? ''}
                      onChange={(e) => setField('dueDate', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">{tr.status_label}</label>
              <button
                type="button"
                onClick={() => setField('paid', !form.paid)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  form.paid
                    ? 'bg-green-100 text-green-700'
                    : 'bg-brand-gold-light text-brand-gold'
                }`}
              >
                {form.paid ? tr.paid_status : tr.unpaid_status}
              </button>
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
                disabled={saving}
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
