'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { DeliveryRate, DeliverySupplier } from '@/lib/types'
import { rateLabel } from '@/lib/config'
import { saveDeliveryRates, saveDeliverySuppliers, saveConfigAuditLog } from './actions'
import { useToast } from '@/components/Toast'
import { useShop } from '@/components/ShopProvider'
import { translations, type Tr } from '@/lib/translations'

// ── Supplier form state ────────────────────────────────────────────────────────
interface SupplierDraft {
  id: string
  name: string
  hasOnline: boolean
  hasCards: boolean
  hasCash: boolean
}

function emptyDraft(): SupplierDraft {
  return { id: '', name: '', hasOnline: true, hasCards: false, hasCash: false }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)
}

export default function DeliveryRatesView({
  initialRates,
  initialSuppliers,
  role,
}: {
  initialRates: DeliveryRate[]
  initialSuppliers: DeliverySupplier[]
  role: string
}) {
  const { shopCode } = useParams() as { shopCode: string }
  const { lang } = useShop()
  const tr = translations[lang]
  const { showToast, toastEl } = useToast()
  const isOwner = role === 'owner'

  // ── Delivery Rates state ──────────────────────────────────────────────────
  const [rates, setRates] = useState(initialRates)
  const [ratesSaving, setRatesSaving] = useState(false)
  const [ratesSaved, setRatesSaved] = useState(false)

  function updateFee(index: number, value: number) {
    setRates((p) => p.map((r, i) => (i === index ? { ...r, fee: value } : r)))
    setRatesSaved(false)
  }

  function updateMaxKm(index: number, value: number) {
    setRates((p) => p.map((r, i) => (i === index ? { ...r, maxKm: value } : r)))
    setRatesSaved(false)
  }

  function addTier() {
    const lastNormal = rates.filter((r) => r.maxKm < 9999)
    const lastKm = lastNormal.length > 0 ? lastNormal[lastNormal.length - 1].maxKm : 0
    const catchAll = rates[rates.length - 1]
    setRates((p) => [...p.slice(0, -1), { maxKm: lastKm + 1, fee: catchAll.fee }, p[p.length - 1]])
    setRatesSaved(false)
  }

  function removeTier(index: number) {
    if (rates.length <= 2 || index === rates.length - 1) return
    setRates((p) => p.filter((_, i) => i !== index))
    setRatesSaved(false)
  }

  async function handleSaveRates() {
    setRatesSaving(true)
    try {
      const changeParts: string[] = []
      rates.forEach((r, i) => {
        const orig = initialRates[i]
        if (!orig) { changeParts.push(`+tier: ≤${r.maxKm}km=$${r.fee}`); return }
        if (orig.maxKm !== r.maxKm || orig.fee !== r.fee) {
          changeParts.push(`tier${i + 1}: ≤${orig.maxKm}km=$${orig.fee}→≤${r.maxKm}km=$${r.fee}`)
        }
      })
      if (initialRates.length > rates.length) {
        for (let i = rates.length; i < initialRates.length; i++) {
          changeParts.push(`-tier: ≤${initialRates[i].maxKm}km=$${initialRates[i].fee}`)
        }
      }
      await saveDeliveryRates(shopCode, rates)
      await saveConfigAuditLog(shopCode, changeParts.length > 0 ? changeParts.join(' | ') : 'No changes')
      setRatesSaved(true)
      showToast(tr.save_success)
    } catch {
      showToast(tr.save_fail, 'error')
    } finally {
      setRatesSaving(false)
    }
  }

  // ── Delivery Suppliers state ───────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<DeliverySupplier[]>(initialSuppliers)
  const [suppliersSaving, setSuppliersSaving] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null) // id being edited
  const [draft, setDraft] = useState<SupplierDraft>(emptyDraft())
  const [addingNew, setAddingNew] = useState(false)

  function startEdit(s: DeliverySupplier) {
    setDraft({ ...s })
    setEditingSupplier(s.id)
    setAddingNew(false)
  }

  function startAdd() {
    setDraft(emptyDraft())
    setAddingNew(true)
    setEditingSupplier(null)
  }

  function cancelEdit() {
    setEditingSupplier(null)
    setAddingNew(false)
    setDraft(emptyDraft())
  }

  function applyEdit() {
    const name = draft.name.trim()
    if (!name) return
    if (addingNew) {
      const id = slugify(name) || `sup${Date.now()}`
      if (suppliers.some((s) => s.id === id)) {
        showToast(tr.supplier_duplicate, 'error'); return
      }
      setSuppliers((p) => [...p, { ...draft, id, name }])
    } else {
      setSuppliers((p) => p.map((s) => s.id === editingSupplier ? { ...draft, name } : s))
    }
    cancelEdit()
  }

  function removeSupplier(id: string) {
    setSuppliers((p) => p.filter((s) => s.id !== id))
  }

  async function handleSaveSuppliers() {
    setSuppliersSaving(true)
    try {
      await saveDeliverySuppliers(shopCode, suppliers)
      await saveConfigAuditLog(shopCode, `Platforms updated: ${suppliers.map((s) => s.name).join(', ')}`)
      showToast(tr.save_platforms_success)
    } catch {
      showToast(tr.save_fail, 'error')
    } finally {
      setSuppliersSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          {tr.back}
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{tr.delivery_setting_title}</h2>
      </div>

      {/* ── Delivery Rates ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{tr.delivery_rates_title}</h3>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              {isOwner ? tr.delivery_rates_owner_desc : tr.delivery_rates_staff_desc}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{tr.distance_col}</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{isOwner ? tr.range_col : ''}</th>
                <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">{tr.delivery_fee_col}</th>
                {isOwner && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rates.map((rate, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-gray-700 font-medium whitespace-nowrap">{rateLabel(rates, i)}</td>
                  <td className="px-4 py-2">
                    {isOwner && rate.maxKm < 9999 ? (
                      <input type="number" min="0" step="0.5" value={rate.maxKm} title={tr.range_col}
                        onKeyDown={(e) => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                        onChange={(e) => { const raw = e.target.value; if (raw.includes('.') && (raw.split('.')[1]?.length ?? 0) > 2) return; const v = Number(raw); if (v > 999999) return; updateMaxKm(i, v) }}
                        className="w-20 border border-brand-accent rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">{rate.maxKm >= 9999 ? '∞' : `${rate.maxKm} km`}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isOwner ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">$</span>
                        <input type="number" min="0" step="0.50" value={rate.fee} title={tr.delivery_fee_col}
                          onKeyDown={(e) => ['e','E','+','-'].includes(e.key) && e.preventDefault()}
                          onChange={(e) => { const raw = e.target.value; if (raw.includes('.') && (raw.split('.')[1]?.length ?? 0) > 2) return; const v = Number(raw); if (Math.floor(Math.abs(v)) > 999999) return; updateFee(i, v) }}
                          className="w-20 border border-brand-accent rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-brand-green">${rate.fee.toFixed(2)}</span>
                    )}
                  </td>
                  {isOwner && (
                    <td className="px-2">
                      {rate.maxKm < 9999 && rates.length > 2 && (
                        <button onClick={() => removeTier(i)} className="text-red-300 hover:text-red-500 cursor-pointer text-base">×</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <button onClick={addTier}
              className="flex-1 py-2.5 border-2 border-dashed border-brand-gold/50 text-brand-gold text-sm rounded-xl hover:border-brand-gold hover:bg-brand-gold-light transition-colors cursor-pointer">
              {tr.add_tier}
            </button>
            <button onClick={handleSaveRates} disabled={ratesSaving}
              className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer">
              {ratesSaving ? tr.saving : ratesSaved ? tr.saved : tr.save}
            </button>
          </div>
        )}
      </section>

      {/* ── Delivery Platforms ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{tr.delivery_platforms_title}</h3>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">{tr.delivery_platforms_desc}</p>
          </div>
          <div className="divide-y divide-gray-100">
            {suppliers.map((s) => (
              <div key={s.id}>
                {editingSupplier === s.id ? (
                  <SupplierDraftRow draft={draft} setDraft={setDraft} onSave={applyEdit} onCancel={cancelEdit} tr={tr} />
                ) : (
                  <div className="flex items-center px-4 py-3 gap-3">
                    <span className="font-medium text-sm text-gray-800 w-28 shrink-0">{s.name}</span>
                    <div className="flex gap-1.5 flex-1 flex-wrap">
                      {s.hasOnline && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">Online</span>}
                      {s.hasCards  && <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-full">Cards</span>}
                      {s.hasCash   && <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full">Cash</span>}
                    </div>
                    {isOwner && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startEdit(s)} className="text-xs text-brand-gold hover:text-brand-gold-dark cursor-pointer">{tr.edit}</button>
                        <button onClick={() => removeSupplier(s.id)} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">{tr.delete}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {addingNew && (
              <SupplierDraftRow draft={draft} setDraft={setDraft} onSave={applyEdit} onCancel={cancelEdit} isNew tr={tr} />
            )}
          </div>
        </div>

        {isOwner && (
          <div className="flex gap-2">
            {!addingNew && (
              <button onClick={startAdd}
                className="flex-1 py-2.5 border-2 border-dashed border-brand-gold/50 text-brand-gold text-sm rounded-xl hover:border-brand-gold hover:bg-brand-gold-light transition-colors cursor-pointer">
                {tr.add_platform}
              </button>
            )}
            <button onClick={handleSaveSuppliers} disabled={suppliersSaving || addingNew || !!editingSupplier}
              className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer">
              {suppliersSaving ? tr.saving_platforms : tr.save_platforms}
            </button>
          </div>
        )}
      </section>

      {toastEl}
    </div>
  )
}

// ── Inline edit/add row ────────────────────────────────────────────────────────
function SupplierDraftRow({
  draft, setDraft, onSave, onCancel, tr, isNew = false,
}: {
  draft: SupplierDraft
  setDraft: React.Dispatch<React.SetStateAction<SupplierDraft>>
  onSave: () => void
  onCancel: () => void
  tr: Tr
  isNew?: boolean
}) {
  return (
    <div className="px-4 py-3 space-y-2 bg-amber-50">
      <div className="flex gap-2 items-center">
        <input
          autoFocus
          placeholder={tr.platform_name_placeholder}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="flex-1 border border-brand-accent rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
        />
      </div>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={draft.hasOnline} onChange={(e) => setDraft((d) => ({ ...d, hasOnline: e.target.checked }))}
            className="accent-brand-gold" />
          <span className="text-gray-700">Online</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={draft.hasCards} onChange={(e) => setDraft((d) => ({ ...d, hasCards: e.target.checked }))}
            className="accent-brand-gold" />
          <span className="text-gray-700">Cards</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={draft.hasCash} onChange={(e) => setDraft((d) => ({ ...d, hasCash: e.target.checked }))}
            className="accent-brand-gold" />
          <span className="text-gray-700">Cash</span>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={!draft.name.trim()}
          className="px-4 py-1.5 bg-brand-gold text-white text-xs rounded-lg font-medium disabled:opacity-40 cursor-pointer">
          {isNew ? tr.add.replace(/^\+\s*/, '') : tr.save}
        </button>
        <button onClick={onCancel}
          className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg cursor-pointer">
          {tr.cancel}
        </button>
      </div>
    </div>
  )
}
