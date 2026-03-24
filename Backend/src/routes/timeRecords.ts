import { Router, Response } from 'express'
import {
  listEmployees,
  listTimeRecords,
  saveTimeRecords,
  listDeliveryTrips,
  saveDeliveryTrips,
} from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import type { TimeRecord, DeliveryTrip } from '../types'

const router = Router({ mergeParams: true })

// GET /:shopCode/time-records?date=YYYY-MM-DD
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as { date?: string }
    const shopCode = req.params.shopCode
    const [employees, allRecords, allTrips] = await Promise.all([
      listEmployees(shopCode),
      listTimeRecords(shopCode),
      listDeliveryTrips(shopCode),
    ])
    res.json({
      employees,
      timeRecords: date ? allRecords.filter((r) => r.date === date) : allRecords,
      deliveryTrips: date ? allTrips.filter((t) => t.date === date) : allTrips,
    })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/time-records — replace records for a given date
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { date, records, trips } = req.body as {
      date: string
      records: TimeRecord[]
      trips: DeliveryTrip[]
    }
    const shopCode = req.params.shopCode
    const [allRecords, allTrips] = await Promise.all([
      listTimeRecords(shopCode),
      listDeliveryTrips(shopCode),
    ])
    await Promise.all([
      saveTimeRecords(shopCode, [...allRecords.filter((r) => r.date !== date), ...records]),
      saveDeliveryTrips(shopCode, [...allTrips.filter((t) => t.date !== date), ...trips]),
    ])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
