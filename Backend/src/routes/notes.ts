import { Router, Response } from 'express'
import { listNotes, saveNotes } from '../db'
import { requireShopAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router({ mergeParams: true })

// GET /:shopCode/notes
router.get('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listNotes(req.params.shopCode))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /:shopCode/notes — upsert or delete daily note
router.post('/', requireShopAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { date, note } = req.body as { date: string; note: string }
    const all = await listNotes(req.params.shopCode)
    const idx = all.findIndex((n) => n.date === date)

    if (!note?.trim()) {
      await saveNotes(req.params.shopCode, all.filter((n) => n.date !== date))
    } else if (idx >= 0) {
      all[idx] = { date, note: note.trim() }
      await saveNotes(req.params.shopCode, all)
    } else {
      await saveNotes(req.params.shopCode, [...all, { date, note: note.trim() }])
    }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
