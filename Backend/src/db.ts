/**
 * Database layer — wraps Google Sheets
 * Interface เหมือนกับ Frontend's lib/data.ts
 */

import { getSheetData, setSheetData } from './sheets'
import type {
  Employee,
  WeekSchedule,
  TimeRecord,
  DeliveryTrip,
  DeliveryPlatform,
  RevenueEntry,
  ExpenseEntry,
  DailyNote,
  StoredShop,
} from './types'

const DEFAULT_PLATFORMS: DeliveryPlatform[] = [
  { id: 'local_for_you', name: 'Local for you' },
  { id: 'uber_eats', name: 'Uber Eats' },
  { id: 'doordash', name: 'Doordash' },
]

// ─── Shops ────────────────────────────────────────────────────────────────────

const SHOPS_HEADERS = ['code', 'name', 'restaurantPassword', 'ownerPassword']

export async function listShops(): Promise<StoredShop[]> {
  const rows = await getSheetData('shops')
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    restaurantPassword: r.restaurantPassword,
    ownerPassword: r.ownerPassword,
  }))
}

export async function saveShops(shops: StoredShop[]): Promise<void> {
  const rows = shops.map((s) => [s.code, s.name, s.restaurantPassword, s.ownerPassword])
  await setSheetData('shops', SHOPS_HEADERS, rows)
}

// ─── Employees ────────────────────────────────────────────────────────────────

const EMP_HEADERS = ['id', 'name', 'position', 'dailyWage', 'defaultDays']

export async function listEmployees(shopCode: string): Promise<Employee[]> {
  const rows = await getSheetData(`${shopCode}_employees`)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position as Employee['position'],
    dailyWage: Number(r.dailyWage),
    defaultDays: JSON.parse(r.defaultDays || '[]') as boolean[],
  }))
}

export async function saveEmployees(shopCode: string, employees: Employee[]): Promise<void> {
  const rows = employees.map((e) => [
    e.id,
    e.name,
    e.position,
    e.dailyWage,
    JSON.stringify(e.defaultDays),
  ])
  await setSheetData(`${shopCode}_employees`, EMP_HEADERS, rows)
}

// ─── Schedules ────────────────────────────────────────────────────────────────

const SCHED_HEADERS = ['weekStart', 'entries']

export async function listSchedules(shopCode: string): Promise<WeekSchedule[]> {
  const rows = await getSheetData(`${shopCode}_schedules`)
  return rows.map((r) => ({
    weekStart: r.weekStart,
    entries: JSON.parse(r.entries || '[]') as WeekSchedule['entries'],
  }))
}

export async function saveSchedules(shopCode: string, schedules: WeekSchedule[]): Promise<void> {
  const rows = schedules.map((s) => [s.weekStart, JSON.stringify(s.entries)])
  await setSheetData(`${shopCode}_schedules`, SCHED_HEADERS, rows)
}

// ─── Time Records ─────────────────────────────────────────────────────────────

const TR_HEADERS = ['date', 'employeeId', 'attended', 'extra']

export async function listTimeRecords(shopCode: string): Promise<TimeRecord[]> {
  const rows = await getSheetData(`${shopCode}_time_records`)
  return rows.map((r) => ({
    date: r.date,
    employeeId: r.employeeId,
    attended: r.attended === 'true',
    extra: Number(r.extra),
  }))
}

export async function saveTimeRecords(shopCode: string, records: TimeRecord[]): Promise<void> {
  const rows = records.map((r) => [r.date, r.employeeId, r.attended, r.extra])
  await setSheetData(`${shopCode}_time_records`, TR_HEADERS, rows)
}

// ─── Delivery Trips ───────────────────────────────────────────────────────────

const DT_HEADERS = ['id', 'date', 'employeeId', 'distance', 'fee']

export async function listDeliveryTrips(shopCode: string): Promise<DeliveryTrip[]> {
  const rows = await getSheetData(`${shopCode}_delivery_trips`)
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    employeeId: r.employeeId,
    distance: Number(r.distance),
    fee: Number(r.fee),
  }))
}

export async function saveDeliveryTrips(shopCode: string, trips: DeliveryTrip[]): Promise<void> {
  const rows = trips.map((t) => [t.id, t.date, t.employeeId, t.distance, t.fee])
  await setSheetData(`${shopCode}_delivery_trips`, DT_HEADERS, rows)
}

// ─── Platforms ────────────────────────────────────────────────────────────────

const PLT_HEADERS = ['id', 'name']

export async function listPlatforms(shopCode: string): Promise<DeliveryPlatform[]> {
  const rows = await getSheetData(`${shopCode}_platforms`)
  if (rows.length === 0) return DEFAULT_PLATFORMS
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

export async function savePlatforms(
  shopCode: string,
  platforms: DeliveryPlatform[],
): Promise<void> {
  const rows = platforms.map((p) => [p.id, p.name])
  await setSheetData(`${shopCode}_platforms`, PLT_HEADERS, rows)
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

const REV_HEADERS = ['id', 'date', 'name', 'netSales', 'paidOnline', 'card', 'cash', 'platforms']

export async function listRevenue(shopCode: string): Promise<RevenueEntry[]> {
  const rows = await getSheetData(`${shopCode}_revenue`)
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    name: r.name,
    netSales: Number(r.netSales),
    paidOnline: Number(r.paidOnline),
    card: Number(r.card),
    cash: Number(r.cash),
    platforms: JSON.parse(r.platforms || '{}') as Record<string, number>,
  }))
}

export async function saveRevenue(shopCode: string, entries: RevenueEntry[]): Promise<void> {
  const rows = entries.map((e) => [
    e.id,
    e.date,
    e.name,
    e.netSales,
    e.paidOnline,
    e.card,
    e.cash,
    JSON.stringify(e.platforms),
  ])
  await setSheetData(`${shopCode}_revenue`, REV_HEADERS, rows)
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

const EXP_HEADERS = [
  'id',
  'date',
  'category',
  'supplier',
  'description',
  'total',
  'paymentMethod',
  'bankAccount',
  'dueDate',
  'paid',
]

export async function listExpenses(shopCode: string): Promise<ExpenseEntry[]> {
  const rows = await getSheetData(`${shopCode}_expenses`)
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    category: r.category,
    supplier: r.supplier,
    description: r.description,
    total: Number(r.total),
    paymentMethod: r.paymentMethod as ExpenseEntry['paymentMethod'],
    bankAccount: r.bankAccount || undefined,
    dueDate: r.dueDate || undefined,
    paid: r.paid === 'true',
  }))
}

export async function saveExpenses(shopCode: string, entries: ExpenseEntry[]): Promise<void> {
  const rows = entries.map((e) => [
    e.id,
    e.date,
    e.category,
    e.supplier,
    e.description,
    e.total,
    e.paymentMethod,
    e.bankAccount ?? '',
    e.dueDate ?? '',
    e.paid,
  ])
  await setSheetData(`${shopCode}_expenses`, EXP_HEADERS, rows)
}

// ─── Notes ────────────────────────────────────────────────────────────────────

const NOTES_HEADERS = ['date', 'note']

export async function listNotes(shopCode: string): Promise<DailyNote[]> {
  const rows = await getSheetData(`${shopCode}_notes`)
  return rows.map((r) => ({ date: r.date, note: r.note }))
}

export async function saveNotes(shopCode: string, notes: DailyNote[]): Promise<void> {
  const rows = notes.map((n) => [n.date, n.note])
  await setSheetData(`${shopCode}_notes`, NOTES_HEADERS, rows)
}
