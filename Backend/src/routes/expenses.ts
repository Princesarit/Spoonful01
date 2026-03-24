import { Router, Response } from 'express'
import { listExpenses, saveExpenses } from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { ExpenseEntry } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/expenses
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listExpenses(req.params.shopCode))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/expenses — upsert entry
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entry = req.body as ExpenseEntry
    const all = await listExpenses(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === entry.id)
    if (idx >= 0) all[idx] = entry
    else all.push(entry)
    await saveExpenses(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/expenses/:id
router.delete('/:id', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listExpenses(req.params.shopCode)
    await saveExpenses(req.params.shopCode, all.filter((e) => e.id !== req.params.id))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /:shopCode/expenses/:id/toggle-paid
router.patch('/:id/toggle-paid', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listExpenses(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === req.params.id)
    if (idx < 0) {
      res.status(404).json({ error: 'ไม่พบรายการ' })
      return
    }
    all[idx] = { ...all[idx], paid: !all[idx].paid }
    await saveExpenses(req.params.shopCode, all)
    res.json({ ok: true, paid: all[idx].paid })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
