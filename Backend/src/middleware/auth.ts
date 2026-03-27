import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import type { Session } from '../types'

export interface AuthRequest extends Request {
  session?: Session
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    req.session = jwt.verify(token, config.jwtSecret) as Session
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/** ตรวจว่า token ถูกต้อง และ shopCode ตรงกับ :shopCode ใน URL */
export function requireShopAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.session?.shopCode !== req.params.shopCode) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  })
}

/** manager หรือ owner */
export function requireManager(req: AuthRequest, res: Response, next: NextFunction): void {
  requireShopAuth(req, res, () => {
    if (req.session?.role !== 'manager' && req.session?.role !== 'owner') {
      res.status(403).json({ error: 'Manager access required' })
      return
    }
    next()
  })
}

/** เฉพาะ owner เท่านั้น */
export function requireOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  requireShopAuth(req, res, () => {
    if (req.session?.role !== 'owner') {
      res.status(403).json({ error: 'Owner access required' })
      return
    }
    next()
  })
}
