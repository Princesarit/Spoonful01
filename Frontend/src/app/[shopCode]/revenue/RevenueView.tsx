'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { RevenueEntry, DeliveryPlatform } from '@/lib/types'
import { getRevenueData, saveRevenueEntry, deleteRevenueEntry, savePlatforms } from './actions'
import { useShop } from '@/components/ShopProvider'
import { translations } from '@/lib/translations'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function emptyEntry(platforms: DeliveryPlatform[]): RevenueEntry {
  return {
    id: '',
    date: today(),
    name: '',
    netSales: 0,
    paidOnline: 0,
    card: 0,
    cash: 0,
    platforms: Object.fromEntries(platforms.map((p) => [p.id, 0])),
  }
}

export default function RevenueView() {
  const { shopCode } = useParams() as { shopCode: string }
  const { session, lang } = useShop()
  const tr = translations[lang]
  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [platforms, setPlatforms] = useState<DeliveryPlatform[]>([])
  const [form, setForm] = useState<RevenueEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterDate, setFilterDate] = useState(today)
  const [showPlatformMgr, setShowPlatformMgr] = useState(false)
  const [newPlatformName, setNewPlatformName] = useState('')

  useEffect(() => {
    setLoading(true)
    getRevenueData(shopCode)
      .then(({ entries: e, platforms: p }) => {
        setEntries(e)
        setPlatforms(p)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [shopCode])

  function openNew() {
    setForm({ ...emptyEntry(platforms), id: Date.now().toString() })
  }

  function openEdit(entry: RevenueEntry) {
    setForm({ ...entry, platforms: { ...entry.platforms } })
  }

  function setField(key: keyof RevenueEntry, val: string | number) {
    setForm((p) => p && ({ ...p, [key]: val }))
  }

  function setPlatformVal(pid: string, val: number) {
    setForm((p) => p && ({ ...p, platforms: { ...p.platforms, [pid]: val } }))
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      await saveRevenueEntry(shopCode, form)
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === form.id)
        if (idx >= 0) return prev.map((e) => (e.id === form.id ? form : e))
        return [...prev, form]
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
    await deleteRevenueEntry(shopCode, id)
    setEntries((p) => p.filter((e) => e.id !== id))
  }

  async function handleAddPlatform() {
    if (!newPlatformName.trim()) return
    const updated = [
      ...platforms,
      { id: Date.now().toString(), name: newPlatformName.trim() },
    ]
    try {
      await savePlatforms(shopCode, updated)
      setPlatforms(updated)
      setNewPlatformName('')
    } catch {
      alert(tr.platform_fail)
    }
  }

  async function handleDeletePlatform(id: string) {
    if (!confirm(tr.confirm_del_platform)) return
    const updated = platforms.filter((p) => p.id !== id)
    await savePlatforms(shopCode, updated)
    setPlatforms(updated)
  }

  const filtered = entries.filter((e) => e.date === filterDate)

  // Calculations for form
  const platformTotal = form
    ? Object.values(form.platforms).reduce((s, v) => s + (v || 0), 0)
    : 0
  const totalSale = form ? (form.netSales + form.paidOnline + platformTotal) : 0
  const totalEftpos = form?.card ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.revenue_title}</h2>
        <div className="flex gap-2">
          {session.role === 'owner' && (
            <button
              onClick={() => setShowPlatformMgr(true)}
              className="text-xs border border-brand-accent text-gray-500 px-2.5 py-1.5 rounded-lg hover:border-brand-gold/50 cursor-pointer"
            >
              ⚙️ Platform
            </button>
          )}
          <button
            onClick={openNew}
            className="text-sm bg-brand-gold text-white px-3 py-1.5 rounded-lg hover:bg-brand-gold-dark cursor-pointer"
          >
            {tr.add}
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <label className="text-xs text-gray-500 shrink-0">{tr.view_date}</label>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
        />
        <span className="text-xs text-gray-400">{tr.items_count(filtered.length)}</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{tr.no_data}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const pTotal = Object.values(entry.platforms).reduce((s, v) => s + v, 0)
            const tSale = entry.netSales + entry.paidOnline + pTotal
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{entry.name || '—'}</div>
                    <div className="text-xs text-gray-400">{entry.date}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(entry)} className="text-xs text-blue-500 cursor-pointer">{tr.edit}</button>
                    <button onClick={() => handleDelete(entry.id)} className="text-xs text-red-400 cursor-pointer">{tr.delete}</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-gray-500">Net sales</span>
                  <span className="text-right font-medium">{entry.netSales.toLocaleString()} ฿</span>
                  <span className="text-gray-500">Paid Online</span>
                  <span className="text-right font-medium">{entry.paidOnline.toLocaleString()} ฿</span>
                  <span className="text-gray-500">Card (eftpos)</span>
                  <span className="text-right font-medium">{entry.card.toLocaleString()} ฿</span>
                  <span className="text-gray-500">Cash</span>
                  <span className="text-right font-medium">{entry.cash.toLocaleString()} ฿</span>
                  {platforms.map((p) => (
                    <React.Fragment key={p.id}>
                      <span className="text-gray-500">{p.name}</span>
                      <span className="text-right font-medium">
                        {(entry.platforms[p.id] ?? 0).toLocaleString()} ฿
                      </span>
                    </React.Fragment>
                  ))}
                  <span className="text-gray-700 font-semibold border-t border-gray-100 pt-1 mt-1">Total sale</span>
                  <span className="text-right font-bold text-brand-gold border-t border-gray-100 pt-1 mt-1">
                    {tSale.toLocaleString()} ฿
                  </span>
                  <span className="text-gray-500">Total eftpos</span>
                  <span className="text-right font-medium">{entry.card.toLocaleString()} ฿</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 my-auto">
            <h3 className="font-bold text-gray-900">{form.id ? tr.edit_revenue : tr.add_revenue}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">{tr.date_label}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">{tr.cashier_name}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={tr.name_input}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                />
              </div>
              {[
                { key: 'netSales', label: 'Net sales' },
                { key: 'paidOnline', label: 'Paid Online' },
                { key: 'card', label: 'Card (eftpos)' },
                { key: 'cash', label: 'Cash' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <input
                    type="number"
                    min="0"
                    value={(form as unknown as Record<string, number>)[key] || ''}
                    onChange={(e) => setField(key as keyof RevenueEntry, Number(e.target.value))}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                </div>
              ))}
            </div>

            {platforms.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2 font-medium">Delivery Platforms</div>
                <div className="grid grid-cols-2 gap-3">
                  {platforms.map((p) => (
                    <div key={p.id}>
                      <label className="text-xs text-gray-500 block mb-1">{p.name}</label>
                      <input
                        type="number"
                        min="0"
                        value={form.platforms[p.id] || ''}
                        onChange={(e) => setPlatformVal(p.id, Number(e.target.value))}
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-brand-gold-light rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Total sale</span>
                <span className="font-bold text-brand-gold">{totalSale.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Total eftpos</span>
                <span className="font-semibold">{totalEftpos.toLocaleString()} ฿</span>
              </div>
            </div>

            <div className="flex gap-2">
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

      {/* Platform Manager Modal */}
      {showPlatformMgr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 space-y-4">
            <h3 className="font-bold text-gray-900">{tr.platform_mgr_title}</h3>
            <div className="space-y-2">
              {platforms.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-700">{p.name}</span>
                  <button
                    onClick={() => handleDeletePlatform(p.id)}
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer"
                  >
                    {tr.delete}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                placeholder={tr.new_platform_placeholder}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
              <button
                onClick={handleAddPlatform}
                className="px-3 py-2 bg-brand-gold text-white rounded-lg text-sm cursor-pointer"
              >
                {tr.add}
              </button>
            </div>
            <button
              onClick={() => setShowPlatformMgr(false)}
              className="w-full py-2.5 border border-brand-accent rounded-xl text-sm text-gray-600 cursor-pointer"
            >
              {tr.close}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
