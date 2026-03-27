/**
 * Database layer — wraps Google Sheets
 */

import { getSheetData, setSheetData, applyRowColors } from './sheets'
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
  DeliveryRate,
} from './types'
import { config } from './config'

const DEFAULT_PLATFORMS: DeliveryPlatform[] = [
  { id: 'local_for_you', name: 'Local for you' },
  { id: 'uber_eats', name: 'Uber Eats' },
  { id: 'doordash', name: 'Doordash' },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function getMondayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  return addDays(dateStr, diff)
}

// ─── Per-shop spreadsheet routing ─────────────────────────────────────────────

const shopSpreadsheetCache = new Map<string, { sid: string; tab: (name: string) => string }>()

async function getShopDb(shopCode: string) {
  if (shopSpreadsheetCache.has(shopCode)) return shopSpreadsheetCache.get(shopCode)!
  const shops = await listShops()
  const shop = shops.find((s) => s.code === shopCode)
  if (shop?.spreadsheetId) {
    const result = { sid: shop.spreadsheetId, tab: (name: string) => name }
    shopSpreadsheetCache.set(shopCode, result)
    return result
  }
  const result = { sid: config.spreadsheetId, tab: (name: string) => `${shopCode}_${name}` }
  shopSpreadsheetCache.set(shopCode, result)
  return result
}

export function invalidateShopCache(shopCode: string) {
  shopSpreadsheetCache.delete(shopCode)
}

// ─── Shops ────────────────────────────────────────────────────────────────────

const SHOPS_HEADERS = ['code', 'name', 'restaurantPassword', 'managerPassword', 'ownerPassword', 'spreadsheetId']

export async function listShops(): Promise<StoredShop[]> {
  const rows = await getSheetData('shops')
  return rows.map((r) => {
    // Backward compat: old sheet had ownerPassword=manager, superPassword=owner
    // New sheet has managerPassword=manager, ownerPassword=owner
    const managerPassword = r.managerPassword || r.ownerPassword || ''
    const ownerPassword = r.managerPassword
      ? (r.ownerPassword || undefined)   // new format
      : (r.superPassword || undefined)   // old format
    return {
      code: r.code,
      name: r.name,
      restaurantPassword: r.restaurantPassword,
      managerPassword,
      ownerPassword,
      spreadsheetId: r.spreadsheetId || undefined,
    }
  })
}

export async function saveShops(shops: StoredShop[]): Promise<void> {
  const rows = shops.map((s) => [s.code, s.name, s.restaurantPassword, s.managerPassword, s.ownerPassword ?? '', s.spreadsheetId ?? ''])
  await setSheetData('shops', SHOPS_HEADERS, rows)
}

// ─── Employees ────────────────────────────────────────────────────────────────

const EMP_HEADERS = ['id', 'employeeId', 'positions', 'name', 'phone', 'defaultDays']

export async function listEmployees(shopCode: string): Promise<Employee[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('employees'), sid)
  return rows
    .map((r) => {
      let positions: Employee['positions']
      const raw = r.positions || r.position || 'Front'
      try {
        const parsed = JSON.parse(raw)
        positions = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        positions = [raw as Employee['positions'][number]]
      }
      return {
        id: r.id,
        name: r.name,
        positions,
        phone: r.phone || undefined,
        dailyWage: r.dailyWage ? Number(r.dailyWage) : undefined,
        defaultDays: JSON.parse(r.defaultDays || '[]') as boolean[],
      }
    })
    .sort((a, b) => {
      const key = (p: Employee['positions']) => {
        if (p.includes('Manager')) return 0
        if (p.length > 1) return 1
        if (p.includes('Front')) return 2
        if (p.includes('Back')) return 3
        if (p.includes('Home')) return 4
        return 5
      }
      const diff = key(a.positions) - key(b.positions)
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'th')
    })
}

