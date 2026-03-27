import { Router, Request, Response } from 'express'
import { listShops, saveShops, invalidateShopCache, migrateShopToOwnSpreadsheet, syncAllEmployeesToMaster } from '../db'
import { createSpreadsheet } from '../sheets'
import { config } from '../config'
import type { StoredShop } from '../types'

const router = Router()

function verifyMaster(password: string): boolean {
  return config.masterPassword !== '' && password === config.masterPassword
}

// GET /shops — รายชื่อร้าน (public)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const shops = await listShops()
    res.json(shops.map(({ code, name }) => ({ code, name })))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /shops/admin?password=... — รายชื่อร้านพร้อม password (master only)
router.get('/admin', async (req: Request, res: Response) => {
  const { password } = req.query as { password: string }
  if (!verifyMaster(password)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    res.json(await listShops())
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /shops — เพิ่มสาขาใหม่
router.post('/', async (req: Request, res: Response) => {
  const { password, name, restaurantPassword, managerPassword, ownerPassword } = req.body as {
    password: string
    name: string
    restaurantPassword: string
    managerPassword: string
    ownerPassword?: string
  }
  if (!verifyMaster(password)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!name?.trim()) {
    res.status(400).json({ error: 'กรุณากรอกชื่อสาขา' })
    return
  }
  try {
    const all = await listShops()
    const maxCode = all.reduce((max, s) => {
      const n = parseInt(s.code, 10)
      return isNaN(n) ? max : Math.max(max, n)
    }, 0)
    const code = String(maxCode + 1).padStart(2, '0')

    // สร้าง Spreadsheet ใหม่สำหรับสาขานี้
    const spreadsheetId = await createSpreadsheet(`Spoonful - ${name.trim()}`)

    const shop: StoredShop = { code, name: name.trim(), restaurantPassword, managerPassword, ownerPassword: ownerPassword || undefined, spreadsheetId }
    await saveShops([...all, shop])
    res.json({ ok: true, code, spreadsheetId })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /shops/:code — แก้ไขสาขา
router.put('/:code', async (req: Request, res: Response) => {
  const { password, name, restaurantPassword, managerPassword, ownerPassword } = req.body as {
    password: string
    name: string
    restaurantPassword: string
    managerPassword: string
    ownerPassword?: string
  }
  if (!verifyMaster(password)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const all = await listShops()
    const idx = all.findIndex((s) => s.code === req.params.code)
    if (idx < 0) {
      res.status(404).json({ error: 'ไม่พบสาขา' })
      return
    }
    all[idx] = { ...all[idx], name: name.trim(), restaurantPassword, managerPassword, ownerPassword: ownerPassword || undefined }
    await saveShops(all)
    invalidateShopCache(req.params.code)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /shops/:code — ลบสาขา
router.delete('/:code', async (req: Request, res: Response) => {
  const { password } = req.body as { password: string }
  if (!verifyMaster(password)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const all = await listShops()
    await saveShops(all.filter((s) => s.code !== req.params.code))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /shops/sync-employees?password=... — sync all employees to master Employees tab
router.post('/sync-employees', async (req: Request, res: Response) => {
  const { password } = req.body as { password: string }
  if (!verifyMaster(password)) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    await syncAllEmployeesToMaster()
    res.json({ ok: true })
  } catch (err) {
    console.error('[sync-employees]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /shops/migrate-headers?password=... — re-save shops with new column names
router.post('/migrate-headers', async (req: Request, res: Response) => {
  const { password } = req.body as { password: string }
  if (!verifyMaster(password)) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const all = await listShops()
    await saveShops(all)
    res.json({ ok: true, count: all.length })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /shops/:code/migrate — ย้ายร้านเก่าไปยัง Spreadsheet ของตัวเอง
// body: { password, spreadsheetId } — spreadsheetId ของ Sheet ใหม่ที่สร้างเองและ share กับ service account แล้ว
router.post('/:code/migrate', async (req: Request, res: Response) => {
  const { password, spreadsheetId } = req.body as { password: string; spreadsheetId: string }
  if (!verifyMaster(password)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (!spreadsheetId?.trim()) {
    res.status(400).json({ error: 'กรุณาส่ง spreadsheetId ของ Google Sheet ที่สร้างใหม่' })
    return
  }
  try {
    const all = await listShops()
    const shop = all.find((s) => s.code === req.params.code)
    if (!shop) { res.status(404).json({ error: 'ไม่พบสาขา' }); return }
    if (shop.spreadsheetId) { res.json({ ok: true, spreadsheetId: shop.spreadsheetId, note: 'already migrated' }); return }
    await migrateShopToOwnSpreadsheet(req.params.code, spreadsheetId)
    res.json({ ok: true, spreadsheetId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    console.error('[migrate]', msg)
    res.status(500).json({ error: 'Migration failed', detail: msg })
  }
})

export default router
