import { Router, Response } from 'express'
import { syncAllReportSheets, syncIncomeSheet, syncWageSheet, syncSumSheet, syncOverAllSheet, hideShopInternalSheets } from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { acquireSyncLock, releaseSyncLock } from '../lockState'

const router = Router({ mergeParams: true })

router.post('/sync', requireShopAuth, async (req: AuthRequest, res: Response) => {
  if (!acquireSyncLock()) {
    res.status(409).json({ error: 'busy', message: 'Sync กำลังทำงานอยู่ กรุณารอสักครู่' })
    return
  }
  try {
    await syncAllReportSheets(req.params.shopCode)
    res.json({ ok: true, message: 'All report sheets synced' })
  } catch (err) {
    console.error('[sheetSync] error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    releaseSyncLock()
  }
})

router.post('/sync/income', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try { await syncIncomeSheet(req.params.shopCode); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

router.post('/sync/wage', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try { await syncWageSheet(req.params.shopCode); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

router.post('/sync/sum', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try { await syncSumSheet(req.params.shopCode); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

router.post('/sync/overall', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try { await syncOverAllSheet(req.params.shopCode); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

router.post('/sync/hide', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try { await hideShopInternalSheets(req.params.shopCode); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

export default router
