import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { config } from './config'
import authRoutes from './routes/auth'
import shopRoutes from './routes/shops'
import employeeRoutes from './routes/employees'
import scheduleRoutes from './routes/schedules'
import timeRecordRoutes from './routes/timeRecords'
import revenueRoutes from './routes/revenue'
import expenseRoutes from './routes/expenses'
import summaryRoutes from './routes/summary'
import noteRoutes from './routes/notes'

const app = express()

app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }))

// Routes
app.use('/auth', authRoutes)
app.use('/shops', shopRoutes)
app.use('/:shopCode/employees', employeeRoutes)
app.use('/:shopCode/schedules', scheduleRoutes)
app.use('/:shopCode/time-records', timeRecordRoutes)
app.use('/:shopCode/revenue', revenueRoutes)
app.use('/:shopCode/expenses', expenseRoutes)
app.use('/:shopCode/summary', summaryRoutes)
app.use('/:shopCode/notes', noteRoutes)

app.listen(config.port, () => {
  console.log(`Spoonful Backend running on http://localhost:${config.port}`)
})
