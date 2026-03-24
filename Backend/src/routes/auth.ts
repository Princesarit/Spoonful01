import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { listShops } from '../db'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { shopCode, password } = req.body as { shopCode: string; password: string }
    if (!shopCode || !password) {
      res.status(400).json({ error: 'ข้อมูลไม่ครบ' })
      return
    }

    const shops = await listShops()
    const shop = shops.find((s) => s.code === shopCode)
    if (!shop) {
      res.status(404).json({ error: 'ไม่พบร้านที่เลือก' })
      return
    }

    let role: 'staff' | 'owner' | null = null
    if (password === shop.ownerPassword) role = 'owner'
    else if (password === shop.restaurantPassword) role = 'staff'

    if (!role) {
      res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' })
      return
    }

    const token = jwt.sign({ shopCode, role }, config.jwtSecret, { expiresIn: '7d' })
    res.json({ token, shopCode, role })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /auth/elevate  — เลื่อนจาก staff เป็น owner
router.post('/elevate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body as { password: string }
    const session = req.session!

    const shops = await listShops()
    const shop = shops.find((s) => s.code === session.shopCode)
    if (!shop) {
      res.status(404).json({ error: 'ไม่พบร้าน' })
      return
    }

    if (password !== shop.ownerPassword) {
      res.status(401).json({ error: 'Owner Password ไม่ถูกต้อง' })
      return
    }

    const token = jwt.sign(
      { shopCode: session.shopCode, role: 'owner' },
      config.jwtSecret,
      { expiresIn: '7d' },
    )
    res.json({ token, shopCode: session.shopCode, role: 'owner' })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
