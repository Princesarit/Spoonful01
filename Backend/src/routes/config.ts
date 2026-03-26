import { Router, Response } from 'express'
import { listDeliveryRates, saveDeliveryRates } from '../db'
import { requireShopAuth, requireOwner } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { DeliveryRate } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/config/delivery-rates
router.get('/delivery-rates', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rates = await listDeliveryRates(req.params.shopCode)
    res.json(rates)
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/config/delivery-rates — owner only
router.post('/delivery-rates', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    await saveDeliveryRates(req.params.shopCode, req.body as DeliveryRate[])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
