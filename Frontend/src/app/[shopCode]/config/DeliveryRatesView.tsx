'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { DeliveryRate } from '@/lib/types'
import { rateLabel } from '@/lib/config'
import { saveDeliveryRates, saveDeliveryFee } from './actions'

export default function DeliveryRatesView({
  initialRates,
  initialDeliveryFee,
  role,
}: {
  initialRates: DeliveryRate[]
  initialDeliveryFee: number
  role: string
}) {
  const { shopCode } = useParams() as { shopCode: string }
  const [rates, setRates] = useState(initialRates)
  const [deliveryFee, setDeliveryFee] = useState(initialDeliveryFee)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isOwner = role === 'owner'

  function updateFee(index: number, value: number) {
    setRates((p) => p.map((r, i) => (i === index ? { ...r, fee: value } : r)))
    setSaved(false)
  }

  function updateMaxKm(index: number, value: number) {
    setRates((p) => p.map((r, i) => (i === index ? { ...r, maxKm: value } : r)))
    setSaved(false)
  }

  function addTier() {
    const lastNormal = rates.filter((r) => r.maxKm < 9999)
    const lastKm = lastNormal.length > 0 ? lastNormal[lastNormal.length - 1].maxKm : 0
    const catchAll = rates[rates.length - 1]
    const newTier: DeliveryRate = { maxKm: lastKm + 1, fee: catchAll.fee }
    setRates((p) => [...p.slice(0, -1), newTier, p[p.length - 1]])
    setSaved(false)
  }

  function removeTier(index: number) {
    if (rates.length <= 2) return
    if (index === rates.length - 1) return // ห้ามลบ catch-all
    setRates((p) => p.filter((_, i) => i !== index))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveDeliveryRates(shopCode, rates)
      await saveDeliveryFee(shopCode, deliveryFee)
      setSaved(true)
    } catch {
      alert('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/${shopCode}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← กลับ
        </Link>
        <h2 className="text-lg font-bold text-gray-800 flex-1">อัตรา Delivery</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            {isOwner ? 'แก้ไขอัตราค่าจัดส่งแต่ละช่วงระยะทาง' : 'อัตราค่าจัดส่งปัจจุบัน (ต้องเป็น Manager ถึงจะแก้ไขได้)'}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">ระยะทาง</th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">
                {isOwner ? 'ขอบเขต (km)' : ''}
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">ค่าจัดส่ง ($)</th>
              {isOwner && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rates.map((rate, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2.5 text-sm text-gray-700 font-medium whitespace-nowrap">
                  {rateLabel(rates, i)}
                </td>
                <td className="px-4 py-2">
                  {isOwner && rate.maxKm < 9999 ? (
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={rate.maxKm}
                      onChange={(e) => updateMaxKm(i, Number(e.target.value))}
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
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        value={rate.fee}
                        onChange={(e) => updateFee(i, Number(e.target.value))}
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
                      <button
                        onClick={() => removeTier(i)}
                        className="text-red-300 hover:text-red-500 cursor-pointer text-base"
                      >
                        ×
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 font-medium">ค่า Delivery Fee รายวัน (ต่อพนักงาน 1 คน)</p>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-gray-600">Fixed Delivery Fee per employee per day</span>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-sm text-gray-400">$</span>
            {isOwner ? (
              <input
                type="number"
                min="0"
                step="0.50"
                value={deliveryFee}
                onChange={(e) => { setDeliveryFee(Number(e.target.value)); setSaved(false) }}
                className="w-24 border border-brand-accent rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold"
              />
            ) : (
              <span className="text-sm font-semibold text-brand-green">{deliveryFee.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="flex gap-2">
          <button
            onClick={addTier}
            className="flex-1 py-2.5 border-2 border-dashed border-brand-gold/50 text-brand-gold text-sm rounded-xl hover:border-brand-gold hover:bg-brand-gold-light transition-colors cursor-pointer"
          >
            + เพิ่ม tier
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
          </button>
        </div>
      )}
    </div>
  )
}