export async function saveEmployees(shopCode: string, employees: Employee[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const sorted = [...employees].sort((a, b) => {
    const key = (p: Employee['positions']) => {
      if (p.includes('Manager')) return 0
      if (p.length > 1) return 1
      if (p.includes('Front')) return 2
      if (p.includes('Back')) return 3
      if (p.includes('Home')) return 4
      return 5
    }
    const diff = key(a.positions) - key(b.positions)
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'th')
  })
  const rows = sorted.map((e) => [
    e.id,
    e.id,
    JSON.stringify(e.positions),
    e.name,
    e.phone ?? '',
    JSON.stringify(e.defaultDays),
  ])
  await setSheetData(tab('employees'), EMP_HEADERS, rows, sid)

  // Auto-sync to master Employees tab
  try {
    const existing = await getSheetData('Employees')
    const otherRows = existing
      .filter((r) => r.shopCode !== shopCode)
      .map((r) => [r.shopCode, r.id, r.employeeId, r.positions, r.name, r.phone ?? '', r.defaultDays])
    const newRows = sorted.map((e) => [
      shopCode, e.id, e.id, JSON.stringify(e.positions), e.name, e.phone ?? '', JSON.stringify(e.defaultDays),
    ])
    await setSheetData('Employees', MASTER_EMP_HEADERS, [...otherRows, ...newRows])
  } catch (err) {
    console.error('[saveEmployees] master sync failed:', err)
  }
}

// ─── Schedules ────────────────────────────────────────────────────────────────
// Pivot format: 1 row = 1 date + 1 shift
// Columns: date, weekday, shift, front, back, home, total_front, total_back, total

const SCHED_HEADERS = ['date', 'weekday', 'shift', 'front', 'back', 'home', 'total_front', 'total_back', 'total_home', 'total']
const WEEKDAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] // indexed by getUTCDay()

// Convert old weekStart/entries format → pivot rows
function weekScheduleToPivotRows(ws: WeekSchedule, employees: Employee[]): string[][] {
  const rows: string[][] = []
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const date = addDays(ws.weekStart, dayIdx)
    const weekday = WEEKDAY_NAMES[new Date(date + 'T00:00:00Z').getUTCDay()]
    for (let shift = 0; shift < 2; shift++) {
      const slotIdx = dayIdx * 2 + shift
      const shiftLabel = shift === 0 ? 'morning' : 'evening'
      const scheduled = ws.entries
        .filter((e) => e.days[slotIdx])
        .map((e) => {
          const emp = employees.find((emp) => emp.id === e.employeeId)
          const pos = e.days[slotIdx] as string
          return emp ? { emp, pos } : null
        })
        .filter(Boolean) as { emp: Employee; pos: string }[]
      const front = scheduled.filter((s) => s.pos === 'Front').map((s) => s.emp.name).join(', ')
      const back = scheduled.filter((s) => s.pos === 'Back').map((s) => s.emp.name).join(', ')
      const home = scheduled.filter((s) => s.pos === 'Home').map((s) => s.emp.name).join(', ')
      const totalFront = scheduled.filter((s) => s.pos === 'Front').length
      const totalBack = scheduled.filter((s) => s.pos === 'Back').length
      const totalHome = scheduled.filter((s) => s.pos === 'Home').length
      const total = scheduled.length
      // Skip empty rows (no one scheduled)
      if (total === 0) continue
      rows.push([date, weekday, shiftLabel, front, back, home, String(totalFront), String(totalBack), String(totalHome), String(total)])
    }
  }
  return rows
}

// Convert pivot rows → WeekSchedule (re-construct entries from names)
function pivotRowsToWeekSchedules(rows: Record<string, string>[], employees: Employee[]): WeekSchedule[] {
  const weekMap = new Map<string, WeekSchedule>()

  for (const r of rows) {
    const date = r.date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const weekStart = getMondayStr(date)
    const dayIdx = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7 // Mon=0..Sun=6
    const isEvening = r.shift === 'evening'
    const slotIdx = dayIdx * 2 + (isEvening ? 1 : 0)

    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, {
        weekStart,
        entries: employees.map((e) => ({ employeeId: e.id, days: Array(14).fill(null) })),
      })
    }
    const ws = weekMap.get(weekStart)!

    // Mark employees with their position for this slot
    const posCols: { pos: string; names: string[] }[] = [
      { pos: 'Front', names: (r.front ?? '').split(',').map((n) => n.trim()).filter(Boolean) },
      { pos: 'Back',  names: (r.back  ?? '').split(',').map((n) => n.trim()).filter(Boolean) },
      { pos: 'Home',  names: (r.home  ?? '').split(',').map((n) => n.trim()).filter(Boolean) },
    ]
    for (const entry of ws.entries) {
      const emp = employees.find((e) => e.id === entry.employeeId)
      if (!emp) continue
      for (const { pos, names } of posCols) {
        if (names.includes(emp.name)) {
          entry.days[slotIdx] = pos
          break
        }
      }
    }
  }

  return Array.from(weekMap.values())
}

