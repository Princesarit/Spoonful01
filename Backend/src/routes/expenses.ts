import { Router, Response } from 'express'
import { listExpenses, listExpensesAll, saveExpenses } from '../db'
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
    const all = await listExpensesAll(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === entry.id)
    if (idx >= 0) all[idx] = { ...entry, deleted: all[idx].deleted }
    else all.push(entry)
    await saveExpenses(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/expenses/:id — soft delete
router.delete('/:id', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listExpensesAll(req.params.shopCode)
    const updated = all.map((e) => e.id === req.params.id ? { ...e, deleted: true } : e)
    await saveExpenses(req.params.shopCode, updated)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /:shopCode/expenses/:id/toggle-paid
router.patch('/:id/toggle-paid', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listExpensesAll(req.params.shopCode)
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
