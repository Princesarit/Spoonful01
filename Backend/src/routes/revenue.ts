import { Router, Response } from 'express'
import { listRevenue, saveRevenue, listPlatforms, savePlatforms } from '../db'
import { requireShopAuth, requireOwner } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { RevenueEntry, DeliveryPlatform } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/revenue — entries + platforms
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [entries, platforms] = await Promise.all([
      listRevenue(req.params.shopCode),
      listPlatforms(req.params.shopCode),
    ])
    res.json({ entries, platforms })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/revenue — upsert entry
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entry = req.body as RevenueEntry
    const all = await listRevenue(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === entry.id)
    if (idx >= 0) all[idx] = entry
    else all.push(entry)
    await saveRevenue(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/revenue/:id
router.delete('/:id', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listRevenue(req.params.shopCode)
    await saveRevenue(req.params.shopCode, all.filter((e) => e.id !== req.params.id))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/revenue/platforms — update platforms (owner only)
router.post('/platforms', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    await savePlatforms(req.params.shopCode, req.body as DeliveryPlatform[])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
