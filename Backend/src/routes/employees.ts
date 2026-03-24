import { Router, Response } from 'express'
import { listEmployees, saveEmployees } from '../db'
import { requireShopAuth, requireOwner } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { Employee } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/employees
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listEmployees(req.params.shopCode))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/employees — upsert (owner only)
router.post('/', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const employee = req.body as Employee
    const all = await listEmployees(req.params.shopCode)
    const idx = all.findIndex((e) => e.id === employee.id)
    if (idx >= 0) all[idx] = employee
    else all.push(employee)
    await saveEmployees(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/employees/:id (owner only)
router.delete('/:id', requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listEmployees(req.params.shopCode)
    await saveEmployees(req.params.shopCode, all.filter((e) => e.id !== req.params.id))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
