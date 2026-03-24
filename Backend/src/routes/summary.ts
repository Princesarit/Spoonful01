import { Router, Response } from 'express'
import {
  listEmployees,
  listTimeRecords,
  listDeliveryTrips,
  listRevenue,
  listExpenses,
  listNotes,
} from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router({ mergeParams: true })

// GET /:shopCode/summary?month=YYYY-MM
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query as { month?: string }
    const shopCode = req.params.shopCode

    const [employees, timeRecords, deliveryTrips, revenue, expenses, notes] = await Promise.all([
      listEmployees(shopCode),
      listTimeRecords(shopCode),
      listDeliveryTrips(shopCode),
      listRevenue(shopCode),
      listExpenses(shopCode),
      listNotes(shopCode),
    ])

    const filter = <T extends { date: string }>(arr: T[]) =>
      month ? arr.filter((x) => x.date.startsWith(month)) : arr

    res.json({
      employees,
      timeRecords: filter(timeRecords),
      deliveryTrips: filter(deliveryTrips),
      revenue: filter(revenue),
      expenses: filter(expenses),
      notes: filter(notes),
    })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
