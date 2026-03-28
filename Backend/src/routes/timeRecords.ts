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
      listEmployees(shopCode, true),  // include fired for historical display
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

// POST /:shopCode/time-records
// Weekly: { records: TimeRecord[], trips: [] }
// Home delivery: { date: string, records: [], trips: DeliveryTrip[] }
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { date, records, trips } = req.body as {
      date?: string
      records: TimeRecord[]
      trips: DeliveryTrip[]
    }
    const shopCode = req.params.shopCode
    const [allRecords, allTrips] = await Promise.all([
      listTimeRecords(shopCode),
      listDeliveryTrips(shopCode),
    ])
    // Replace records whose dates appear in the new batch
    const newDates = new Set(records.map((r) => r.date))
    const keptRecords = allRecords.filter((r) => !newDates.has(r.date))
    // Replace trips for the given date (home delivery)
    const keptTrips = date ? allTrips.filter((t) => t.date !== date) : allTrips
    await Promise.all([
      saveTimeRecords(shopCode, [...keptRecords, ...records]),
      saveDeliveryTrips(shopCode, [...keptTrips, ...trips]),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error('[timeRecords POST]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
