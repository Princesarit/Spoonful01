import { Router, Response } from 'express'
import { listRevenue, listRevenueAll, saveRevenue, migrateRevenueSchema, listPlatforms, savePlatforms } from '../db'
import { requireShopAuth, requireOwner } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { RevenueEntry, DeliveryPlatform } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/revenue — entries + platforms
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [[entries], platforms] = await Promise.all([
      migrateRevenueSchema(req.params.shopCode),
      listPlatforms(req.params.shopCode),
    ])
    res.json({ entries, platforms })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/revenue/platforms — update platforms (owner only) — ต้องอยู่ก่อน /:id
router.post('/platforms', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    await savePlatforms(req.params.shopCode, req.body as DeliveryPlatform[])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/revenue — upsert entry
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entry = req.body as RevenueEntry
    // Use listRevenueAll so soft-deleted rows are preserved in the sheet
    const all = await listRevenueAll(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === entry.id)
    if (idx >= 0) all[idx] = { ...entry, deleted: all[idx].deleted }  // preserve deleted flag
    else all.push(entry)
    await saveRevenue(req.params.shopCode, all)
    res.json({ ok: true })
  } catch (err) {
    console.error('[revenue POST] error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/revenue/:id — soft delete (marks deleted: true, keeps data in Sheet)
router.delete('/:id', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Read ALL entries including already-deleted ones to preserve them in the sheet
    const all = await listRevenueAll(req.params.shopCode)
    const updated = all.map((e) => e.id === req.params.id ? { ...e, deleted: true } : e)
    await saveRevenue(req.params.shopCode, updated)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