export async function listSchedules(shopCode: string): Promise<WeekSchedule[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const employees = await listEmployees(shopCode)
  const rows = await getSheetData(tab('schedules'), sid)

  // Detect format: if first row has 'weekStart' column → old format; 'date' → new pivot
  if (rows.length === 0) return []
  if (rows[0].weekStart !== undefined && rows[0].date === undefined) {
    // Old format — convert on the fly
    return rows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.weekStart))
      .map((r) => {
        try {
          const raw = JSON.parse(r.entries || '[]') as { employeeId: string; days: (boolean | string | null)[] }[]
          const entries = raw.map((e) => {
            // Convert boolean days to null (can't know which position from old format)
            const days = e.days.map((d) => (typeof d === 'string' ? d : null))
            return { employeeId: e.employeeId, days }
          })
          return { weekStart: r.weekStart, entries }
        } catch {
          return { weekStart: r.weekStart, entries: [] }
        }
      })
  }
  // New pivot format
  return pivotRowsToWeekSchedules(rows, employees)
}

const SHIFT_YELLOW = { red: 1,    green: 0.88, blue: 0.4  } // Morning
const SHIFT_BLUE   = { red: 0.67, green: 0.84, blue: 0.97 } // Evening

export async function saveSchedules(shopCode: string, schedules: WeekSchedule[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const employees = await listEmployees(shopCode)
  // Deduplicate by (date, shift) — last WeekSchedule processed wins (newer overwrites older)
  const pivotMap = new Map<string, string[]>()
  for (const ws of schedules) {
    for (const row of weekScheduleToPivotRows(ws, employees)) {
      pivotMap.set(`${row[0]}|${row[2]}`, row)
    }
  }
  const sorted = Array.from(pivotMap.values()).sort((a, b) =>
    a[0] !== b[0] ? a[0].localeCompare(b[0]) : a[2].localeCompare(b[2]),
  )

  const rows: string[][] = []
  for (let i = 0; i < sorted.length; i++) {
    rows.push(sorted[i])
    // Insert 2 separator rows after SUN (last day of Mon–Sun week)
    if (sorted[i][1] === 'SUN' && sorted[i + 1]?.[1] !== 'SUN') {
      rows.push(Array(SCHED_HEADERS.length).fill(''))
      rows.push(Array(SCHED_HEADERS.length).fill(''))
    }
  }
  await setSheetData(tab('schedules'), SCHED_HEADERS, rows, sid)

  // Color column C (shift) and column J (total) per shift — skip separator rows
  const colorRules = rows.flatMap((row, i) => {
    if (!row[2]) return []
    const color = row[2] === 'morning' ? SHIFT_YELLOW : SHIFT_BLUE
    return [
      { rowIndex: i + 1, colStart: 2, colEnd: 3, color },
      { rowIndex: i + 1, colStart: 9, colEnd: 10, color },
    ]
  })
  if (colorRules.length > 0) {
    await applyRowColors(tab('schedules'), sid, colorRules, rows.length)
  }
}

// ─── Time Records ─────────────────────────────────────────────────────────────
// Stored in separate tabs: front_time_records, back_time_records
// Format: date, employeeId, name, morning, evening, total

const TR_HEADERS = ['date', 'employeeId', 'name', 'morning', 'evening', 'total']

async function readTimeRecordsTab(tabName: string, sid: string): Promise<TimeRecord[]> {
  try {
    const rows = await getSheetData(tabName, sid)
    return rows
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .map((r) => ({
        date: r.date,
        employeeId: r.employeeId,
        morning: Number(r.morning) || 0,
        evening: Number(r.evening) || 0,
      }))
  } catch {
    return []
  }
}

async function writeTimeRecordsTab(
  tabName: string,
  sid: string,
  records: TimeRecord[],
  employees: Employee[],
): Promise<void> {
  const rows = records
    .filter((r) => r.morning > 0 || r.evening > 0)
    .map((r) => {
      const emp = employees.find((e) => e.id === r.employeeId)
      const name = emp?.name ?? ''
      const total = r.morning + r.evening
      return [r.date, r.employeeId, name, String(r.morning), String(r.evening), String(total)]
    })
  await setSheetData(tabName, TR_HEADERS, rows, sid)
}

export async function listTimeRecords(shopCode: string): Promise<TimeRecord[]> {
  const { sid, tab } = await getShopDb(shopCode)
  // Also try old single tab for backward compatibility
  const [front, back, old] = await Promise.all([
    readTimeRecordsTab(tab('front_time_records'), sid),
    readTimeRecordsTab(tab('back_time_records'), sid),
    readTimeRecordsTab(tab('time_records'), sid),
  ])
  // Merge: new tabs take priority, old tab fills in missing
  const merged = [...front, ...back]
  const mergedKeys = new Set(merged.map((r) => `${r.date}|${r.employeeId}`))
  for (const r of old) {
    if (!mergedKeys.has(`${r.date}|${r.employeeId}`)) merged.push(r)
  }
  return merged
}

export async function saveTimeRecords(shopCode: string, records: TimeRecord[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const employees = await listEmployees(shopCode)
  const frontEmpIds = new Set(employees.filter((e) => e.positions.includes('Front')).map((e) => e.id))
  const backEmpIds = new Set(employees.filter((e) => e.positions.includes('Back')).map((e) => e.id))
  const frontRecords = records.filter((r) => frontEmpIds.has(r.employeeId))
  const backRecords = records.filter((r) => backEmpIds.has(r.employeeId))
  // Sequential writes to avoid Google Sheets tab-creation conflict
  await writeTimeRecordsTab(tab('front_time_records'), sid, frontRecords, employees)
  await writeTimeRecordsTab(tab('back_time_records'), sid, backRecords, employees)
}

// ─── Delivery Trips ───────────────────────────────────────────────────────────

const DT_HEADERS = ['id', 'date', 'employeeId', 'employeeName', 'distance', 'fee', 'shift']

export async function listDeliveryTrips(shopCode: string): Promise<DeliveryTrip[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('delivery_trips'), sid)

  const trips: DeliveryTrip[] = []
  let groupFirstTrip: DeliveryTrip | null = null

  for (const r of rows) {
    if (r.id && r.employeeId !== 'Delivery Fee' && r.employeeId !== 'Cash on Delivery') {
      // Trip data row
      const trip: DeliveryTrip = {
        id: r.id,
        date: r.date,
        employeeId: r.employeeId,
        employeeName: r.employeeName ?? '',
        distance: Number(r.distance),
        fee: Number(r.fee),
      }
      trips.push(trip)
      // Track first trip of each employee group
      if (!groupFirstTrip || groupFirstTrip.employeeId !== r.employeeId) {
        groupFirstTrip = trip
      }
    } else if (!r.id && r.employeeId === 'Cash on Delivery') {
      // Read COD from summary row (stored in employeeName column) → attach to first trip
      const cod = Number(r.employeeName) || 0
      if (cod > 0 && groupFirstTrip) groupFirstTrip.cod = cod
      groupFirstTrip = null
    }
  }

  return trips
}

export async function saveDeliveryTrips(shopCode: string, trips: DeliveryTrip[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const [deliveryFee, employees] = await Promise.all([
    getDeliveryFee(shopCode),
    listEmployees(shopCode),
  ])

  // Group trips by date + employeeId to append summary rows per employee per day
  const groups = new Map<string, DeliveryTrip[]>()
  for (const trip of trips) {
    const key = `${trip.date}|${trip.employeeId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(trip)
  }

  const rows: (string | number)[][] = []
  // rowIndex 0 = header → data starts at 1
  let rowIndex = 1
  const colorRules: Array<{ rowIndex: number; color: { red: number; green: number; blue: number } | null; colStart?: number; colEnd?: number }> = []

  const GREEN  = { red: 0.83, green: 0.92, blue: 0.78 } // Delivery Fee
  const YELLOW = { red: 1, green: 0.95, blue: 0.8 }    // Cash on Delivery Morning
  const BLUE   = { red: 0.8, green: 0.9, blue: 1 }     // Cash on Delivery Evening

  let firstGroup = true
  for (const empTrips of groups.values()) {
    const { employeeId } = empTrips[0]
    const totalFee = empTrips.reduce((s, t) => s + t.fee, 0)
    const cod = empTrips.reduce((s, t) => s + (t.cod ?? 0), 0)
    const wage = totalFee + deliveryFee

    const emp = employees.find((e) => e.id === employeeId)
    const shift = emp?.defaultDays[0] ? 'Morning' : emp?.defaultDays[1] ? 'Evening' : ''

    // Empty separator between groups (not before the first)
    if (!firstGroup) {
      rows.push(['', '', '', '', '', '', ''])
      rowIndex++
    }
    firstGroup = false

    // Data rows
    for (const t of empTrips) {
      rows.push([t.id, t.date, t.employeeId, t.employeeName ?? '', t.distance, t.fee, ''])
      rowIndex++
    }
    // Summary rows
    rows.push(['', '', 'Delivery Fee', deliveryFee, 'TOTAL', totalFee, ''])
    colorRules.push({ rowIndex, color: GREEN, colStart: 2, colEnd: 7 })
    rowIndex++

    rows.push(['', '', 'Cash on Delivery', cod > 0 ? cod : '', 'WAGE', wage, shift])
    colorRules.push({ rowIndex, color: shift === 'Evening' ? BLUE : YELLOW, colStart: 2, colEnd: 7 })
    rowIndex++
  }

  await setSheetData(tab('delivery_trips'), DT_HEADERS, rows, sid)
  if (colorRules.length > 0) {
    await applyRowColors(tab('delivery_trips'), sid, colorRules, rows.length)
  }
}

// ─── Platforms ────────────────────────────────────────────────────────────────

const PLT_HEADERS = ['id', 'name']

export async function listPlatforms(shopCode: string): Promise<DeliveryPlatform[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('platforms'), sid)
  if (rows.length === 0) return DEFAULT_PLATFORMS
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

export async function savePlatforms(shopCode: string, platforms: DeliveryPlatform[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = platforms.map((p) => [p.id, p.name])
  await setSheetData(tab('platforms'), PLT_HEADERS, rows, sid)
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

const REV_HEADERS = ['id', 'date', 'name', 'netSales', 'paidOnline', 'card', 'cash', 'platforms', 'note']

export async function listRevenue(shopCode: string): Promise<RevenueEntry[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('revenue'), sid)
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    name: r.name,
    netSales: Number(r.netSales),
    paidOnline: Number(r.paidOnline),
    card: Number(r.card),
    cash: Number(r.cash),
    platforms: JSON.parse(r.platforms || '{}') as Record<string, number>,
    note: r.note || undefined,
  }))
}

export async function saveRevenue(shopCode: string, entries: RevenueEntry[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = entries.map((e) => [
    e.id, e.date, e.name, e.netSales, e.paidOnline, e.card, e.cash, JSON.stringify(e.platforms), e.note ?? '',
  ])
  await setSheetData(tab('revenue'), REV_HEADERS, rows, sid)
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

const EXP_HEADERS = [
  'id', 'date', 'category', 'supplier', 'description', 'total',
  'paymentMethod', 'bankAccount', 'dueDate', 'paid',
]

export async function listExpenses(shopCode: string): Promise<ExpenseEntry[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('expenses'), sid)
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
  const { sid, tab } = await getShopDb(shopCode)
  const rows = entries.map((e) => [
    e.id, e.date, e.category, e.supplier, e.description, e.total,
    e.paymentMethod, e.bankAccount ?? '', e.dueDate ?? '', e.paid,
  ])
  await setSheetData(tab('expenses'), EXP_HEADERS, rows, sid)
}

// ─── Delivery Rates (Shop Config) ─────────────────────────────────────────────

const DEFAULT_DELIVERY_RATES: DeliveryRate[] = [
  { maxKm: 3, fee: 3.50 },
  { maxKm: 5, fee: 4.50 },
  { maxKm: 6, fee: 5.00 },
  { maxKm: 7, fee: 6.00 },
  { maxKm: 8, fee: 7.00 },
  { maxKm: 9999, fee: 8.00 },
]

const CONFIG_HEADERS = ['key', 'value']

async function getConfigRows(shopCode: string): Promise<Array<Record<string, string>>> {
  const { sid, tab } = await getShopDb(shopCode)
  try {
    return await getSheetData(tab('config'), sid)
  } catch {
    return []
  }
}

async function saveConfigRows(shopCode: string, rows: Array<[string, string]>): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  await setSheetData(tab('config'), CONFIG_HEADERS, rows, sid)
}

export async function listDeliveryRates(shopCode: string): Promise<DeliveryRate[]> {
  try {
    const rows = await getConfigRows(shopCode)
    const row = rows.find((r) => r.key === 'delivery_rates')
    if (!row) return DEFAULT_DELIVERY_RATES
    return JSON.parse(row.value) as DeliveryRate[]
  } catch {
    return DEFAULT_DELIVERY_RATES
  }
}

export async function saveDeliveryRates(shopCode: string, rates: DeliveryRate[]): Promise<void> {
  const existing = await getConfigRows(shopCode)
  const kept = existing.filter((r) => r.key !== 'delivery_rates').map((r): [string, string] => [r.key, r.value])
  kept.push(['delivery_rates', JSON.stringify(rates)])
  await saveConfigRows(shopCode, kept)
}

export async function getDeliveryFee(shopCode: string): Promise<number> {
  try {
    const rows = await getConfigRows(shopCode)
    const row = rows.find((r) => r.key === 'delivery_fee')
    if (!row) return 0
    return Number(row.value) || 0
  } catch {
    return 0
  }
}

export async function saveDeliveryFee(shopCode: string, fee: number): Promise<void> {
  const existing = await getConfigRows(shopCode)
  const kept = existing.filter((r) => r.key !== 'delivery_fee').map((r): [string, string] => [r.key, r.value])
  kept.push(['delivery_fee', String(fee)])
  await saveConfigRows(shopCode, kept)
}

// ─── Migration ────────────────────────────────────────────────────────────────

/** ย้ายข้อมูลร้านจาก master sheet ไปยัง spreadsheet ของตัวเอง */
export async function migrateShopToOwnSpreadsheet(shopCode: string, newSpreadsheetId: string): Promise<void> {
  // Read all data from master (old prefix-based tabs)
  const oldTab = (name: string) => `${shopCode}_${name}`
  const sid = config.spreadsheetId

  const tabNames = [
    'employees', 'schedules', 'front_time_records', 'back_time_records', 'time_records',
    'delivery_trips', 'platforms', 'revenue', 'expenses', 'notes', 'config',
  ]

  for (const tabName of tabNames) {
    try {
      const rows = await getSheetData(oldTab(tabName), sid)
      if (rows.length === 0) continue
      const headers = Object.keys(rows[0])
      const data = rows.map((r) => headers.map((h) => r[h] ?? ''))
      await setSheetData(tabName, headers, data, newSpreadsheetId)
    } catch {
      // Tab might not exist — skip
    }
  }

  // Update shop record with new spreadsheetId
  const shops = await listShops()
  const idx = shops.findIndex((s) => s.code === shopCode)
  if (idx >= 0) {
    shops[idx] = { ...shops[idx], spreadsheetId: newSpreadsheetId }
    await saveShops(shops)
  }

  // Refresh cache
  invalidateShopCache(shopCode)
}

// ─── Notes ────────────────────────────────────────────────────────────────────

const NOTES_HEADERS = ['date', 'note']

export async function listNotes(shopCode: string): Promise<DailyNote[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('notes'), sid)
  return rows.map((r) => ({ date: r.date, note: r.note }))
}

export async function saveNotes(shopCode: string, notes: DailyNote[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = notes.map((n) => [n.date, n.note])
  await setSheetData(tab('notes'), NOTES_HEADERS, rows, sid)
}

// ─── Audit / Edit Log ─────────────────────────────────────────────────────────

const AUDIT_HEADERS = ['date', 'time', 'editorName', 'employeeName', 'shift', 'changes', 'note']

export async function appendAuditLog(
  shopCode: string,
  entry: { editorName: string; note: string; employeeName: string; shift: string; changes: string },
): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const existing = await getSheetData(tab('edit_log'), sid)
  const rows = existing.map((r) => [r.date, r.time, r.editorName, r.employeeName, r.shift, r.changes ?? '', r.note ?? ''])
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = now.toTimeString().split(' ')[0]
  rows.push([date, time, entry.editorName, entry.employeeName, entry.shift, entry.changes, entry.note])
  await setSheetData(tab('edit_log'), AUDIT_HEADERS, rows, sid)
}

// ─── Master Employee Sync ──────────────────────────────────────────────────────

const MASTER_EMP_HEADERS = ['shopCode', 'id', 'employeeId', 'positions', 'name', 'phone', 'defaultDays']

/** รวม employee ทุกสาขาลง Employees tab ใน master spreadsheet */
export async function syncAllEmployeesToMaster(): Promise<void> {
  const shops = await listShops()
  const allRows: string[][] = []
  for (const shop of shops) {
    const emps = await listEmployees(shop.code)
    for (const e of emps) {
      allRows.push([
        shop.code,
        e.id,
        e.id,
        JSON.stringify(e.positions),
        e.name,
        e.phone ?? '',
        JSON.stringify(e.defaultDays),
      ])
    }
  }
  await setSheetData('Employees', MASTER_EMP_HEADERS, allRows)
}
