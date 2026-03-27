import { Router, Response } from 'express'
import { listDeliveryRates, saveDeliveryRates, getDeliveryFee, saveDeliveryFee } from '../db'
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

// GET /:shopCode/config/delivery-fee
router.get('/delivery-fee', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const fee = await getDeliveryFee(req.params.shopCode)
    res.json({ fee })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/config/delivery-fee — owner only
router.post('/delivery-fee', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { fee } = req.body as { fee: number }
    await saveDeliveryFee(req.params.shopCode, fee)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
