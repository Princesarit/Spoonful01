import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { config } from './config'
import { registerSseClient, unregisterSseClient, tryAcquireShopLock, releaseShopLock } from './lockState'
import authRoutes from './routes/auth'
import shopRoutes from './routes/shops'
import employeeRoutes from './routes/employees'
import scheduleRoutes from './routes/schedules'
import timeRecordRoutes from './routes/timeRecords'
import revenueRoutes from './routes/revenue'
import expenseRoutes from './routes/expenses'
import summaryRoutes from './routes/summary'
import noteRoutes from './routes/notes'
import configRoutes from './routes/config'
import sheetSyncRoutes from './routes/sheetSync'
import wageRoutes from './routes/wages'
import cashReportRoutes from './routes/cashReport'
import closedDatesRoutes from './routes/closedDates'

const app = express()

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Strict limit on login/elevate to prevent brute-force password guessing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
})

const elevateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายาม elevate มากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
})

// General limiter — protects all other endpoints from bulk automated requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.method === 'GET',  // GET requests are read-only, no strict limit needed
})

app.use(cors())
app.use(express.json())
app.use(generalLimiter)

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }))

// ── Lock status SSE — browser subscribes to get real-time sync/save lock state ──
app.get('/lock-status', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  registerSseClient(res)
  req.on('close', () => unregisterSseClient(res))
})

// ── Shop-level write lock — prevents concurrent saves within the same shop ───
// Applies to all POST/PUT/DELETE/PATCH under /:shopCode/* except /:shopCode/sheets/*
const SYSTEM_PREFIXES = new Set(['auth', 'shops', 'health', 'lock-status'])
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next()
  const parts = req.path.split('/')          // ['', 'SEED', 'employees', ...]
  const shopCode = parts[1]
  const subpath  = parts[2]
  if (!shopCode || SYSTEM_PREFIXES.has(shopCode)) return next()
  if (subpath === 'sheets') return next()    // sync route manages its own lock
  if (!tryAcquireShopLock(shopCode)) {
    res.status(409).json({ error: 'busy', message: 'กำลังบันทึกอยู่ กรุณารอสักครู่' })
    return
  }
  res.on('finish', () => releaseShopLock(shopCode))
  next()
})

// Routes
app.post('/auth/login', loginLimiter)
app.post('/auth/elevate', elevateLimiter)
app.use('/auth', authRoutes)
app.use('/shops', shopRoutes)
app.use('/:shopCode/employees', employeeRoutes)
app.use('/:shopCode/schedules', scheduleRoutes)
app.use('/:shopCode/time-records', timeRecordRoutes)
app.use('/:shopCode/revenue', revenueRoutes)
app.use('/:shopCode/expenses', expenseRoutes)
app.use('/:shopCode/summary', summaryRoutes)
app.use('/:shopCode/notes', noteRoutes)
app.use('/:shopCode/config', configRoutes)
app.use('/:shopCode/sheets', sheetSyncRoutes)
app.use('/:shopCode/wages', wageRoutes)
app.use('/:shopCode/cash-report', cashReportRoutes)
app.use('/:shopCode/closed-dates', closedDatesRoutes)

app.listen(config.port, () => {
  console.log(`Spoonful Backend running on http://localhost:${config.port}`)
})
