import { Router, Response } from 'express'
import { getWagePayments, saveWagePayments, syncWageSheet } from '../db'
import { requireShopAuth, requireManager } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router({ mergeParams: true })

// GET /:shopCode/wages/payments?weekStart=YYYY-MM-DD
router.get('/payments', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const weekStart = req.query.weekStart as string
    if (!weekStart) { res.status(400).json({ error: 'weekStart required' }); return }
    const { payments, weekNote } = await getWagePayments(req.params.shopCode, weekStart)
    res.json({ payments: Object.fromEntries(payments), weekNote })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/wages/payments
router.post('/payments', requireManager, async (req: AuthRequest, res: Response) => {
  try {
    const { weekStart, payments, weekNote } = req.body as {
      weekStart: string
      weekNote: string
      payments: { employeeId: string; tax: number; paid: number; note: string; overrides: Record<string, number> }[]
    }
    await saveWagePayments(req.params.shopCode, weekStart, payments, weekNote ?? '')
    await syncWageSheet(req.params.shopCode)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
