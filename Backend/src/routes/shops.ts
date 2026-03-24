import { Router, Request, Response } from 'express'
import { listShops, saveShops } from '../db'
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
  const { password, name, restaurantPassword, ownerPassword } = req.body as {
    password: string
    name: string
    restaurantPassword: string
    ownerPassword: string
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

    const shop: StoredShop = { code, name: name.trim(), restaurantPassword, ownerPassword }
    await saveShops([...all, shop])
    res.json({ ok: true, code })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /shops/:code — แก้ไขสาขา
router.put('/:code', async (req: Request, res: Response) => {
  const { password, name, restaurantPassword, ownerPassword } = req.body as {
    password: string
    name: string
    restaurantPassword: string
    ownerPassword: string
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
    all[idx] = { code: req.params.code, name: name.trim(), restaurantPassword, ownerPassword }
    await saveShops(all)
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

export default router
