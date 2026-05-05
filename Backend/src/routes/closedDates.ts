import { Router, Response } from 'express'
import { listClosedDates, addClosedDate, removeClosedDate } from '../db'
import { requireShopAuth, requireOwner } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { ClosedDate, ClosedMeal } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/closed-dates
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const dates = await listClosedDates(req.params.shopCode)
    res.json(dates)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/closed-dates — owner only
router.post('/', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { date, meal, note, closedBy } = req.body as {
      date: string; meal: ClosedMeal; note: string; closedBy: string
    }
    if (!date || !meal) {
      res.status(400).json({ error: 'date and meal are required' })
      return
    }
    const entry: ClosedDate = {
      date,
      meal,
      note: note ?? '',
      closedBy: closedBy ?? req.session?.role ?? 'owner',
      closedAt: new Date().toISOString(),
    }
    await addClosedDate(req.params.shopCode, entry)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/closed-dates/:date?meal=lunch|dinner|both — owner only
router.delete('/:date', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const meal = req.query.meal as ClosedMeal | undefined
    await removeClosedDate(req.params.shopCode, req.params.date, meal)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
