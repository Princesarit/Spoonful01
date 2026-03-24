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
      listEmployees(req.params.shopCode),
      listSchedules(req.params.shopCode),
    ])
    res.json({ employees, schedules })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/schedules — upsert week schedule
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const weekSchedule = req.body as WeekSchedule
    const all = await listSchedules(req.params.shopCode)
    const idx = all.findIndex((s) => s.weekStart === weekSchedule.weekStart)
    if (idx >= 0) all[idx] = weekSchedule
    else all.push(weekSchedule)
    await saveSchedules(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
