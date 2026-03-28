import { Router, Response } from 'express'
import { listEmployees, saveEmployees } from '../db'
import { requireShopAuth, requireOwner, requireManager } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { Employee } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/employees
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const includeAll = req.query.all === 'true'
    res.json(await listEmployees(req.params.shopCode, includeAll))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/employees — upsert (manager or owner)
router.post('/', requireManager, async (req: AuthRequest, res: Response) => {
  try {
    const employee = req.body as Employee
    // Load all including fired to check duplicates across all employees
    const all = await listEmployees(req.params.shopCode, true)
    const idx = all.findIndex((e) => e.id === employee.id)
    // Reject duplicate name (different ID, same name case-insensitive, not fired)
    const nameLower = employee.name.trim().toLowerCase()
    const duplicate = all.find(
      (e) => e.id !== employee.id && !e.fired && e.name.trim().toLowerCase() === nameLower
    )
    if (duplicate) {
      res.status(409).json({ error: 'มีพนักงานชื่อนี้อยู่แล้ว' })
      return
    }
    if (idx >= 0) all[idx] = { ...employee, fired: undefined }
    else all.push(employee)
    await saveEmployees(req.params.shopCode, all)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /:shopCode/employees/:id — soft delete (manager or owner)
router.delete('/:id', requireManager, async (req: AuthRequest, res: Response) => {
  try {
    const all = await listEmployees(req.params.shopCode, true)
    const updated = all.map((e) => e.id === req.params.id ? { ...e, fired: true } : e)
    await saveEmployees(req.params.shopCode, updated)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
