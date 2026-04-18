import { Router, Response } from 'express'
import { listDeliveryRates, saveDeliveryRates, getDeliveryFee, saveDeliveryFee, getExtraRate, saveExtraRate, appendAuditLog } from '../db'
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

// GET /:shopCode/config/extra-rate
router.get('/extra-rate', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rate = await getExtraRate(req.params.shopCode)
    res.json({ rate })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/config/extra-rate — owner only
router.post('/extra-rate', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { rate } = req.body as { rate: number }
    await saveExtraRate(req.params.shopCode, rate)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/config/audit-log
router.post('/audit-log', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { editorName, note, employeeName, shift, changes } = req.body as {
      editorName: string; note: string; employeeName: string; shift: string; changes: string
    }
    await appendAuditLog(req.params.shopCode, { editorName, note, employeeName, shift, changes })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
