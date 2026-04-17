import { Router, Response } from 'express'
import { listEmployees, listSchedules, saveSchedules } from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { WeekSchedule } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/schedules — employees + schedules
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [employees, schedules] = await Promise.all([
      listEmployees(req.params.shopCode, true),  // include fired for historical display
      listSchedules(req.params.shopCode),
    ])
    res.json({ employees, schedules })
  } catch (err) {
    console.error('[schedules GET]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/schedules — upsert week schedule
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const raw = req.body as WeekSchedule
    // Migrate any legacy 'Back' position values → 'Kitchen'
    const weekSchedule: WeekSchedule = {
      ...raw,
      entries: raw.entries.map((e) => ({
        ...e,
        days: e.days.map((d) => (d === 'Back' ? 'Kitchen' : d)),
      })),
    }
    const all = await listSchedules(req.params.shopCode)
    const newMs = new Date(weekSchedule.weekStart + 'T00:00:00Z').getTime()
    // Remove any existing schedule whose 7-day window overlaps (handles off-by-one weekStart from old bug)
    const filtered = all.filter((s) => {
      const ms = new Date(s.weekStart + 'T00:00:00Z').getTime()
      return Math.abs(newMs - ms) >= 7 * 24 * 60 * 60 * 1000
    })
    filtered.push(weekSchedule)
    await saveSchedules(req.params.shopCode, filtered)
    res.json({ ok: true })
  } catch (err) {
    console.error('[schedules POST]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
