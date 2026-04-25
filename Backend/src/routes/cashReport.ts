import { Router, Response } from 'express'
import { getCashReportAll, saveCashReport } from '../db'
import type { SpecialItem } from '../db'
import { requireShopAuth, requireManager } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router({ mergeParams: true })

router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const map = await getCashReportAll(req.params.shopCode)
    const report: Record<string, { cashFromBank: number; cashLeftInBag: number | null; incomeItems: SpecialItem[]; expenseItems: SpecialItem[] }> = {}
    for (const [ws, data] of map.entries()) report[ws] = data
    res.json({ report })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', requireManager, async (req: AuthRequest, res: Response) => {
  try {
    const { weekStart, cashFromBank, cashLeftInBag, incomeItems, expenseItems } = req.body as {
      weekStart: string
      cashFromBank: number
      cashLeftInBag: number | null
      incomeItems: SpecialItem[]
      expenseItems: SpecialItem[]
    }
    if (!weekStart) { res.status(400).json({ error: 'weekStart required' }); return }
    await saveCashReport(
      req.params.shopCode, weekStart,
      cashFromBank ?? 0, cashLeftInBag ?? null,
      incomeItems ?? [], expenseItems ?? [],
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
