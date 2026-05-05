'use client'

import { useState, useEffect } from 'react'
import { getClosedDates } from '@/app/[shopCode]/closed-dates/actions'
import type { ClosedMeal } from '@/lib/types'

interface Props {
  shopCode: string
  date: string
  meal?: 'lunch' | 'dinner'
  lang: 'th' | 'en'
}

export function ClosedBanner({ shopCode, date, meal, lang }: Props) {
  const [closedMeal, setClosedMeal] = useState<ClosedMeal | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    getClosedDates(shopCode).then((list) => {
      if (cancelled) return
      const match = list.find(
        (d) =>
          d.date === date &&
          (d.meal === 'both' || !meal || d.meal === meal),
      )
      if (match) {
        setClosedMeal(match.meal)
        setNote(match.note)
      } else {
        setClosedMeal(null)
      }
    })
    return () => { cancelled = true }
  }, [shopCode, date, meal])

  if (!closedMeal) return null

  const mealLabel =
    closedMeal === 'both'
      ? (lang === 'th' ? 'ทั้งวัน' : 'All Day')
      : closedMeal === 'lunch'
      ? (lang === 'th' ? 'กลางวัน' : 'Lunch')
      : (lang === 'th' ? 'เย็น' : 'Dinner')

  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
      <span className="text-lg">🔒</span>
      <div>
        <p className="text-sm font-semibold text-red-700">
          {lang === 'th' ? `ร้านปิด — ${mealLabel}` : `Shop Closed — ${mealLabel}`}
        </p>
        {note && <p className="text-xs text-red-400 mt-0.5">{note}</p>}
        <p className="text-xs text-red-400 mt-0.5">
          {lang === 'th'
            ? 'ไม่สามารถบันทึกข้อมูลได้ในวันนี้'
            : 'Saving is disabled for this date.'}
        </p>
      </div>
    </div>
  )
}

export function useIsClosedDate(shopCode: string, date: string, meal?: 'lunch' | 'dinner'): boolean {
  const [isClosed, setIsClosed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getClosedDates(shopCode).then((list) => {
      if (cancelled) return
      const match = list.find(
        (d) =>
          d.date === date &&
          (d.meal === 'both' || !meal || d.meal === meal),
      )
      setIsClosed(!!match)
    })
    return () => { cancelled = true }
  }, [shopCode, date, meal])

  return isClosed
}
