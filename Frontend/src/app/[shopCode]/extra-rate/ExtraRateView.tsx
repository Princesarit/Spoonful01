'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { saveExtraRate, saveConfigAuditLog } from '../config/actions'

export default function ExtraRateView({
  initialExtraRate,
  role,
}: {
  initialExtraRate: number
  role: string
}) {
  const { shopCode } = useParams() as { shopCode: string }
  const [rate, setRate] = useState(initialExtraRate)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isOwner = role === 'owner'

  async function handleSave() {
    setSaving(true)
    try {
      await saveExtraRate(shopCode, rate)
      await saveConfigAuditLog(shopCode, `extra_rate: ${initialExtraRate}→${rate}`)
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
        <h2 className="text-lg font-bold text-gray-800 flex-1">Extra Rate Setting</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 font-medium">อัตราพิเศษ (เช่น Sunday surcharge)</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isOwner ? 'แก้ไขได้' : 'ต้องเป็น Owner ถึงจะแก้ไขได้'}
          </p>
        </div>
        <div className="px-4 py-4 flex items-center gap-3">
          <span className="text-sm text-gray-600 flex-1">Extra rate per shift</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-400">$</span>
            {isOwner ? (
              <input
                type="number"
                min="0"
                step="0.50"
                value={rate}
                onChange={(e) => { setRate(Number(e.target.value)); setSaved(false) }}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
              />
            ) : (
              <span className="text-sm font-semibold text-brand-green">${rate.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>

      {isOwner && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 bg-brand-gold text-white rounded-xl text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
      )}
    </div>
  )
}
