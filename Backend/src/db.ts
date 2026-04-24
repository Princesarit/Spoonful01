/**
 * Database layer — wraps Google Sheets
 */

import { getSheetData, getSheetDataRaw, setSheetData, setSheetDataRaw, applyRowColors, applyTimeRecordFormatting, setSheetDataUserEntered, applyFormattingRules, getSheetIdByName, batchUpdateSheet, clearSheetMerges, hideInternalSheets } from './sheets'
import type { SheetFormatRule } from './sheets'
import type {
  Employee,
  WeekSchedule,
  TimeRecord,
  DeliveryTrip,
  DeliveryPlatform,
  MealRevenue,
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

const EMP_HEADERS = ['id', 'employeeId', 'positions', 'name', 'phone', 'hourlyWage', 'wageLunch', 'wageDinner', 'deliveryFeePerTrip', 'defaultDays', 'fired']

export async function listEmployees(shopCode: string, includeAll = false): Promise<Employee[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('employees'), sid)
  const all = rows
    .map((r) => {
      let positions: Employee['positions']
      const raw = r.positions || r.position || 'Front'
      try {
        const parsed = JSON.parse(raw)
        const arr: string[] = Array.isArray(parsed) ? parsed : [parsed]
        // Backward compat: migrate old 'Back' → 'Kitchen'
        positions = arr.map((p) => p === 'Back' ? 'Kitchen' : p) as Employee['positions']
      } catch {
        const p = raw === 'Back' ? 'Kitchen' : raw
        positions = [p as Employee['positions'][number]]
      }
      return {
        id: r.id,
        name: r.name,
        positions,
        phone: r.phone || undefined,
        hourlyWage: r.hourlyWage ? Number(r.hourlyWage) : undefined,
        wageLunch: r.wageLunch ? Number(r.wageLunch) : undefined,
        wageDinner: r.wageDinner ? Number(r.wageDinner) : undefined,
        deliveryFeePerTrip: r.deliveryFeePerTrip ? Number(r.deliveryFeePerTrip) : undefined,
        defaultDays: JSON.parse(r.defaultDays || '[]') as boolean[],
        fired: r.fired === 'true' ? true : undefined,
      }
    })
    .filter((e) => includeAll || !e.fired)
    .sort((a, b) => {
      const key = (p: Employee['positions']) => {
        if (p.includes('Manager')) return 0
        if (p.length > 1) return 1
        if (p.includes('Front')) return 2
        if (p.includes('Kitchen')) return 3
        if (p.includes('Home')) return 4
        return 5
      }
      const diff = key(a.positions) - key(b.positions)
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'th')
    })
  // Deduplicate active employees by name (case-insensitive) — fired employees always kept
  const seen = new Set<string>()
  return all.filter((e) => {
    if (e.fired) return true  // always keep fired employees
    const key = e.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function saveEmployees(shopCode: string, employees: Employee[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  // Deduplicate active employees by name (case-insensitive) — fired employees always kept
  const seen = new Set<string>()
  const deduped = employees.filter((e) => {
    if (e.fired) return true  // always keep fired employees
    const key = e.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const sorted = [...deduped].sort((a, b) => {
    const key = (p: Employee['positions']) => {
      if (p.includes('Manager')) return 0
      if (p.length > 1) return 1
      if (p.includes('Front')) return 2
      if (p.includes('Kitchen')) return 3
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
    e.wageLunch != null ? e.wageLunch / 4 : (e.hourlyWage ?? ''),  // hourlyWage = wageLunch / 4
    e.wageLunch ?? '',
    e.wageDinner ?? '',
    e.deliveryFeePerTrip ?? '',
    JSON.stringify(e.defaultDays),
    e.fired ? 'true' : '',
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
      const front   = scheduled.filter((s) => s.pos === 'Front').map((s) => s.emp.name).join(', ')
      const kitchen = scheduled.filter((s) => s.pos === 'Kitchen').map((s) => s.emp.name).join(', ')
      const home    = scheduled.filter((s) => s.pos === 'Home').map((s) => s.emp.name).join(', ')
      const totalFront   = scheduled.filter((s) => s.pos === 'Front').length
      const totalKitchen = scheduled.filter((s) => s.pos === 'Kitchen').length
      const totalHome    = scheduled.filter((s) => s.pos === 'Home').length
      const total = scheduled.length
      // Skip empty rows (no one scheduled)
      if (total === 0) continue
      rows.push([date, weekday, shiftLabel, front, kitchen, home, String(totalFront), String(totalKitchen), String(totalHome), String(total)])
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
      { pos: 'Kitchen', names: (r.back ?? '').split(',').map((n) => n.trim()).filter(Boolean) },
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
            // Convert boolean days to null; migrate 'Back' → 'Kitchen'
            const days = e.days.map((d) => {
              if (typeof d !== 'string') return null
              return d === 'Back' ? 'Kitchen' : d
            })
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
// Stored in pivot format: weekly blocks, DATE row + NAME row + employee rows
// AM columns yellow, PM columns blue

const TR_DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

// Read pivot format (front_time_records / back_time_records)
async function readPivotTimeRecordsTab(
  tabName: string,
  sid: string,
  employees: Employee[],
): Promise<TimeRecord[]> {
  try {
    const raw = await getSheetDataRaw(tabName, sid)
    const records: TimeRecord[] = []
    let i = 0
    while (i < raw.length) {
      const row = raw[i]
      if (!row || row[0] !== 'DATE') { i++; continue }
      const dateRow = row
      const nameRow = raw[i + 1]
      if (!nameRow || nameRow[0] !== 'NAME') { i += 2; continue }
      // Extract 7 dates (each date appears twice: AM col, PM col)
      const dates: string[] = []
      for (let col = 1; col <= 14; col += 2) dates.push(dateRow[col] ?? '')
      i += 2
      // Employee rows until blank or next DATE block
      while (i < raw.length) {
        const empRow = raw[i]
        if (!empRow || !empRow[0] || empRow[0] === 'DATE') break
        const emp = employees.find((e) => e.name === empRow[0])
        if (emp) {
          for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const date = dates[dayIdx]
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
            const morning = Number(empRow[dayIdx * 2 + 1]) || 0
            const evening = Number(empRow[dayIdx * 2 + 2]) || 0
            if (morning > 0 || evening > 0) records.push({ date, employeeId: emp.id, morning, evening })
          }
        }
        i++
      }
    }
    return records
  } catch {
    return []
  }
}

// Read legacy flat format (time_records tab — backward compat only)
async function readFlatTimeRecordsTab(tabName: string, sid: string): Promise<TimeRecord[]> {
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
  const filtered = records.filter((r) => r.morning > 0 || r.evening > 0)

  // Group by week
  const weekMap = new Map<string, TimeRecord[]>()
  for (const r of filtered) {
    const monday = getWeekMonday(r.date)
    if (!weekMap.has(monday)) weekMap.set(monday, [])
    weekMap.get(monday)!.push(r)
  }
  const weeks = Array.from(weekMap.keys()).sort()

  const allRows: (string | number)[][] = []
  const nameRowIndices: number[] = []
  const empRowRanges: Array<{ start: number; end: number }> = []

  for (let wi = 0; wi < weeks.length; wi++) {
    const monday = weeks[wi]
    const weekRecords = weekMap.get(monday)!
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday + 'T00:00:00')
      d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })

    // DATE row: DATE | date0 | date0 | date1 | date1 | ... | TOTAL
    const dateRow: (string | number)[] = ['DATE']
    for (const date of dates) dateRow.push(date, date)
    dateRow.push('TOTAL')
    allRows.push(dateRow)

    // NAME row: NAME | MON_AM | MON_PM | ... | SUN_AM | SUN_PM | TOTAL
    const nameRow: string[] = ['NAME']
    for (const day of TR_DAY_NAMES) nameRow.push(`${day}_AM`, `${day}_PM`)
    nameRow.push('TOTAL')
    nameRowIndices.push(allRows.length)   // 0-indexed position in allRows
    allRows.push(nameRow)

    // Employee rows (sorted by name)
    const empIds = [...new Set(weekRecords.map((r) => r.employeeId))]
    empIds.sort((a, b) => {
      const na = employees.find((e) => e.id === a)?.name ?? a
      const nb = employees.find((e) => e.id === b)?.name ?? b
      return na.localeCompare(nb)
    })
    const empStart = allRows.length
    for (const empId of empIds) {
      const name = employees.find((e) => e.id === empId)?.name ?? empId
      const row: (string | number)[] = [name]
      let total = 0
      for (const date of dates) {
        const rec = weekRecords.find((r) => r.date === date && r.employeeId === empId)
        const m = rec?.morning ?? 0
        const e = rec?.evening ?? 0
        total += m + e
        row.push(m, e)
      }
      row.push(total)
      allRows.push(row)
    }
    if (allRows.length > empStart) empRowRanges.push({ start: empStart, end: allRows.length })

    // 3 blank rows between weeks
    if (wi < weeks.length - 1) allRows.push([], [], [])
  }

  // Write: clear then update
  await setSheetDataRaw(tabName, allRows, sid)

  // Apply formatting: clear stale colors, AM=yellow, PM=blue on NAME rows,
  // NUMBER format on employee data rows (prevents 0 displaying as date)
  await applyTimeRecordFormatting(tabName, sid, nameRowIndices, empRowRanges, allRows.length)
}

export async function listTimeRecords(shopCode: string): Promise<TimeRecord[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const employees = await listEmployees(shopCode)
  const [front, back, old] = await Promise.all([
    readPivotTimeRecordsTab(tab('front_time_records'), sid, employees),
    readPivotTimeRecordsTab(tab('back_time_records'), sid, employees),
    readFlatTimeRecordsTab(tab('time_records'), sid),
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
  const backEmpIds = new Set(employees.filter((e) => e.positions.includes('Kitchen')).map((e) => e.id))
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

// Individual columns for lunch and dinner (no JSON blobs)
const REV_HEADERS = [
  'id', 'date', 'lfyBills', 'uberBills', 'doorDashBills',
  'l_eftpos', 'l_lfyOnline', 'l_lfyCards', 'l_lfyCash', 'l_uberOnline', 'l_doorDash', 'l_cashLeftInBag', 'l_cashSale', 'l_totalSale',
  'd_eftpos', 'd_lfyOnline', 'd_lfyCards', 'd_lfyCash', 'd_uberOnline', 'd_doorDash', 'd_cashLeftInBag', 'd_cashSale', 'd_totalSale',
  'note', 'lunchRecorderName', 'dinnerRecorderName', 'deleted',
  'frontExtra', 'kitchenExtra',
]

function emptyMeal(): MealRevenue {
  return { eftpos: 0, lfyOnline: 0, lfyCards: 0, lfyCash: 0, uberOnline: 0, doorDash: 0, cashLeftInBag: 0, cashSale: 0, totalSale: 0 }
}

function rowToMeal(r: Record<string, string>, prefix: string): MealRevenue {
  return {
    eftpos:       Number(r[`${prefix}_eftpos`])       || 0,
    lfyOnline:    Number(r[`${prefix}_lfyOnline`])    || 0,
    lfyCards:     Number(r[`${prefix}_lfyCards`])     || 0,
    lfyCash:      Number(r[`${prefix}_lfyCash`])      || 0,
    uberOnline:   Number(r[`${prefix}_uberOnline`])   || 0,
    doorDash:     Number(r[`${prefix}_doorDash`])     || 0,
    cashLeftInBag:Number(r[`${prefix}_cashLeftInBag`])|| 0,
    cashSale:     Number(r[`${prefix}_cashSale`])     || 0,
    totalSale:    Number(r[`${prefix}_totalSale`])    || 0,
  }
}

export async function listRevenue(shopCode: string): Promise<RevenueEntry[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('revenue'), sid)
  return rows.map((r) => {
    // New flat format: individual l_* and d_* columns
    if ('l_eftpos' in r) {
      return {
        id: r.id,
        date: r.date,
        lfyBills:     Number(r.lfyBills)     || 0,
        uberBills:    Number(r.uberBills)    || 0,
        doorDashBills:Number(r.doorDashBills)|| 0,
        lunch:  rowToMeal(r, 'l'),
        dinner: rowToMeal(r, 'd'),
        frontExtra: Number(r.frontExtra) || undefined,
        kitchenExtra: Number(r.kitchenExtra) || undefined,
        note: r.note || undefined,
        lunchRecorderName: r.lunchRecorderName || undefined,
        dinnerRecorderName: r.dinnerRecorderName || undefined,
        deleted: r.deleted === 'true' || undefined,
      }
    }
    // JSON format (previous version): lunch/dinner stored as JSON string
    if (r.lunch !== undefined) {
      return {
        id: r.id,
        date: r.date,
        lfyBills:     Number(r.lfyBills)     || 0,
        uberBills:    Number(r.uberBills)    || 0,
        doorDashBills:Number(r.doorDashBills)|| 0,
        lunch:  JSON.parse(r.lunch  || 'null') as MealRevenue || emptyMeal(),
        dinner: JSON.parse(r.dinner || 'null') as MealRevenue || emptyMeal(),
        note: r.note || undefined,
      }
    }
    // Legacy format (very old: netSales, card columns)
    return {
      id: r.id,
      date: r.date,
      lfyBills: 0, uberBills: 0, doorDashBills: 0,
      lunch:  { ...emptyMeal(), totalSale: Number(r.netSales) || 0, eftpos: Number(r.card) || 0 },
      dinner: emptyMeal(),
      note: r.note || undefined,
    }
  }).filter((e) => !e.deleted)
}

/** Same as listRevenue but includes soft-deleted entries — used internally by delete route */
export async function listRevenueAll(shopCode: string): Promise<RevenueEntry[]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = await getSheetData(tab('revenue'), sid)
  return rows.map((r) => {
    if ('l_eftpos' in r) {
      return {
        id: r.id, date: r.date,
        lfyBills: Number(r.lfyBills) || 0,
        uberBills: Number(r.uberBills) || 0,
        doorDashBills: Number(r.doorDashBills) || 0,
        lunch: rowToMeal(r, 'l'),
        dinner: rowToMeal(r, 'd'),
        frontExtra: Number(r.frontExtra) || undefined,
        kitchenExtra: Number(r.kitchenExtra) || undefined,
        note: r.note || undefined,
        lunchRecorderName: r.lunchRecorderName || undefined,
        dinnerRecorderName: r.dinnerRecorderName || undefined,
        deleted: r.deleted === 'true' || undefined,
      }
    }
    if (r.lunch !== undefined) {
      return {
        id: r.id, date: r.date,
        lfyBills: Number(r.lfyBills) || 0,
        uberBills: Number(r.uberBills) || 0,
        doorDashBills: Number(r.doorDashBills) || 0,
        lunch: JSON.parse(r.lunch || 'null') as MealRevenue || emptyMeal(),
        dinner: JSON.parse(r.dinner || 'null') as MealRevenue || emptyMeal(),
        note: r.note || undefined,
      }
    }
    return {
      id: r.id, date: r.date,
      lfyBills: 0, uberBills: 0, doorDashBills: 0,
      lunch: { ...emptyMeal(), totalSale: Number(r.netSales) || 0, eftpos: Number(r.card) || 0 },
      dinner: emptyMeal(),
      note: r.note || undefined,
    }
  })
}

function mealToRow(m: MealRevenue): (string | number)[] {
  return [m.eftpos, m.lfyOnline, m.lfyCards, m.lfyCash, m.uberOnline, m.doorDash, m.cashLeftInBag, m.cashSale ?? 0, m.totalSale]
}

function effectiveMealTotal(m: MealRevenue): number {
  if (m.totalSale > 0) return m.totalSale
  return m.eftpos + m.lfyOnline + m.uberOnline + m.doorDash + (m.cashSale ?? 0)
}

/**
 * Load revenue entries, migrating the sheet schema if lunchRecorderName/dinnerRecorderName
 * columns are missing (sheet created before this feature was added).
 * Returns [entries] — use this instead of listRevenue in the GET route.
 */
export async function migrateRevenueSchema(shopCode: string): Promise<[RevenueEntry[]]> {
  const { sid, tab } = await getShopDb(shopCode)
  const rawRows = await getSheetData(tab('revenue'), sid)

  // If sheet is empty or already has recorder name columns, just return parsed entries (excluding deleted)
  if (rawRows.length === 0 || 'lunchRecorderName' in rawRows[0]) {
    return [rawRows.map((r) => {
      if ('l_eftpos' in r) {
        return {
          id: r.id, date: r.date,
          lfyBills: Number(r.lfyBills) || 0,
          uberBills: Number(r.uberBills) || 0,
          doorDashBills: Number(r.doorDashBills) || 0,
          lunch: rowToMeal(r, 'l'),
          dinner: rowToMeal(r, 'd'),
          note: r.note || undefined,
          lunchRecorderName: r.lunchRecorderName || undefined,
          dinnerRecorderName: r.dinnerRecorderName || undefined,
          deleted: r.deleted === 'true' || undefined,
        }
      }
      if ('lunch' in r) {
        return {
          id: r.id, date: r.date,
          lfyBills: Number(r.lfyBills) || 0,
          uberBills: Number(r.uberBills) || 0,
          doorDashBills: Number(r.doorDashBills) || 0,
          lunch: JSON.parse(r.lunch || 'null') as MealRevenue || emptyMeal(),
          dinner: JSON.parse(r.dinner || 'null') as MealRevenue || emptyMeal(),
          note: r.note || undefined,
        }
      }
      return {
        id: r.id, date: r.date,
        lfyBills: 0, uberBills: 0, doorDashBills: 0,
        lunch: { ...emptyMeal(), totalSale: Number(r.netSales) || 0, eftpos: Number(r.card) || 0 },
        dinner: emptyMeal(),
        note: r.note || undefined,
      }
    }).filter((e) => !e.deleted)]
  }

  // Schema migration: sheet is missing recorder name columns — rewrite with new REV_HEADERS
  console.log(`[migrateRevenueSchema] Adding lunchRecorderName/dinnerRecorderName columns for shop ${shopCode}`)
  const entries = await listRevenue(shopCode)  // parses current data
  await saveRevenue(shopCode, entries)          // rewrites sheet with new headers
  return [entries]
}

export async function saveRevenue(shopCode: string, entries: RevenueEntry[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const sheetName = tab('revenue')
  const rows = entries.map((e) => [
    e.id, e.date, e.lfyBills, e.uberBills, e.doorDashBills,
    ...mealToRow(e.lunch), ...mealToRow(e.dinner),
    e.note ?? '', e.lunchRecorderName ?? '', e.dinnerRecorderName ?? '', e.deleted ? 'true' : '',
    e.frontExtra ?? '', e.kitchenExtra ?? '',
  ])
  await setSheetData(sheetName, REV_HEADERS, rows, sid)

  // Apply formatting — non-fatal: if formatting fails, data is already written correctly
  try {
    const LUNCH_YELLOW   = { red: 1,     green: 0.949, blue: 0.8   }  // #FFF2CC
    const DINNER_BLUE    = { red: 0.678, green: 0.847, blue: 0.933 }  // #ADD8E6
    const HEADER_BG      = { red: 0.851, green: 0.918, blue: 0.827 }  // #D9EAD3
    const DELETED_RED    = { red: 0.918, green: 0.298, blue: 0.298  }  // #EA4C4C — สีแดง
    const totalRows = rows.length + 1

    // Highlight deleted rows — row 0 = header, row i+1 = entries[i]
    const deletedRules = entries
      .map((e, i) => ({ deleted: e.deleted, row: i + 1 }))
      .filter(({ deleted }) => deleted)
      .map(({ row }) => ({
        startRow: row, endRow: row + 1,
        startCol: 0, endCol: REV_HEADERS.length,
        backgroundColor: DELETED_RED,
      }))

    await applyFormattingRules(sheetName, sid, [
      // Header row: green + bold
      { startRow: 0, endRow: 1, startCol: 0, endCol: REV_HEADERS.length, backgroundColor: HEADER_BG, bold: true },
      // Lunch section header cells: yellow (cols 5-13, 9 fields incl cashSale)
      { startRow: 0, endRow: 1, startCol: 5, endCol: 14, backgroundColor: LUNCH_YELLOW },
      // Dinner section header cells: blue (cols 14-22, 9 fields incl cashSale)
      { startRow: 0, endRow: 1, startCol: 14, endCol: 23, backgroundColor: DINNER_BLUE },
      // AUD format for meal amounts (cols 5-22)
      ...(totalRows > 1 ? [{ startRow: 1, endRow: totalRows, startCol: 5, endCol: 23, numberFormat: AUD_FORMAT }] : []),
      // Integer format for bill counts (cols 2-4)
      ...(totalRows > 1 ? [{ startRow: 1, endRow: totalRows, startCol: 2, endCol: 5, numberFormat: INT_FORMAT }] : []),
      // Deleted rows: orange/curry highlight (applied last so it overrides row colors)
      ...deletedRules,
    ])
  } catch (err) {
    console.warn('[saveRevenue] formatting failed (data was saved):', err)
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

const EXP_HEADERS = [
  'id', 'date', 'category', 'supplier', 'description', 'total',
  'paymentMethod', 'bankAccount', 'dueDate', 'paid', 'filledBy',
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
    filledBy: r.filledBy || undefined,
  }))
}

export async function saveExpenses(shopCode: string, entries: ExpenseEntry[]): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  const rows = entries.map((e) => [
    e.id, e.date, e.category, e.supplier, e.description, e.total,
    e.paymentMethod, e.bankAccount ?? '', e.dueDate ?? '', e.paid, e.filledBy ?? '',
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

export async function getExtraRate(shopCode: string): Promise<number> {
  try {
    const rows = await getConfigRows(shopCode)
    const row = rows.find((r) => r.key === 'extra_rate')
    if (!row) return 0
    return Number(row.value) || 0
  } catch {
    return 0
  }
}

export async function saveExtraRate(shopCode: string, rate: number): Promise<void> {
  const existing = await getConfigRows(shopCode)
  const kept = existing.filter((r) => r.key !== 'extra_rate').map((r): [string, string] => [r.key, r.value])
  kept.push(['extra_rate', String(rate)])
  await saveConfigRows(shopCode, kept)
}

// ─── Wage Payments (TAX / CASH PAID per week per employee) ───────────────────

const WAGE_PMT_HEADERS = ['weekStart', 'employeeId', 'tax', 'paid', 'note', 'overrides']

export interface WagePaymentRow {
  tax: number
  paid: number
  note: string
  overrides: Record<string, number>  // e.g. { "0L": 86, "1D": 97 }
}

export async function getWagePayments(
  shopCode: string,
  weekStart: string,
): Promise<{ payments: Map<string, WagePaymentRow>; weekNote: string }> {
  try {
    const { sid, tab } = await getShopDb(shopCode)
    const rows = await getSheetData(tab('wage_payments'), sid)
    const payments = new Map<string, WagePaymentRow>()
    let weekNote = ''
    for (const r of rows) {
      if (r.weekStart !== weekStart) continue
      if (r.employeeId === '__note__') { weekNote = r.note || ''; continue }
      let overrides: Record<string, number> = {}
      try { overrides = r.overrides ? JSON.parse(r.overrides) : {} } catch { /* ignore */ }
      payments.set(r.employeeId, { tax: Number(r.tax) || 0, paid: Number(r.paid) || 0, note: r.note || '', overrides })
    }
    return { payments, weekNote }
  } catch {
    return { payments: new Map(), weekNote: '' }
  }
}

export async function getAllWagePayments(
  shopCode: string,
): Promise<Map<string, Map<string, WagePaymentRow>>> {
  try {
    const { sid, tab } = await getShopDb(shopCode)
    const rows = await getSheetData(tab('wage_payments'), sid)
    const result = new Map<string, Map<string, WagePaymentRow>>()
    for (const r of rows) {
      if (r.employeeId === '__note__') continue
      if (!result.has(r.weekStart)) result.set(r.weekStart, new Map())
      let overrides: Record<string, number> = {}
      try { overrides = r.overrides ? JSON.parse(r.overrides) : {} } catch { /* ignore */ }
      result.get(r.weekStart)!.set(r.employeeId, { tax: Number(r.tax) || 0, paid: Number(r.paid) || 0, note: r.note || '', overrides })
    }
    return result
  } catch {
    return new Map()
  }
}

export async function saveWagePayments(
  shopCode: string,
  weekStart: string,
  payments: { employeeId: string; tax: number; paid: number; note: string; overrides: Record<string, number> }[],
  weekNote: string,
): Promise<void> {
  const { sid, tab } = await getShopDb(shopCode)
  let existing: { weekStart: string; employeeId: string; tax: string; paid: string; note: string; overrides: string }[] = []
  try {
    existing = await getSheetData(tab('wage_payments'), sid) as typeof existing
  } catch { /* sheet doesn't exist yet */ }

  const kept = existing.filter((r) => r.weekStart !== weekStart)
  const dataRows: string[][] = [
    ...kept.map((r) => [r.weekStart, r.employeeId, r.tax || '0', r.paid || '0', r.note || '', r.overrides || '']),
    ...payments.map((p) => [weekStart, p.employeeId, String(p.tax), String(p.paid), p.note, JSON.stringify(p.overrides)]),
    [weekStart, '__note__', '0', '0', weekNote, ''],
  ]
  await setSheetData(tab('wage_payments'), WAGE_PMT_HEADERS, dataRows, sid)
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

// ─── Google Sheet Report Sync ─────────────────────────────────────────────────

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Build a SUM formula for the given 0-based column index
function sumF(col: number, r1: number, r2: number): string {
  return `=SUM(${colLetter(col)}${r1}:${colLetter(col)}${r2})`
}

// Color constants (Google Sheets uses 0-1 float)
const C_ORANGE       = { red: 1,     green: 0.753, blue: 0     }  // #FFC000 — SUM/Total rows

function getWeekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

// ── Income 2026 (dynamic columns based on delivery rate tiers) ────────────────
// Row 0: group headers (LUNCH/DINNER labels, km bucket labels)
// Row 1: column sub-headers
// Data rows: 7 days per week + 1 SUM row (no blank rows between weeks)
//
// Column groups (with N = number of delivery rate tiers):
//   A(0)-B(1)          : Day name, Date
//   C(2)-E(4)          : Bills — LFY, Uber Eat, DoorDash
//   F(5)-F(5+N)        : Home Delivery — N tier columns + Total
//   (5+N+1)-(5+N+9)    : LUNCH — 9 fields (Eftpos..Cash Sale)
//   (5+N+10)           : gap (DINNER label)
//   (5+N+11)-(5+N+19)  : DINNER — 9 fields
//   (5+N+20)           : gap
//   (5+N+21)-(5+N+36)  : Combined daily totals + Running
//   (5+N+37)-(5+N+38)  : gap
//   (5+N+39)-(5+N+51)  : Simplified view
const INCOME_SHEET = 'Income 2026'

/** Convert 0-based column index to A1 column letter (A, B, ..., Z, AA, ...) */
function colLetter(n: number): string {
  let s = ''
  let c = n
  while (c >= 0) {
    s = String.fromCharCode(65 + (c % 26)) + s
    c = Math.floor(c / 26) - 1
  }
  return s
}

/** Build dynamic column layout for the Income sheet based on number of delivery tiers. */
function incomeLayout(nTiers: number) {
  const d = 5            // first delivery tier column (F)
  const j = d + nTiers + 1  // first lunch column (J when nTiers=3)
  return {
    nTiers,
    totalCols: j + 51,
    // Delivery
    delFirst:  d,
    delLast:   d + nTiers - 1,
    delTotal:  d + nTiers,
    // Lunch (9 cols)
    lEftpos:  j,    lLfyOnl:  j+1,  lLfyCard: j+2,
    lLfyCash: j+3,  lUber:    j+4,  lDD:      j+5,
    lCashBag: j+6,  lTotal:   j+7,  lCash:    j+8,
    gap1:     j+9,
    // Dinner (9 cols)
    dEftpos:  j+10, dLfyOnl:  j+11, dLfyCard: j+12,
    dLfyCash: j+13, dUber:    j+14, dDD:      j+15,
    dCashBag: j+16, dTotal:   j+17, dCash:    j+18,
    gap2:     j+19,
    // Combined (16 cols)
    cEftpos:  j+20, cLfyOnl:  j+21, cUber:    j+22, cDD:      j+23,
    cCash:    j+24, cLunch:   j+25, cDinner:  j+26, cEftpos2: j+27,
    cLfy:     j+28, cUber2:   j+29, cDin2:    j+30, cCash2:   j+31,
    cTotal:   j+32, cCashBag: j+33, surcharge:j+34, running:  j+35,
    gap3:     j+36, gap4:     j+37,
    // Simplified (13 cols)
    sDay:     j+38, sDate:    j+39,
    sLEff:    j+40, sLCash:   j+41, sDEff:    j+42, sDCash:   j+43,
    sLTot:    j+44, sDTot:    j+45, sEffTot:  j+46, sCashTot: j+47,
    sTotal:   j+48, sCashBag: j+49, sRunning: j+50,
  }
}

type IncomeLayout = ReturnType<typeof incomeLayout>

function makeIncomeHdr0(lo: IncomeLayout, deliveryRates: import('./types').DeliveryRate[]): (string | number | null)[] {
  const r = new Array(lo.totalCols).fill('') as (string | number | null)[]
  // Delivery tier labels
  deliveryRates.forEach((rate, i) => {
    const prevMax = i === 0 ? 0 : deliveryRates[i - 1].maxKm
    r[lo.delFirst + i] = i === 0
      ? `≤${rate.maxKm}km`
      : rate.maxKm >= 9999 ? `>${prevMax}km` : `>${prevMax}–${rate.maxKm}km`
  })
  r[lo.delTotal] = 'total'
  r[lo.lEftpos]  = 'LUNCH'
  r[lo.gap1]     = 'DINNER'
  return r
}

function makeIncomeHdr1(lo: IncomeLayout): (string | number | null)[] {
  const r = new Array(lo.totalCols).fill('') as (string | number | null)[]
  r[2] = 'LFY';  r[3] = 'Uber Eat';  r[4] = 'DoorDash'
  r[lo.delFirst] = 'Home Delivery'
  // Lunch
  r[lo.lEftpos]  = 'Eftpos';              r[lo.lLfyOnl]  = 'Local for You paid online'
  r[lo.lLfyCard] = 'Local for You Cards'; r[lo.lLfyCash] = 'Local for You Cash'
  r[lo.lUber]    = 'Uber Eat Paid online'; r[lo.lDD]     = 'DoorDash'
  r[lo.lCashBag] = 'Cash left in Bag';   r[lo.lTotal]   = 'Total Sale'; r[lo.lCash] = 'Cash Sale'
  // Dinner
  r[lo.dEftpos]  = 'Eftpos';              r[lo.dLfyOnl]  = 'Local for You paid online'
  r[lo.dLfyCard] = 'Local for You Cards'; r[lo.dLfyCash] = 'Local for You Cash'
  r[lo.dUber]    = 'Uber Eat Paid online'; r[lo.dDD]     = 'DoorDash'
  r[lo.dCashBag] = 'Cash left in bag';   r[lo.dTotal]   = 'Total Sale'; r[lo.dCash] = 'Cash Sale'
  // Combined
  r[lo.cEftpos]  = 'Total Eftpos';         r[lo.cLfyOnl]  = 'Daily online Local for You'
  r[lo.cUber]    = 'Daily online Uber Eat'; r[lo.cDD]     = 'Daily Online DoorDash'
  r[lo.cCash]    = 'Total Cash';            r[lo.cLunch]  = 'Total Lunch'; r[lo.cDinner] = 'Total Dinner'
  r[lo.cEftpos2] = 'Total Eftpos + Credit'; r[lo.cLfy]   = 'Total Local for You'
  r[lo.cUber2]   = 'Total Uber Eat';        r[lo.cDin2]  = 'Total DoorDash'
  r[lo.cCash2]   = 'Total Cash';            r[lo.cTotal] = 'Total'; r[lo.cCashBag] = 'Total Cash left in bag'
  // Simplified
  r[lo.sLEff]    = 'Eftpos';  r[lo.sLCash]   = 'Cash'
  r[lo.sDEff]    = 'Eftpos';  r[lo.sDCash]   = 'Cash'
  r[lo.sLTot]    = 'Total Lunch';  r[lo.sDTot]    = 'Total Dinner'
  r[lo.sEffTot]  = 'Total Eftpos + Uber + online order'
  r[lo.sCashTot] = 'Total Cash';  r[lo.sTotal]   = 'Total'; r[lo.sCashBag] = 'Total - Expense = Cash in the Bag'
  return r
}

// Number/date formats
const AUD_FORMAT  = { type: 'NUMBER', pattern: '[$-C09]#,##0.00' }
const DATE_FORMAT = { type: 'DATE',   pattern: 'dd/mm/yyyy' }
const INT_FORMAT  = { type: 'NUMBER', pattern: '0' }


async function applyIncomeFullFormat(
  sid: string,
  lo: IncomeLayout,
  totalRows: number,
  sumRowIndices: number[],
): Promise<void> {
  const sheetId = await getSheetIdByName(sid, INCOME_SHEET)
  if (sheetId === undefined) return

  const BLACK = { red: 0, green: 0, blue: 0 }
  const SOLID = { style: 'SOLID',       color: BLACK }

  // Full color palette from Seed shop Income 2026 analysis
  const C_WHITE   = { red: 1,     green: 1,     blue: 1     }
  // C_HEADER removed — Row 0/1 now use section-specific colors
  const C_LGRAY   = { red: 0.941, green: 0.941, blue: 0.941 }  // near-white — lunch/dinner data
  const C_MGRAY   = { red: 0.851, green: 0.851, blue: 0.851 }  // medium gray — combined, cDin2, cCashBag
  const C_DGRAY   = { red: 0.800, green: 0.800, blue: 0.800 }  // dark gray — delTotal, surcharge, SUM rows
  const C_VDGRAY  = { red: 0.600, green: 0.600, blue: 0.600 }  // very dark gray — dCash
  const C_XDGRAY  = { red: 0.400, green: 0.400, blue: 0.400 }  // extra dark gray — cEftpos2
  const C_LCASH   = { red: 0.718, green: 0.718, blue: 0.718 }  // lCash gray
  const C_LGREEN  = { red: 0.714, green: 0.843, blue: 0.659 }  // light green — bills, cUber2
  const C_LLGREEN = { red: 0.851, green: 0.918, blue: 0.831 }  // lighter green — delivery tiers
  const C_MGREEN  = { red: 0.576, green: 0.769, blue: 0.490 }  // medium green — cLunch, cDinner
  const C_LBLUE   = { red: 0.812, green: 0.886, blue: 0.953 }  // light blue — gap1, cLfy, cTotal, sTotal, sCashBag
  const C_MBLUE   = { red: 0.624, green: 0.769, blue: 0.910 }  // medium blue — cCash2
  const C_AMBER   = { red: 1.000, green: 0.753, blue: 0.000 }  // amber/orange — running total
  const C_LORANGE = { red: 0.980, green: 0.800, blue: 0.612 }  // light orange — sLTot, sEffTot
  const C_PORANGE = { red: 0.988, green: 0.898, blue: 0.800 }  // pale orange — sDTot, sCashTot
  const C_YELLOW  = { red: 1,     green: 1,     blue: 0     }  // yellow — SUM running

  const requests: object[] = []

  const bg = (sr: number, er: number, sc: number, ec: number, color: object) =>
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, cell: { userEnteredFormat: { backgroundColor: color } }, fields: 'userEnteredFormat.backgroundColor' } })

  const bold = (sr: number, er: number, sc: number, ec: number) =>
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } })

  const bdr = (sr: number, er: number, sc: number, ec: number, sides: Record<string, object>) =>
    requests.push({ updateBorders: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, ...sides } })

  const mrg = (sr: number, er: number, sc: number, ec: number) =>
    requests.push({ mergeCells: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, mergeType: 'MERGE_ALL' } })

  const cw = (col: number, width: number) =>
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } })

  const fgw = (sr: number, er: number, sc: number, ec: number) =>
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat.textFormat.foregroundColor' } })

  const C_HDR_WARM = { red: 1, green: 0.945, blue: 0.8 }   // warm yellow for DoorDash header cols

  // 1. Global white reset
  bg(0, totalRows, 0, lo.totalCols, C_WHITE)

  // 2. Row 0 (hdr0): section-based colors matching Test sheet
  bg(0, 1, 0, 2, C_MGRAY)                             // A,B: medium gray
  bg(0, 1, 2, lo.lEftpos, C_VDGRAY)                  // C-L (bills+delivery): dark gray
  bg(0, 1, lo.lEftpos, lo.gap1, C_XDGRAY)            // LUNCH merged: extra dark
  bg(0, 1, lo.gap1, lo.gap2, C_VDGRAY)               // DINNER merged: dark gray
  bg(0, 1, lo.cEftpos, lo.surcharge, C_LBLUE)         // Combined merged: light blue
  bg(0, 1, lo.surcharge, lo.surcharge + 1, C_DGRAY)  // AU: gray
  bg(0, 1, lo.running, lo.totalCols, C_MGRAY)         // AV onwards: medium gray
  bold(0, 1, lo.lEftpos, lo.gap1)                     // LUNCH label: bold
  fgw(0, 1, lo.lEftpos, lo.gap1)                      // LUNCH label: white text
  fgw(0, 1, lo.gap1, lo.gap2)                         // DINNER label: white text

  // Row 1 (hdr1): per-column header colors matching Test sheet
  bg(1, 2, 0, 2, C_MGRAY)                             // A, B
  bg(1, 2, 2, lo.lEftpos, C_VDGRAY)                  // C-L (bills + Home Delivery merged)
  // Lunch columns
  bg(1, 2, lo.lEftpos,  lo.lEftpos  + 1, C_LCASH)   // M: Eftpos
  bg(1, 2, lo.lLfyOnl,  lo.lLfyCash + 1, C_LBLUE)   // N-P: LFY (light blue)
  bg(1, 2, lo.lUber,    lo.lUber    + 1, C_LGREEN)   // Q: Uber
  bg(1, 2, lo.lDD,      lo.lDD      + 1, C_HDR_WARM) // R: DoorDash (warm)
  bg(1, 2, lo.lCashBag, lo.lCashBag + 1, C_YELLOW)   // S: Cash in Bag (yellow)
  bg(1, 2, lo.lTotal,   lo.lTotal   + 1, C_VDGRAY)   // T: Total Sale (dark)
  bg(1, 2, lo.lCash,    lo.lCash    + 1, C_LCASH)    // U: Cash Sale
  bg(1, 2, lo.gap1,     lo.gap1     + 1, C_LBLUE)    // V: separator
  // Dinner columns (mirrors lunch)
  bg(1, 2, lo.dEftpos,  lo.dEftpos  + 1, C_LCASH)   // W: Eftpos
  bg(1, 2, lo.dLfyOnl,  lo.dLfyCash + 1, C_LBLUE)   // X-Z: LFY
  bg(1, 2, lo.dUber,    lo.dUber    + 1, C_LGREEN)   // AA: Uber
  bg(1, 2, lo.dDD,      lo.dDD      + 1, C_HDR_WARM) // AB: DoorDash
  bg(1, 2, lo.dCashBag, lo.dCashBag + 1, C_YELLOW)   // AC: Cash in Bag (yellow)
  bg(1, 2, lo.dTotal,   lo.dTotal   + 1, C_LCASH)    // AD: Total Sale
  bg(1, 2, lo.dCash,    lo.dCash    + 1, C_VDGRAY)   // AE: Cash Sale (dark)
  // Combined section
  bg(1, 2, lo.cEftpos,  lo.cEftpos  + 1, C_DGRAY)   // AG
  bg(1, 2, lo.cLfyOnl,  lo.cLfyOnl  + 1, { red: 0.788, green: 0.855, blue: 0.973 })  // AH
  bg(1, 2, lo.cUber,    lo.cUber    + 1, C_LLGREEN)  // AI
  bg(1, 2, lo.cDD,      lo.cDD      + 1, C_HDR_WARM) // AJ
  bg(1, 2, lo.cCash,    lo.cCash    + 1, C_LCASH)    // AK
  bg(1, 2, lo.cLunch,   lo.cDinner  + 1, C_DGRAY)    // AL-AM: Lunch/Dinner
  bg(1, 2, lo.cEftpos2, lo.cEftpos2 + 1, C_LCASH)   // AN
  bg(1, 2, lo.cLfy,     lo.cLfy     + 1, C_LBLUE)    // AO
  bg(1, 2, lo.cUber2,   lo.cUber2   + 1, C_LGREEN)   // AP
  bg(1, 2, lo.cDin2,    lo.cDin2    + 1, { red: 1, green: 0.949, blue: 0.8 })  // AQ
  bg(1, 2, lo.cCash2,   lo.cCash2   + 1, C_DGRAY)    // AR
  bg(1, 2, lo.cTotal,   lo.cTotal   + 1, C_DGRAY)    // AS
  bg(1, 2, lo.cCashBag, lo.cCashBag + 1, C_YELLOW)   // AT: yellow
  bg(1, 2, lo.surcharge,lo.surcharge+ 1, C_DGRAY)    // AU
  bg(1, 2, lo.running,  lo.running  + 1, C_AMBER)    // AV: amber
  // Simplified section header
  bg(1, 2, lo.sDay,    lo.sDate    + 1, C_MGRAY)     // AY-AZ
  bg(1, 2, lo.sLEff,   lo.sDCash   + 1, C_LLGREEN)  // BA-BD: light green
  bg(1, 2, lo.sLTot,   lo.sDTot    + 1, C_MGRAY)    // BE-BF: gray
  bg(1, 2, lo.sEffTot, lo.sTotal   + 1, C_LLGREEN)  // BG-BI: light green
  bg(1, 2, lo.sCashBag,lo.sCashBag + 1, C_MGRAY)    // BJ: gray

  // 3. Per-column colors for all data+SUM rows (rows 2 onward)
  const d = 2
  bg(d, totalRows, 2, 5, C_LGREEN)                           // C-E: bills
  bg(d, totalRows, lo.delFirst, lo.delLast + 1, C_LLGREEN)  // delivery tiers
  bg(d, totalRows, lo.delTotal, lo.delTotal + 1, C_DGRAY)   // del total
  bg(d, totalRows, lo.lEftpos, lo.lTotal + 1, C_LGRAY)      // lunch data (lEftpos..lTotal)
  bg(d, totalRows, lo.lCash, lo.lCash + 1, C_LCASH)         // lCash
  bg(d, totalRows, lo.gap1, lo.gap1 + 1, C_LBLUE)           // gap1 separator
  bg(d, totalRows, lo.dEftpos, lo.dTotal + 1, C_LGRAY)      // dinner data (dEftpos..dTotal)
  bg(d, totalRows, lo.dCash, lo.dCash + 1, C_VDGRAY)        // dCash
  bg(d, totalRows, lo.cEftpos, lo.cCash + 1, C_MGRAY)       // combined main (cEftpos..cCash)
  bg(d, totalRows, lo.cLunch, lo.cDinner + 1, C_MGREEN)     // cLunch, cDinner
  bg(d, totalRows, lo.cEftpos2, lo.cEftpos2 + 1, C_XDGRAY) // cEftpos2
  fgw(d, totalRows, lo.cEftpos2, lo.cEftpos2 + 1)           // cEftpos2: white text
  bg(d, totalRows, lo.cLfy, lo.cLfy + 1, C_LBLUE)           // cLfy
  bg(d, totalRows, lo.cUber2, lo.cUber2 + 1, C_LGREEN)      // cUber2
  bg(d, totalRows, lo.cDin2, lo.cDin2 + 1, C_MGRAY)         // cDin2
  bg(d, totalRows, lo.cCash2, lo.cCash2 + 1, C_MBLUE)       // cCash2
  bg(d, totalRows, lo.cTotal, lo.cTotal + 1, C_LBLUE)        // cTotal
  bg(d, totalRows, lo.cCashBag, lo.cCashBag + 1, C_MGRAY)   // cCashBag
  bg(d, totalRows, lo.surcharge, lo.surcharge + 1, C_DGRAY) // surcharge
  bg(d, totalRows, lo.running, lo.running + 1, C_AMBER)      // running (amber)
  bg(d, totalRows, lo.sLTot, lo.sLTot + 1, C_LORANGE)       // sLTot
  bg(d, totalRows, lo.sDTot, lo.sDTot + 1, C_PORANGE)       // sDTot
  bg(d, totalRows, lo.sEffTot, lo.sEffTot + 1, C_LORANGE)   // sEffTot
  bg(d, totalRows, lo.sCashTot, lo.sCashTot + 1, C_PORANGE) // sCashTot
  bg(d, totalRows, lo.sTotal, lo.sTotal + 1, C_LBLUE)        // sTotal
  bg(d, totalRows, lo.sCashBag, lo.sCashBag + 1, C_LBLUE)   // sCashBag

  // 4. SUM rows: mostly dark gray, with specific overrides from Test sheet
  for (const si of sumRowIndices) {
    bg(si, si + 1, 0, lo.totalCols, C_DGRAY)                       // base: dark gray
    bg(si, si + 1, 2, 5, C_VDGRAY)                                 // C-E bills: darker
    bg(si, si + 1, lo.delTotal, lo.delTotal + 1, C_VDGRAY)         // L del total: darker
    bg(si, si + 1, lo.gap1, lo.gap1 + 1, C_LBLUE)                  // V gap1: keep light blue
    bg(si, si + 1, lo.cCash2, lo.cCashBag + 1, C_MGRAY)           // AR-AT: slightly lighter
    bg(si, si + 1, lo.running, lo.running + 1, C_YELLOW)           // AV: yellow
    bg(si, si + 1, lo.sDay, lo.totalCols, C_MGRAY)                 // simplified: medium gray
    bold(si, si + 1, 0, lo.totalCols)
  }

  // 5. Unmerge header area first (safe re-format)
  requests.push({ unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: lo.totalCols } } })
  // Unmerge then re-merge delivery tier columns in each SUM row
  for (const ri of sumRowIndices) {
    requests.push({ unmergeCells: { range: { sheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: lo.delFirst, endColumnIndex: lo.delTotal } } })
    mrg(ri, ri + 1, lo.delFirst, lo.delTotal)
  }

  // 6. Merge cells
  mrg(0, 1, lo.lEftpos, lo.gap1)          // LUNCH header
  mrg(0, 1, lo.gap1, lo.gap2)             // DINNER header (V1:AE1)
  mrg(0, 1, lo.cEftpos, lo.surcharge)     // Combined header
  mrg(1, 2, lo.delFirst, lo.delTotal + 1) // Home Delivery (row 1)

  // 7. Column widths (from Seed sheet)
  cw(2, 58); cw(3, 60); cw(4, 67)                          // C,D,E bills
  for (let i = 0; i < lo.nTiers; i++) cw(lo.delFirst + i, 54) // delivery tiers
  cw(lo.delTotal, 77)                                       // del total
  cw(lo.lEftpos, 80);   cw(lo.lLfyOnl, 103)
  cw(lo.lLfyCard, 124); cw(lo.lLfyCash, 119); cw(lo.lUber, 129)
  cw(lo.gap1, 58)                                           // gap/separator
  cw(lo.dLfyOnl, 153);  cw(lo.dLfyCard, 124); cw(lo.dLfyCash, 119); cw(lo.dUber, 129)
  cw(lo.gap2, 67)                                           // gap/separator
  cw(lo.cEftpos2, 127); cw(lo.cLfy, 116)
  cw(lo.cCash2, 94);    cw(lo.cCashBag, 131); cw(lo.surcharge, 94)
  cw(lo.gap3, 81);      cw(lo.gap4, 84)
  cw(lo.sEffTot, 118);  cw(lo.sCashBag, 128)

  // 8. Borders
  // A-L: full grid
  bdr(0, totalRows, 0, lo.delTotal + 1, { top: SOLID, bottom: SOLID, left: SOLID, right: SOLID, innerHorizontal: SOLID, innerVertical: SOLID })
  // SOLID right separators
  bdr(2, totalRows, lo.lTotal,  lo.lTotal  + 1, { right: SOLID })
  bdr(2, totalRows, lo.lCash,   lo.lCash   + 1, { right: SOLID })
  bdr(2, totalRows, lo.gap1,    lo.gap1    + 1, { right: SOLID })
  bdr(2, totalRows, lo.dTotal,  lo.dTotal  + 1, { right: SOLID })
  bdr(2, totalRows, lo.dCash,   lo.dCash   + 1, { right: SOLID })
  bdr(2, totalRows, lo.sDate,   lo.sDate   + 1, { right: SOLID })
  bdr(2, totalRows, lo.sDCash,  lo.sDCash  + 1, { right: SOLID })
  bdr(2, totalRows, lo.sTotal,  lo.sTotal  + 1, { right: SOLID })
  // Thin structural borders
  bdr(2, totalRows, lo.cEftpos,  lo.cEftpos  + 1, { left:  SOLID })
  bdr(2, totalRows, lo.cCashBag, lo.cCashBag + 1, { right: SOLID })
  // AY-AZ: grid borders
  bdr(2, totalRows, lo.sDay, lo.sDate + 1, { top: SOLID, bottom: SOLID, left: SOLID, right: SOLID, innerHorizontal: SOLID, innerVertical: SOLID })

  await batchUpdateSheet(sid, requests)
}

export async function syncIncomeSheet(shopCode: string): Promise<void> {
  const { sid } = await getShopDb(shopCode)
  const [revenue, deliveryTrips, deliveryRates] = await Promise.all([
    listRevenue(shopCode),
    listDeliveryTrips(shopCode),
    listDeliveryRates(shopCode),
  ])
  if (revenue.length === 0) return

  // Fall back to 3 legacy tiers if none configured
  const rates = deliveryRates.length > 0 ? deliveryRates : [
    { maxKm: 4, fee: 0 }, { maxKm: 6, fee: 0 }, { maxKm: 9999, fee: 0 },
  ]
  const lo = incomeLayout(rates.length)

  const weekMap = new Map<string, RevenueEntry[]>()
  for (const e of revenue) {
    const mon = getMondayStr(e.date)
    if (!weekMap.has(mon)) weekMap.set(mon, [])
    weekMap.get(mon)!.push(e)
  }
  const sortedWeeks = [...weekMap.keys()].sort()

  // Two header rows (row 0 and row 1 in the sheet, 0-indexed)
  const rows: (string | number | null)[][] = [makeIncomeHdr0(lo, rates), makeIncomeHdr1(lo)]
  const fmtRules: SheetFormatRule[] = []
  const sumRowIndices: number[] = []

  for (let wi = 0; wi < sortedWeeks.length; wi++) {
    const monday = sortedWeeks[wi]
    const weekDates = getWeekDates(monday)
    const weekEntries = weekMap.get(monday)!
    const s1 = rows.length + 1   // 1-based first data row of this week

    // Per-week tracking (running totals reset each week)
    let prevDataRn: number | null = null  // row number of the previous day (1-based)

    for (let di = 0; di < 7; di++) {
      const date = weekDates[di]
      const rn = rows.length + 1   // 1-based sheet row number
      const entry = weekEntries.find((e) => e.date === date)

      const l    = entry?.lunch    ?? emptyMeal()
      const d    = entry?.dinner   ?? emptyMeal()
      const lfyB = entry?.lfyBills ?? 0
      const ubrB = entry?.uberBills ?? 0
      const ddB  = entry?.doorDashBills ?? 0

      const dayTrips = deliveryTrips.filter((t) => t.date === date)

      // SUM row will be at s1+7 — needed for Sunday AR formula
      const sumRn = s1 + 7

      // AR (Uber surcharge): Thu=rate, Fri=text, Sun=formula referencing Fri AR - weekly Uber sum
      let ar: string | number = ''
      if (di === 3) ar = 0.283
      else if (di === 4) ar = 'Uber Real Pay'
      else if (di === 6) {
        ar = `=${colLetter(lo.surcharge)}${sumRn}`
      }

      // AS (running total — per-week, resets each Monday):
      //   Mon: blank  |  Tue/Wed: rolling 2-day (prevDay + today)
      //   Thu-Sun: cumulative (AS_prev + AP_curr)
      let as: string | number = ''
      if ((di === 1 || di === 2) && prevDataRn !== null) {
        as = `=${colLetter(lo.cTotal)}${prevDataRn}+${colLetter(lo.cTotal)}${rn}`
      } else if (di >= 3 && prevDataRn !== null) {
        as = `=${colLetter(lo.running)}${prevDataRn}+${colLetter(lo.cTotal)}${rn}`
      }

      // Simplified running total (per-week):
      //   Mon: blank  |  Tue: Mon_sTotal + Tue_sTotal  |  Wed-Sun: sRunning_prev + sTotal_curr
      let bh: string | number = ''
      if (di === 1 && prevDataRn !== null) {
        bh = `=${colLetter(lo.sTotal)}${prevDataRn}+${colLetter(lo.sTotal)}${rn}`
      } else if (di >= 2 && prevDataRn !== null) {
        bh = `=${colLetter(lo.sRunning)}${prevDataRn}+${colLetter(lo.sTotal)}${rn}`
      }

      const [yr, mo, dy] = date.split('-').map(Number)
      const row: (string | number | null)[] = new Array(lo.totalCols).fill('')

      // A(0)-B(1) Day / Date
      row[0] = DAY_ABBR[di]
      row[1] = `=DATE(${yr},${mo},${dy})`

      // C(2)-E(4) Bills
      row[2] = lfyB; row[3] = ubrB; row[4] = ddB

      // Delivery tier columns (dynamic)
      for (let ti = 0; ti < rates.length; ti++) {
        const prevMax = ti === 0 ? 0 : rates[ti - 1].maxKm
        row[lo.delFirst + ti] = dayTrips.filter((t) =>
          ti === 0 ? t.distance <= rates[ti].maxKm : t.distance > prevMax && t.distance <= rates[ti].maxKm
        ).length
      }
      row[lo.delTotal] = `=SUM(${colLetter(lo.delFirst)}${rn}:${colLetter(lo.delLast)}${rn})`

      // Lunch
      row[lo.lEftpos]  = l.eftpos;        row[lo.lLfyOnl]  = l.lfyOnline
      row[lo.lLfyCard] = l.lfyCards;      row[lo.lLfyCash] = l.lfyCash
      row[lo.lUber]    = l.uberOnline;    row[lo.lDD]      = l.doorDash
      row[lo.lCashBag] = l.cashLeftInBag; row[lo.lTotal]   = effectiveMealTotal(l)
      row[lo.lCash]    = l.cashSale ?? 0

      // Dinner
      row[lo.dEftpos]  = d.eftpos;        row[lo.dLfyOnl]  = d.lfyOnline
      row[lo.dLfyCard] = d.lfyCards;      row[lo.dLfyCash] = d.lfyCash
      row[lo.dUber]    = d.uberOnline;    row[lo.dDD]      = d.doorDash
      row[lo.dCashBag] = d.cashLeftInBag; row[lo.dTotal]   = effectiveMealTotal(d)
      row[lo.dCash]    = d.cashSale ?? 0

      // Combined
      row[lo.cEftpos]  = `=${colLetter(lo.dEftpos)}${rn}+${colLetter(lo.lEftpos)}${rn}`
      row[lo.cLfyOnl]  = `=${colLetter(lo.lLfyOnl)}${rn}+${colLetter(lo.dLfyOnl)}${rn}`
      row[lo.cUber]    = `=${colLetter(lo.lUber)}${rn}+${colLetter(lo.dUber)}${rn}`
      row[lo.cDD]      = `=${colLetter(lo.lDD)}${rn}+${colLetter(lo.dDD)}${rn}`
      row[lo.cCash]    = `=${colLetter(lo.lCash)}${rn}+${colLetter(lo.dCash)}${rn}`
      row[lo.cLunch]   = `=${colLetter(lo.lTotal)}${rn}`
      row[lo.cDinner]  = `=${colLetter(lo.dTotal)}${rn}`
      row[lo.cEftpos2] = `=${colLetter(lo.cEftpos)}${rn}`
      row[lo.cLfy]     = `=${colLetter(lo.lLfyOnl)}${rn}+${colLetter(lo.lLfyCard)}${rn}+${colLetter(lo.lLfyCash)}${rn}+${colLetter(lo.dLfyOnl)}${rn}+${colLetter(lo.dLfyCard)}${rn}+${colLetter(lo.dLfyCash)}${rn}`
      row[lo.cUber2]   = `=${colLetter(lo.lUber)}${rn}+${colLetter(lo.dUber)}${rn}`
      row[lo.cDin2]    = `=${colLetter(lo.cDinner)}${rn}`
      row[lo.cCash2]   = `=${colLetter(lo.lCash)}${rn}+${colLetter(lo.dCash)}${rn}`
      row[lo.cTotal]   = `=${colLetter(lo.cLunch)}${rn}+${colLetter(lo.cDinner)}${rn}`
      row[lo.cCashBag] = `=${colLetter(lo.lCashBag)}${rn}+${colLetter(lo.dCashBag)}${rn}`
      row[lo.surcharge] = ar
      row[lo.running]   = as

      // Simplified view
      row[lo.sDay]     = DAY_ABBR[di]
      row[lo.sDate]    = `=${colLetter(1)}${rn}`
      row[lo.sLEff]    = `=${colLetter(lo.lEftpos)}${rn}+${colLetter(lo.lLfyOnl)}${rn}+${colLetter(lo.lUber)}${rn}`
      row[lo.sLCash]   = `=${colLetter(lo.lCash)}${rn}`
      row[lo.sDEff]    = `=${colLetter(lo.dEftpos)}${rn}+${colLetter(lo.dLfyOnl)}${rn}+${colLetter(lo.dUber)}${rn}`
      row[lo.sDCash]   = `=${colLetter(lo.dCash)}${rn}`
      row[lo.sLTot]    = `=${colLetter(lo.sLEff)}${rn}+${colLetter(lo.sLCash)}${rn}`
      row[lo.sDTot]    = `=${colLetter(lo.sDEff)}${rn}+${colLetter(lo.sDCash)}${rn}`
      row[lo.sEffTot]  = `=${colLetter(lo.sLEff)}${rn}+${colLetter(lo.sDEff)}${rn}`
      row[lo.sCashTot] = `=${colLetter(lo.sLCash)}${rn}+${colLetter(lo.sDCash)}${rn}`
      row[lo.sTotal]   = `=${colLetter(lo.sEffTot)}${rn}+${colLetter(lo.sCashTot)}${rn}`
      row[lo.sCashBag] = `=${colLetter(lo.cCashBag)}${rn}`
      row[lo.sRunning] = bh

      rows.push(row)

      prevDataRn = rn
    }

    // ── SUM row ──────────────────────────────────────────────────────────────
    const sr    = rows.length + 1   // 1-based row number of SUM row
    const s2    = s1 + 6            // 1-based last data row (Sunday)

    const sumRow: (string | number | null)[] = new Array(lo.totalCols).fill('')
    sumRow[0]       = 'Sum'
    sumRow[lo.sDay] = 'Sum'

    // Dynamic sumCols covering all numeric columns
    const sumCols: number[] = [2, 3, 4]
    sumCols.push(lo.delTotal)  // delivery tiers handled separately below
    for (let i = lo.lEftpos;   i <= lo.lCash;     i++) sumCols.push(i)
    for (let i = lo.dEftpos;   i <= lo.dCash;     i++) sumCols.push(i)
    for (let i = lo.cEftpos;   i <= lo.running;   i++) sumCols.push(i)
    for (let i = lo.sLEff;     i <= lo.sCashBag;  i++) sumCols.push(i)

    for (const c of sumCols) sumRow[c] = sumF(c, s1, s2)
    // Delivery tiers: one merged cell =SUM(F3:K9) spanning all tier columns
    sumRow[lo.delFirst] = `=SUM(${colLetter(lo.delFirst)}${s1}:${colLetter(lo.delLast)}${s2})`
    // AU SUM row = -SUM(Total Uber Eat)
    sumRow[lo.surcharge] = `=-SUM(${colLetter(lo.cUber2)}${s1}:${colLetter(lo.cUber2)}${s2})`
    // AS in SUM row = AP_sum + AR_sum (yellow)
    sumRow[lo.running] = `=${colLetter(lo.cTotal)}${sr}+${colLetter(lo.surcharge)}${sr}`

    rows.push(sumRow)
    sumRowIndices.push(rows.length - 1)
  }

  // ── Global number formats ─────────────────────────────────────────────────
  const totalRows = rows.length
  // Integer: C through delivery total (bills + delivery counts)
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: 2, endCol: lo.delTotal + 1, numberFormat: INT_FORMAT })
  // AUD: Lunch, Dinner, Combined, Simplified
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: lo.lEftpos, endCol: lo.lCash    + 1, numberFormat: AUD_FORMAT })
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: lo.dEftpos, endCol: lo.dCash    + 1, numberFormat: AUD_FORMAT })
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: lo.cEftpos, endCol: lo.running  + 1, numberFormat: AUD_FORMAT })
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: lo.sLEff,   endCol: lo.sRunning + 1, numberFormat: AUD_FORMAT })
  // Date: B (col 1) and sDate
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: 1,          endCol: 2,               numberFormat: DATE_FORMAT })
  fmtRules.push({ startRow: 2, endRow: totalRows, startCol: lo.sDate,   endCol: lo.sDate    + 1, numberFormat: DATE_FORMAT })

  await setSheetDataUserEntered(INCOME_SHEET, rows, sid)
  await applyFormattingRules(INCOME_SHEET, sid, fmtRules)
  await applyIncomeFullFormat(sid, lo, rows.length, sumRowIndices)
}

// ── Wage 2026 ─────────────────────────────────────────────────────────────────
// Layout per week block (matches Excel Beecroft_WeeklySales_RecordsSample):
//   Row 1: "WAGE ADJUSTED" | | Monday | | Tue | | Wed | | Thu | | Fri | | Sat | | Sun
//   Row 2: "Since {date}"  | Rate | {date} | | {date} | ...
//   Row 3: (blank) | "4/4.5 hrs" | Lunch | Dinner | Lunch | Dinner | ... | extra | WAGE | TAX | CASH PAID | Remaining cash
//   Employee rows: name | rate | mon_L | mon_D | tue_L | tue_D | ... | extra | =SUM(C:Q) | TAX | PAID | =R-S-T
//   SUM row:       TOTAL | | =SUM(C) | =SUM(D) | ... | =SUM(R) | =SUM(S) | =SUM(T) | =SUM(U)
//   Day total row: | | | Mon+Tue | | Tue+Wed | ... (Lunch+Dinner combined per day in Dinner col)
//   Lunch Wage row: | | | | ... | | "Lunch Wage" | =C_sum+E_sum+...
//   Dinner Wage row: | | | | ... | | "Dinner Wage" | =D_sum+F_sum+...
//   Blank separator row
//
// Columns A(0)-U(20) = 21 columns
//   A(0)=Name  B(1)=Rate  C(2)=MonL  D(3)=MonD  E(4)=TueL  F(5)=TueD
//   G(6)=WedL  H(7)=WedD  I(8)=ThuL  J(9)=ThuD  K(10)=FriL  L(11)=FriD
//   M(12)=SatL  N(13)=SatD  O(14)=SunL  P(15)=SunD  Q(16)=Extra
//   R(17)=WAGE  S(18)=TAX  T(19)=CASH PAID  U(20)=Remaining
const WAGE_SHEET = 'Wage 2026'
const WAGE_COL_COUNT = 21

interface WageBlock {
  hStart: number              // 0-based row index of first header row
  sumIdx: number              // 0-based row index of TOTAL row
  dwIdx:  number              // 0-based row index of Dinner Wage row (last row of block)
  firstKitchenRow?: number    // 0-based row index of first Kitchen employee (for divider)
}

async function applyWageFullFormat(
  sid: string,
  totalRows: number,
  wageBlocks: WageBlock[],
): Promise<void> {
  const sheetId = await getSheetIdByName(sid, WAGE_SHEET)
  if (sheetId === undefined) return

  const BLACK        = { red: 0, green: 0, blue: 0 }
  const SOLID        = { style: 'SOLID',        color: BLACK }
  const SOLID_MEDIUM = { style: 'SOLID_MEDIUM', color: BLACK }
  const SOLID_THICK  = { style: 'SOLID_THICK',  color: BLACK }

  const requests: object[] = []

  const mrg = (sr: number, er: number, sc: number, ec: number) =>
    requests.push({ mergeCells: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, mergeType: 'MERGE_ALL' } })

  const bdr = (sr: number, er: number, sc: number, ec: number, sides: Record<string, object>) =>
    requests.push({ updateBorders: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, ...sides } })

  const cw = (col: number, width: number) =>
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: width }, fields: 'pixelSize' } })

  const cell = (sr: number, er: number, sc: number, ec: number, fmt: object, fields: string) =>
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: sr, endRowIndex: er, startColumnIndex: sc, endColumnIndex: ec }, cell: { userEnteredFormat: fmt }, fields } })

  const alignH = (sr: number, er: number, sc: number, ec: number, ha: string) =>
    cell(sr, er, sc, ec, { horizontalAlignment: ha }, 'userEnteredFormat.horizontalAlignment')

  const boldFmt = (sr: number, er: number, sc: number, ec: number) =>
    cell(sr, er, sc, ec, { textFormat: { bold: true } }, 'userEnteredFormat.textFormat.bold')

  const fontSize = (sr: number, er: number, sc: number, ec: number, size: number) =>
    cell(sr, er, sc, ec, { textFormat: { fontSize: size } }, 'userEnteredFormat.textFormat.fontSize')

  const wrapOff = (sr: number, er: number, sc: number, ec: number) =>
    cell(sr, er, sc, ec, { wrapStrategy: 'CLIP' }, 'userEnteredFormat.wrapStrategy')

  // 1. Unmerge everything first
  requests.push({ unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: WAGE_COL_COUNT } } })

  // 2. Global defaults: font 10, no wrap, left for A-B, center for C-U
  fontSize(0, totalRows, 0, WAGE_COL_COUNT, 10)
  wrapOff(0, totalRows, 0, WAGE_COL_COUNT)
  alignH(0, totalRows, 0, 2, 'LEFT')
  alignH(0, totalRows, 2, WAGE_COL_COUNT, 'CENTER')
  alignH(0, totalRows, 17, WAGE_COL_COUNT, 'RIGHT')  // WAGE-Remaining: right

  // 3. Per-block formatting
  for (const { hStart, sumIdx, dwIdx, firstKitchenRow } of wageBlocks) {
    const h0 = hStart
    const h1 = hStart + 1
    const h2 = hStart + 2

    // Merges row 0: "WAGE ADJUSTED" A:B, then each day name spans its L+D pair
    mrg(h0, h0 + 1, 0, 2)
    for (let d = 0; d < 7; d++) mrg(h0, h0 + 1, 2 + d * 2, 4 + d * 2)

    // Merges row 1: "Since…" A:B, dates also span L+D pair
    mrg(h1, h1 + 1, 0, 2)
    for (let d = 0; d < 7; d++) mrg(h1, h1 + 1, 2 + d * 2, 4 + d * 2)

    // Full thin grid for the whole block (headers → dinner wage)
    bdr(h0, dwIdx + 1, 0, WAGE_COL_COUNT, {
      top: SOLID, bottom: SOLID, left: SOLID, right: SOLID,
      innerHorizontal: SOLID, innerVertical: SOLID,
    })

    // Medium border around the entire block
    bdr(h0, dwIdx + 1, 0, 1,                    { left:   SOLID_MEDIUM })
    bdr(h0, dwIdx + 1, WAGE_COL_COUNT - 1, WAGE_COL_COUNT, { right:  SOLID_MEDIUM })
    bdr(h0, h0 + 1,   0, WAGE_COL_COUNT,        { top:    SOLID_MEDIUM })
    bdr(dwIdx, dwIdx + 1, 0, WAGE_COL_COUNT,     { bottom: SOLID_MEDIUM })

    // Medium border below header block (h2) and below SUM row
    bdr(h2, h2 + 1,     0, WAGE_COL_COUNT, { bottom: SOLID_MEDIUM })
    bdr(sumIdx, sumIdx + 1, 0, WAGE_COL_COUNT, { bottom: SOLID_MEDIUM })

    // Thick divider between Front and Kitchen employees
    if (firstKitchenRow !== undefined) {
      bdr(firstKitchenRow, firstKitchenRow + 1, 0, WAGE_COL_COUNT, { top: SOLID_THICK })
    }

    // Bold: headers, SUM, Lunch/Dinner wage labels
    boldFmt(h0, h2 + 1, 0, WAGE_COL_COUNT)
    boldFmt(sumIdx, sumIdx + 1, 0, WAGE_COL_COUNT)
    boldFmt(sumIdx + 2, dwIdx + 1, 17, 19)  // Lunch/Dinner Wage label+value

    // Font 11 for the 3 header rows
    fontSize(h0, h2 + 1, 0, WAGE_COL_COUNT, 11)
  }

  // 4. Column widths — all 100px, Remaining cash (U) = 120px
  for (let c = 0; c <= 19; c++) cw(c, 100)
  cw(20, 120)                                             // U: Remaining cash

  await batchUpdateSheet(sid, requests)
}

export async function syncWageSheet(shopCode: string): Promise<void> {
  const { sid } = await getShopDb(shopCode)
  const [employees, timeRecords, allPayments] = await Promise.all([
    listEmployees(shopCode),
    listTimeRecords(shopCode),
    getAllWagePayments(shopCode),
  ])
  const staffEmps = employees.filter((e) => !e.positions.includes('Home'))
  if (staffEmps.length === 0) return

  const weekMap = new Map<string, TimeRecord[]>()
  for (const r of timeRecords) {
    const mon = getMondayStr(r.date)
    if (!weekMap.has(mon)) weekMap.set(mon, [])
    weekMap.get(mon)!.push(r)
  }
  const sortedWeeks = [...weekMap.keys()].sort()
  if (sortedWeeks.length === 0) return

  const rows: (string | number | null)[][] = []
  const fmtRules: SheetFormatRule[] = []
  const wageBlocks: WageBlock[] = []

  // Colors (exact RGB from Test2 reference sheet)
  const W_WAGE         = { red: 0.714, green: 0.843, blue: 0.659 }  // #B6D7A8 green     (WAGE col — employee rows)
  const W_SUM_WAGE     = { red: 0.416, green: 0.659, blue: 0.310 }  // #6AA84F dark green (WAGE col — TOTAL row)
  const W_TAX          = { red: 0.8,   green: 0.8,   blue: 0.8   }  // #CCCCCC grey      (TAX col)
  const W_YELLOW       = { red: 1,     green: 1,     blue: 0     }  // #FFFF00 yellow    (WAGE ADJUSTED header A-B)
  const W_GREY         = { red: 0.718, green: 0.718, blue: 0.718 }  // #B7B7B7 grey      (day name headers + Extra row)
  const W_LGREY        = { red: 0.937, green: 0.937, blue: 0.937 }  // #EFEFEF light grey (row 3 cols C-P)
  const W_SALE_BG      = { red: 0.851, green: 0.851, blue: 0.851 }  // #D9D9D9 light grey (SALE row)
  const W_RATE_COL     = { red: 0.812, green: 0.886, blue: 0.953 }  // #CFE2F3 blue      (Rate col B + TOTAL/totals rows)
  const W_FRONT_LUNCH  = { red: 1,     green: 0.898, blue: 0.6   }  // #FFE599 yellow    (Front Lunch cell)
  const W_FRONT_DINNER = { red: 0.976, green: 0.796, blue: 0.612 }  // #F9CB9C peach     (Front Dinner cell)
  const W_KITCH_LUNCH  = { red: 1,     green: 1,     blue: 0     }  // #FFFF00 yellow    (Kitchen Lunch cell)
  const W_KITCH_DINNER = { red: 0.851, green: 0.918, blue: 0.827 }  // #D9EAD3 green     (Kitchen Dinner cell)

  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  for (const monday of sortedWeeks) {
    const weekDates = getWeekDates(monday)
    const hStart = rows.length  // 0-based index of first header row

    // ── Header row 1: "WAGE ADJUSTED" + day names ──
    const hdr1: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    hdr1[0] = 'WAGE ADJUSTED'
    for (let d = 0; d < 7; d++) hdr1[2 + d * 2] = DAY_NAMES[d]
    rows.push(hdr1)

    // ── Header row 2: "Since {date}" + dates as D/M/YYYY string ──
    const hdr2: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    hdr2[0] = `Since ${monday}`
    hdr2[1] = 'Rate'
    for (let d = 0; d < 7; d++) {
      const [yy, mm, dd] = weekDates[d].split('-')
      hdr2[2 + d * 2] = `${parseInt(dd)}/${parseInt(mm)}/${yy}`
    }
    rows.push(hdr2)

    // ── Header row 3: shift sub-labels ──
    const hdr3: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    hdr3[1] = '4/4.5 hrs'
    for (let d = 0; d < 7; d++) {
      hdr3[2 + d * 2]     = 'Lunch'
      hdr3[2 + d * 2 + 1] = 'Dinner'
    }
    hdr3[16] = 'extra'
    hdr3[17] = 'WAGE'
    hdr3[18] = 'TAX'
    hdr3[19] = 'CASH PAID'
    hdr3[20] = 'Remaining cash'
    rows.push(hdr3)

    // Rows 1-2: Yellow for A-B, grey for day name columns (C-P)
    fmtRules.push({ startRow: hStart,     endRow: hStart + 2, startCol: 0,  endCol: 2,  backgroundColor: W_YELLOW, bold: true })
    fmtRules.push({ startRow: hStart,     endRow: hStart + 2, startCol: 2,  endCol: 16, backgroundColor: W_GREY,   bold: true })
    // Row 3: all Lunch/Dinner cols (C-P) = light grey, cols A-B and Q-U = no color
    fmtRules.push({ startRow: hStart + 2, endRow: hStart + 3, startCol: 2, endCol: 16, backgroundColor: W_LGREY, bold: true })

    // ── Employee rows ──────────────────────────────────────────────────────────
    const weekRecords = weekMap.get(monday) ?? []
    const empStart = rows.length + 1  // 1-based sheet row of first employee

    // Sort: Front first, then Kitchen
    const sortedStaff = [
      ...staffEmps.filter((e) => e.positions.includes('Front') && !e.positions.includes('Kitchen')),
      ...staffEmps.filter((e) => e.positions.includes('Front') && e.positions.includes('Kitchen')),
      ...staffEmps.filter((e) => !e.positions.includes('Front') && !e.positions.includes('Kitchen')),
      ...staffEmps.filter((e) => !e.positions.includes('Front') && e.positions.includes('Kitchen')),
    ]
    const firstKitchenOffset = sortedStaff.findIndex((e) => e.positions.includes('Kitchen') && !e.positions.includes('Front'))
    const firstKitchenRow = firstKitchenOffset >= 0 ? rows.length + firstKitchenOffset : undefined

    for (const emp of sortedStaff) {
      const rn = rows.length + 1  // 1-based sheet row
      const wl = emp.wageLunch  ?? (emp.hourlyWage ?? 0)
      const wd = emp.wageDinner ?? (emp.hourlyWage ?? 0)
      const hourly = emp.hourlyWage ?? 0
      const shiftWage = (hrs: number, isLunch: boolean) => {
        if (hrs <= 0) return 0
        if (isLunch  && hrs === 4)   return wl
        if (!isLunch && hrs === 4.5) return wd
        return hourly * hrs
      }
      const empRow: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
      empRow[0] = emp.name
      empRow[1] = wl > 0 || wd > 0 ? `${wl}/${wd}` : ''
      const isFront   = emp.positions.includes('Front')
      const isKitchen = emp.positions.includes('Kitchen')
      const lunchColor  = isFront ? W_FRONT_LUNCH  : isKitchen ? W_KITCH_LUNCH  : null
      const dinnerColor = isFront ? W_FRONT_DINNER : isKitchen ? W_KITCH_DINNER : null
      const rowIdx = rows.length  // 0-based index this row will get after push
      // Rate column (B) background
      fmtRules.push({ startRow: rowIdx, endRow: rowIdx + 1, startCol: 1, endCol: 2, backgroundColor: W_RATE_COL })
      for (let d = 0; d < 7; d++) {
        const rec = weekRecords.find((r) => r.date === weekDates[d] && r.employeeId === emp.id)
        const pmt = allPayments.get(monday)?.get(emp.id)
        const lv = pmt?.overrides?.[`${d}L`] ?? (rec ? shiftWage(rec.morning, true)  : 0)
        const dv = pmt?.overrides?.[`${d}D`] ?? (rec ? shiftWage(rec.evening, false) : 0)
        if (lv > 0) {
          empRow[2 + d * 2] = lv
          if (lunchColor) fmtRules.push({ startRow: rowIdx, endRow: rowIdx + 1, startCol: 2 + d * 2, endCol: 2 + d * 2 + 1, backgroundColor: lunchColor })
        }
        if (dv > 0) {
          empRow[2 + d * 2 + 1] = dv
          if (dinnerColor) fmtRules.push({ startRow: rowIdx, endRow: rowIdx + 1, startCol: 3 + d * 2, endCol: 3 + d * 2 + 1, backgroundColor: dinnerColor })
        }
      }
      empRow[17] = `=SUM(C${rn}:Q${rn})`
      const pmt = allPayments.get(monday)?.get(emp.id)
      empRow[18] = pmt?.tax  ?? ''
      empRow[19] = pmt?.paid ?? ''
      empRow[20] = `=R${rn}-S${rn}-T${rn}`
      rows.push(empRow)
    }

    const empEnd = rows.length  // 1-based sheet row of last employee

    // ── SUM row ──────────────────────────────────────────────────────────────
    const sumRn = rows.length + 1
    const sumRow: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    sumRow[0] = 'TOTAL'
    for (let c = 2; c <= 20; c++) {
      sumRow[c] = `=SUM(${colLetter(c)}${empStart}:${colLetter(c)}${empEnd})`
    }
    rows.push(sumRow)
    const sumIdx = rows.length - 1

    // ── Day totals row: Lunch+Dinner combined in the Dinner column ──────────
    const totRow: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    for (let d = 0; d < 7; d++) {
      const lC = colLetter(2 + d * 2)      // Lunch col letter
      const dC = colLetter(3 + d * 2)      // Dinner col letter
      totRow[3 + d * 2] = `=${lC}${sumRn}+${dC}${sumRn}`
    }
    totRow[18] = `=S${sumRn}+T${sumRn}`   // Tax + Paid total
    rows.push(totRow)

    // ── Extra row ─────────────────────────────────────────────────────────────
    const lwRow: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    lwRow[0]  = 'Extra'
    lwRow[17] = 'Lunch Wage'
    const lunchSum = [0, 2, 4, 6, 8, 10, 12].map((d) => `${colLetter(2 + d)}${sumRn}`).join('+')
    lwRow[18] = `=${lunchSum}`
    rows.push(lwRow)

    // ── SALE row ──────────────────────────────────────────────────────────────
    const dwRow: (string | number | null)[] = new Array(WAGE_COL_COUNT).fill('')
    dwRow[0]  = 'SALE'
    dwRow[17] = 'Dinner Wage'
    const dinnerSum = [0, 2, 4, 6, 8, 10, 12].map((d) => `${colLetter(3 + d)}${sumRn}`).join('+')
    const extraRef   = `${colLetter(16)}${sumRn}`  // Q = extra
    dwRow[18] = `=${dinnerSum}+${extraRef}`
    rows.push(dwRow)

    // ── Blank separator (5 rows) ─────────────────────────────────────────────
    for (let i = 0; i < 5; i++) rows.push(new Array(WAGE_COL_COUNT).fill(''))

    // ── Colors ────────────────────────────────────────────────────────────────
    // TOTAL row (19): A-B=white, C-Q+S-U=#CFE2F3, WAGE(R)=#6AA84F
    fmtRules.push({ startRow: sumIdx, endRow: sumIdx + 1, startCol: 2,  endCol: 17,           backgroundColor: W_RATE_COL })
    fmtRules.push({ startRow: sumIdx, endRow: sumIdx + 1, startCol: 17, endCol: 18,           backgroundColor: W_SUM_WAGE })
    fmtRules.push({ startRow: sumIdx, endRow: sumIdx + 1, startCol: 18, endCol: WAGE_COL_COUNT, backgroundColor: W_RATE_COL })
    // Day totals row (20): A-B=white, C-U=#CFE2F3
    const totIdx = sumIdx + 1
    fmtRules.push({ startRow: totIdx, endRow: totIdx + 1, startCol: 2, endCol: WAGE_COL_COUNT, backgroundColor: W_RATE_COL })
    // Extra row (21): all grey #B7B7B7
    fmtRules.push({ startRow: sumIdx + 2, endRow: sumIdx + 3, startCol: 0, endCol: WAGE_COL_COUNT, backgroundColor: W_GREY })
    // SALE row (22): all light grey #D9D9D9
    fmtRules.push({ startRow: sumIdx + 3, endRow: sumIdx + 4, startCol: 0, endCol: WAGE_COL_COUNT, backgroundColor: W_SALE_BG })
    // WAGE (R=17) and TAX (S=18) column colors for employee rows only
    fmtRules.push({ startRow: sumIdx - sortedStaff.length, endRow: sumIdx, startCol: 17, endCol: 18, backgroundColor: W_WAGE })
    fmtRules.push({ startRow: sumIdx - sortedStaff.length, endRow: sumIdx, startCol: 18, endCol: 19, backgroundColor: W_TAX })

    const dwIdx = sumIdx + 3  // Dinner Wage row
    wageBlocks.push({ hStart, sumIdx, dwIdx, firstKitchenRow })
  }

  // ── Global number formats (applied across all rows) ──────────────────────
  const totalRows = rows.length
  // AUD: wage/money columns C-R(17) and U(20)
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 2, endCol: 18, numberFormat: AUD_FORMAT })
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 20, endCol: 21, numberFormat: AUD_FORMAT })

  await setSheetDataUserEntered(WAGE_SHEET, rows, sid)
  await applyFormattingRules(WAGE_SHEET, sid, fmtRules, 500)
  await applyWageFullFormat(sid, totalRows, wageBlocks)
}

// ── Sum 2026 ──────────────────────────────────────────────────────────────────
// Per-week layout matching Excel (left: daily revenue + wage; right: expenses)
//
// Left side cols A(0)-K(10):
//   A(0)=blank  B(1)=DayName/Label  C(2)=Date/Value
//   D(3)=LunchCredit  E(4)=LunchCash  F(5)=DinnerCredit  G(6)=DinnerCash
//   H(7)=TotalCredit  I(8)=TotalCash  J(9)=GrandTotal  K(10)=blank
//
// Right side cols L(11)-Q(16):
//   L(11)=DayAbbr  M(12)=Date  N(13)=Description  O(14)=blank  P(15)=Amount  Q(16)=Notes
//
// Total: 17 columns (A-Q)
const SUM_SHEET = 'Sum 2026'
const SUM_COL_COUNT = 19
const SUM_BLOCK     = 45   // rows per week block: rel 0 blank + rel 1-40 data + rel 41-44 trailing blanks (5 gap rows between weeks)

export async function syncSumSheet(shopCode: string): Promise<void> {
  const { sid } = await getShopDb(shopCode)
  const [employees, timeRecords, deliveryTrips, revenue, expenses, allPayments] = await Promise.all([
    listEmployees(shopCode, true),
    listTimeRecords(shopCode),
    listDeliveryTrips(shopCode),
    listRevenue(shopCode),
    listExpenses(shopCode),
    getAllWagePayments(shopCode),
  ])

  // Sort staff: Front-only → Front+Kitchen → unlabeled → Kitchen-only
  const sortedStaff = [
    ...employees.filter((e) => !e.fired && !e.positions.includes('Home') && e.positions.includes('Front')  && !e.positions.includes('Kitchen')),
    ...employees.filter((e) => !e.fired && !e.positions.includes('Home') && e.positions.includes('Front')  &&  e.positions.includes('Kitchen')),
    ...employees.filter((e) => !e.fired && !e.positions.includes('Home') && !e.positions.includes('Front') && !e.positions.includes('Kitchen')),
    ...employees.filter((e) => !e.fired && !e.positions.includes('Home') && !e.positions.includes('Front') &&  e.positions.includes('Kitchen')),
  ]
  const activeCount   = Math.min(sortedStaff.length, 18)
  const wageStartRel  = 15 + activeCount + 2  // 2 blank rows after last employee

  const weekSet = new Set<string>()
  for (const e of revenue)     weekSet.add(getMondayStr(e.date))
  for (const e of expenses)    weekSet.add(getMondayStr(e.date))
  for (const r of timeRecords) weekSet.add(getMondayStr(r.date))
  const sortedWeeks = [...weekSet].sort()
  if (sortedWeeks.length === 0) return

  function fmtD(d: string): string {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  function shiftWage(emp: Employee, hrs: number, isLunch: boolean): number {
    if (hrs <= 0) return 0
    const h = emp.hourlyWage ?? 0
    return isLunch ? (emp.wageLunch ?? h * hrs) : (emp.wageDinner ?? h * hrs)
  }

  const mealCredit = (m: MealRevenue) => m.eftpos + m.lfyOnline + m.uberOnline + m.doorDash
  const mealCash   = (m: MealRevenue) => m.totalSale - mealCredit(m)

  const DAY_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

  // Colors — exact values read from Sheet5 via Sheets API
  const C_YELLOW   = { red: 1,         green: 1,         blue: 0         }  // section headers
  const C_SALMON   = { red: 0.9882353, green: 0.8941177, blue: 0.8392157 }  // wage date header
  const C_GREY_BG  = { red: 0.7882353, green: 0.7882353, blue: 0.7882353 }  // Cash sales I, SUM I
  const C_LT_GRN   = { red: 0.6627451, green: 0.8156863, blue: 0.5568628 }  // Expenses, Total Expenses
  const C_LT_BLUE  = { red: 0.7058824, green: 0.7764706, blue: 0.9058824 }  // Wage Cash I, Wage CASH C
  const C_VLT_GRN  = { red: 0.8862745, green: 0.9372549, blue: 0.8549020 }  // Remaining row
  const C_DATA_GRY = { red: 0.3490196, green: 0.3490196, blue: 0.3490196 }  // revenue data text D-G
  const C_SUM_BLUE = { red: 0.2,       green: 0.2470588, blue: 0.3098039 }  // SUM row text D-G

  const rows: (string | number | null)[][] = []
  const fmtRules: SheetFormatRule[] = []

  for (const monday of sortedWeeks) {
    const weekDates  = getWeekDates(monday)
    const sunday     = weekDates[6]
    const wRev       = revenue.filter((e) => weekDates.includes(e.date))
    const wExp       = expenses.filter((e) => weekDates.includes(e.date)).sort((a, b) => a.date.localeCompare(b.date))
    const wRec       = timeRecords.filter((r) => weekDates.includes(r.date))
    const wTrips     = deliveryTrips.filter((t) => weekDates.includes(t.date))
    const weekPmts   = allPayments.get(monday)

    // blockStart1 = 1-based absolute row where this block starts
    const blockStart1 = rows.length + 1
    const R = (rel: number) => blockStart1 + rel

    // Block layout verified against Sheet5 (41 rows, rel 0-40)
    const blk: (string | number | null)[][] =
      Array.from({ length: SUM_BLOCK }, () => new Array(SUM_COL_COUNT).fill(''))

    // ── rel 0: blank separator ────────────────────────────────────────────────

    // ── rel 1: Section headers (D=Lunch, F=Dinner, H=Total, L=EXPENSES) ──────
    blk[1][3]  = 'Lunch'
    blk[1][5]  = 'Dinner'
    blk[1][7]  = 'Total'
    blk[1][11] = `EXPENSES ${fmtD(monday)} to ${fmtD(sunday)}`

    // ── rel 2: Credit/Cash sub-headers (D-J) + expense sub-headers ─────────
    blk[2][3] = 'Credit'; blk[2][4] = 'Cash'
    blk[2][5] = 'Credit'; blk[2][6] = 'Cash'
    blk[2][7] = 'Credit'; blk[2][8] = 'Cash'; blk[2][9] = 'Grand Total'
    blk[2][15] = '$'; blk[2][16] = 'Status'; blk[2][17] = 'Due Date'; blk[2][18] = 'Payment Type'

    // ── rel 3-9: Revenue rows Mon-Sun (B=day, C=date, D-J=amounts) ───────────
    for (let d = 0; d < 7; d++) {
      const rel  = 3 + d
      const date = weekDates[d]
      blk[rel][1] = DAY_FULL[d]
      blk[rel][2] = fmtD(date)
      const rev = wRev.find((r) => r.date === date)
      if (rev) {
        const lC = mealCredit(rev.lunch),  lCash = mealCash(rev.lunch)
        const dC = mealCredit(rev.dinner), dCash = mealCash(rev.dinner)
        blk[rel][3] = lC    || ''; blk[rel][4] = lCash        || ''
        blk[rel][5] = dC    || ''; blk[rel][6] = dCash        || ''
        blk[rel][7] = lC+dC || ''; blk[rel][8] = lCash+dCash || ''
        blk[rel][9] = (rev.lunch.totalSale + rev.dinner.totalSale) || ''
      }
    }

    // ── rel 10: Revenue SUM totals (D-J) ─────────────────────────────────────
    for (let c = 3; c <= 9; c++)
      blk[10][c] = `=SUM(${colLetter(c)}${R(3)}:${colLetter(c)}${R(9)})`

    // ── rel 11: blank ─────────────────────────────────────────────────────────

    // ── rel 12: Wage date header (B) ──────────────────────────────────────────
    blk[12][1] = `${fmtD(monday)} To ${fmtD(sunday)}`

    // ── rel 13: WAGE/TAX/PAID column headers (C/D/E) ─────────────────────────
    blk[13][2] = 'WAGE'; blk[13][3] = 'TAX'; blk[13][4] = 'PAID'

    // ── rel 14: blank ─────────────────────────────────────────────────────────

    // ── rel 15..: Employee rows (B=name, C=WAGE, D=TAX, E=PAID) ─────────────
    for (let i = 0; i < activeCount; i++) {
      const rel = 15 + i
      const emp = sortedStaff[i]
      const pmt = weekPmts?.get(emp.id)
      const ov  = pmt?.overrides ?? {}
      let wage  = 0
      for (let d = 0; d < 7; d++) {
        const rec = wRec.find((r) => r.date === weekDates[d] && r.employeeId === emp.id)
        wage += ov[`${d}L`] ?? (rec ? shiftWage(emp, rec.morning, true)  : 0)
        wage += ov[`${d}D`] ?? (rec ? shiftWage(emp, rec.evening, false) : 0)
      }
      blk[rel][1] = emp.name
      blk[rel][2] = wage > 0 ? wage : ''
      blk[rel][3] = pmt?.tax  ? pmt.tax  : ''
      blk[rel][4] = pmt?.paid ? pmt.paid : ''
    }

    // ── Cash flow (G=6 labels, H=7 total-labels, I=8 amounts) ────────────────
    const totalCashRev = wRev.reduce((s, r) => s + mealCash(r.lunch) + mealCash(r.dinner), 0)
    const totalExpAmt  = wExp.reduce((s, e) => s + e.total, 0)
    const cashInBag    = wRev.reduce((s, r) => s + (r.lunch.cashLeftInBag ?? 0) + (r.dinner.cashLeftInBag ?? 0), 0)

    // rel 21: Cash sales
    blk[21][6] = 'Cash sales';           blk[21][8] = totalCashRev > 0 ? totalCashRev : ''
    // rel 22: cash from bank (manual)
    blk[22][6] = 'cash from bank'
    // rel 24: Total cash = Cash sales + cash from bank
    blk[24][7] = 'Total cash';           blk[24][8] = `=I${R(21)}+I${R(22)}`
    // rel 30: Expenses
    blk[30][6] = 'Expenses';             blk[30][8] = totalExpAmt > 0 ? totalExpAmt : ''
    // rel 31: Wage (Cash) = dynamic — references Wage(CASH) at wageStartRel+2
    blk[31][6] = 'Wage (Cash)';          blk[31][8] = `=C${R(wageStartRel + 2)}`
    // rel 33: Total Exp.
    blk[33][7] = 'Total Exp.';           blk[33][8] = `=I${R(30)}+I${R(31)}`
    // rel 35: Remaining
    blk[35][6] = 'Remaining';            blk[35][8] = `=I${R(24)}-I${R(33)}`
    // rel 37: Cash left in the bag
    blk[37][6] = 'Cash left in the bag'; blk[37][8] = cashInBag > 0 ? cashInBag : ''

    // ── Wage totals: 2 blank rows after last employee (dynamic position) ──────
    const WS = wageStartRel
    blk[WS][1]   = 'Total Wage'
    blk[WS][2]   = `=SUM(C${R(15)}:C${R(14 + activeCount)})`
    blk[WS+1][1] = 'TAX/PAID'
    blk[WS+1][2] = `=SUM(D${R(15)}:D${R(14+activeCount)})+SUM(E${R(15)}:E${R(14+activeCount)})`
    blk[WS+1][13] = 'Total Expenses'
    blk[WS+1][15] = totalExpAmt > 0 ? totalExpAmt : ''
    blk[WS+2][1] = 'Wage (CASH)'
    blk[WS+2][2] = `=C${R(WS)}-C${R(WS+1)}`

    // ── Expense list (L=11, M=12, N=13, P=15) — starts at rel 4, max 32 slots
    // Merge regular expenses + per-day delivery fees as "Home" entries
    const tripFeeByDate = new Map<string, number>()
    for (const t of wTrips) {
      if (t.fee > 0) tripFeeByDate.set(t.date, (tripFeeByDate.get(t.date) ?? 0) + t.fee)
    }
    const expRows: { date: string; label: string; amount: number; paid: boolean; dueDate: string; paymentMethod: string }[] = [
      ...wExp.map((e) => ({ date: e.date, label: e.supplier || e.description, amount: e.total, paid: e.paid, dueDate: e.dueDate ?? '', paymentMethod: e.paymentMethod ?? '' })),
      ...[...tripFeeByDate.entries()].map(([date, fee]) => ({ date, label: 'Home', amount: fee, paid: true, dueDate: '', paymentMethod: 'Cash' })),
    ]
    expRows.sort((a, b) => a.date.localeCompare(b.date))

    let expSlot    = 0
    let lastExpDate = ''
    const paidRels: number[] = []   // relative row indices for Paid
    const unpaidRels: number[] = [] // relative row indices for Unpaid
    for (const row of expRows) {
      if (expSlot >= 32) break
      const rel = 4 + expSlot
      if (row.date !== lastExpDate) {
        const di = weekDates.indexOf(row.date)
        blk[rel][11] = di >= 0 ? DAY_ABBR[di] : ''
        blk[rel][12] = fmtD(row.date)
        lastExpDate  = row.date
      }
      blk[rel][13] = row.label
      blk[rel][15] = row.amount
      blk[rel][16] = row.paid ? 'Paid' : 'Unpaid'
      blk[rel][17] = row.dueDate
      blk[rel][18] = row.paymentMethod
      if (row.paid) paidRels.push(rel)
      else unpaidRels.push(rel)
      expSlot++
    }

    for (const row of blk) rows.push(row)

    // ── Format rules (0-based absolute rows) ─────────────────────────────────
    const bs = blockStart1 - 1

    // rel 1: yellow section headers (Lunch D-E, Dinner F-G, Total H-J, EXPENSES L-P)
    fmtRules.push({ startRow: bs+1, endRow: bs+2, startCol: 3,  endCol: 5,  backgroundColor: C_YELLOW, bold: true })
    fmtRules.push({ startRow: bs+1, endRow: bs+2, startCol: 5,  endCol: 7,  backgroundColor: C_YELLOW, bold: true })
    fmtRules.push({ startRow: bs+1, endRow: bs+2, startCol: 7,  endCol: 10, backgroundColor: C_YELLOW, bold: true })
    fmtRules.push({ startRow: bs+1, endRow: bs+2, startCol: 11, endCol: 19, backgroundColor: C_YELLOW, bold: true })
    // rel 2: sub-headers bold (D-J)
    fmtRules.push({ startRow: bs+2, endRow: bs+3, startCol: 3, endCol: 10, bold: true })
    // rel 3-9: B bold; D-G dark grey text
    fmtRules.push({ startRow: bs+3, endRow: bs+10, startCol: 1, endCol: 2, bold: true })
    fmtRules.push({ startRow: bs+3, endRow: bs+10, startCol: 3, endCol: 7, foregroundColor: C_DATA_GRY })
    // rel 10: SUM row — D-G dark blue bold; I grey bg
    fmtRules.push({ startRow: bs+10, endRow: bs+11, startCol: 3, endCol: 7, foregroundColor: C_SUM_BLUE, bold: true })
    fmtRules.push({ startRow: bs+10, endRow: bs+11, startCol: 8, endCol: 9, backgroundColor: C_GREY_BG })
    // rel 12: wage date header salmon (B-E)
    fmtRules.push({ startRow: bs+12, endRow: bs+13, startCol: 1, endCol: 5, backgroundColor: C_SALMON, bold: true })
    // rel 13: WAGE/TAX/PAID headers bold (B-E)
    fmtRules.push({ startRow: bs+13, endRow: bs+14, startCol: 1, endCol: 5, bold: true })
    // rel 21: grey bg on I (8) — Cash sales value
    fmtRules.push({ startRow: bs+21, endRow: bs+22, startCol: 8, endCol: 9, backgroundColor: C_GREY_BG })
    // rel 30: light green bg on I (8) — Expenses
    fmtRules.push({ startRow: bs+30, endRow: bs+31, startCol: 8, endCol: 9, backgroundColor: C_LT_GRN })
    // rel 31: light blue bg on I (8) — Wage Cash
    fmtRules.push({ startRow: bs+31, endRow: bs+32, startCol: 8, endCol: 9, backgroundColor: C_LT_BLUE })
    // rel 35: very light green bg on G (6), I (8), J (9) — Remaining
    fmtRules.push({ startRow: bs+35, endRow: bs+36, startCol: 6, endCol: 7,  backgroundColor: C_VLT_GRN })
    fmtRules.push({ startRow: bs+35, endRow: bs+36, startCol: 8, endCol: 10, backgroundColor: C_VLT_GRN })
    // Wage totals (dynamic): bold on B-E; Total Expenses N bold + P green; Wage CASH C blue
    const WF = wageStartRel
    fmtRules.push({ startRow: bs+WF, endRow: bs+WF+3, startCol: 1, endCol: 5, bold: true })
    fmtRules.push({ startRow: bs+WF+1, endRow: bs+WF+2, startCol: 13, endCol: 14, bold: true })
    fmtRules.push({ startRow: bs+WF+1, endRow: bs+WF+2, startCol: 15, endCol: 16, backgroundColor: C_LT_GRN })
    fmtRules.push({ startRow: bs+WF+2, endRow: bs+WF+3, startCol: 2, endCol: 3, backgroundColor: C_LT_BLUE })
    // Expense Status column: green for Paid, red for Unpaid
    const C_PAID_GRN  = { red: 0.2980392, green: 0.6862745, blue: 0.3137255 }
    const C_UNPAID_RD = { red: 0.8980392, green: 0.2235294, blue: 0.2078431 }
    const C_WHITE     = { red: 1, green: 1, blue: 1 }
    for (const rel of paidRels) {
      fmtRules.push({ startRow: bs+rel, endRow: bs+rel+1, startCol: 16, endCol: 17, backgroundColor: C_PAID_GRN, foregroundColor: C_WHITE, bold: true })
    }
    for (const rel of unpaidRels) {
      fmtRules.push({ startRow: bs+rel, endRow: bs+rel+1, startCol: 16, endCol: 17, backgroundColor: C_UNPAID_RD, foregroundColor: C_WHITE, bold: true })
    }
  }

  // ── Global number formats ─────────────────────────────────────────────────
  const totalRows = rows.length
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 3,  endCol: 10, numberFormat: AUD_FORMAT }) // D-J revenue
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 2,  endCol: 3,  numberFormat: AUD_FORMAT }) // C wage amounts
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 8,  endCol: 9,  numberFormat: AUD_FORMAT }) // I cash flow
  fmtRules.push({ startRow: 0, endRow: totalRows, startCol: 15, endCol: 16, numberFormat: AUD_FORMAT }) // P expense $

  // ── Get sheetId for merges ────────────────────────────────────────────────
  const sheetId = await getSheetIdByName(sid, SUM_SHEET)
  if (sheetId === undefined) return

  // Clear existing merges before rewriting (must unmerge each exact range individually)
  await clearSheetMerges(sid, sheetId)

  await setSheetDataUserEntered(SUM_SHEET, rows, sid)
  await applyFormattingRules(SUM_SHEET, sid, fmtRules, totalRows + 5)

  // ── Cell merges per week ──────────────────────────────────────────────────
  const mergeReqs: object[] = []
  for (let wi = 0; wi < sortedWeeks.length; wi++) {
    const bs = wi * SUM_BLOCK
    const merge = (r0: number, r1: number, c0: number, c1: number) =>
      mergeReqs.push({ mergeCells: { range: { sheetId, startRowIndex: bs+r0, endRowIndex: bs+r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } })
    merge(1, 2,  3,  5)   // Lunch header D-E
    merge(1, 2,  5,  7)   // Dinner header F-G
    merge(1, 2,  7,  10)  // Total header H-J
    merge(1, 2,  11, 19)  // EXPENSES header L-S
    merge(12, 13, 1, 5)   // Wage date header B-E
  }
  if (mergeReqs.length > 0) await batchUpdateSheet(sid, mergeReqs)

  // ── Structural borders — data-driven per week ────────────────────────────
  const SOLID_BLK = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0, alpha: 1 } }
  const borderReqs: object[] = []

  for (let wi = 0; wi < sortedWeeks.length; wi++) {
    const bs  = wi * SUM_BLOCK
    const bdr = (r0: number, r1: number, c0: number, c1: number, edges: Record<string, object>) =>
      borderReqs.push({ updateBorders: { range: { sheetId, startRowIndex: bs+r0, endRowIndex: bs+r1, startColumnIndex: c0, endColumnIndex: c1 }, ...edges } })

    // ── Clear all borders in this block first ────────────────────────────────
    const NONE = { style: 'NONE' }
    bdr(0, SUM_BLOCK, 0, SUM_COL_COUNT, { top: NONE, bottom: NONE, left: NONE, right: NONE, innerHorizontal: NONE, innerVertical: NONE })

    // ── Revenue table: outer box + inner grid (rel 1-10, cols B-J = 1-9) ────
    bdr(1, 11, 1, 10, {
      top: SOLID_BLK, bottom: SOLID_BLK, left: SOLID_BLK, right: SOLID_BLK,
      innerHorizontal: SOLID_BLK, innerVertical: SOLID_BLK,
    })

    // ── Employee section box (B=1..E=4): wraps header + actual employee rows ─
    if (activeCount > 0) {
      const empEnd = 15 + activeCount  // exclusive
      bdr(13, empEnd, 1, 5, { top: SOLID_BLK })
      bdr(13, empEnd, 1, 2, { left: SOLID_BLK })
      bdr(13, empEnd, 4, 5, { right: SOLID_BLK })
      bdr(empEnd - 1, empEnd, 1, 5, { bottom: SOLID_BLK })
    }

    // ── Wage totals box (B-E): dynamic position 2 rows after last employee ──
    const WB = wageStartRel
    bdr(WB, WB + 3, 1, 5, {
      top: SOLID_BLK, bottom: SOLID_BLK, left: SOLID_BLK, right: SOLID_BLK,
    })

    // ── Cash flow box (G-J): rel 18-37 (Cash left in the bag is last row) ───
    bdr(18, 38, 6, 10, {
      top: SOLID_BLK, bottom: SOLID_BLK, left: SOLID_BLK, right: SOLID_BLK,
    })
  }
  if (borderReqs.length > 0) await batchUpdateSheet(sid, borderReqs)
}

// ── OverAll ───────────────────────────────────────────────────────────────────
// Weekly summary matching Excel: Weekly | Income | Expense | Wage | Extra+Surcharge
// Columns A-F (6 columns)
const OVERALL_SHEET = 'OverAll'
const OVERALL_HEADERS = ['Weekly', 'Income', 'Expense', 'Wage', 'Delivery Fee', 'Cash Leave']

export async function syncOverAllSheet(shopCode: string): Promise<void> {
  const { sid } = await getShopDb(shopCode)
  const [employees, timeRecords, deliveryTrips, revenue, expenses] = await Promise.all([
    listEmployees(shopCode, true),
    listTimeRecords(shopCode),
    listDeliveryTrips(shopCode),
    listRevenue(shopCode),
    listExpenses(shopCode),
  ])

  const weekSet = new Set<string>()
  for (const e of revenue)  weekSet.add(getMondayStr(e.date))
  for (const e of expenses) weekSet.add(getMondayStr(e.date))
  for (const r of timeRecords) weekSet.add(getMondayStr(r.date))
  const sortedWeeks = [...weekSet].sort()
  if (sortedWeeks.length === 0) return

  const rows: (string | number | null)[][] = [OVERALL_HEADERS]
  const fmtRules: SheetFormatRule[] = []
  fmtRules.push({ startRow: 0, endRow: 1, startCol: 0, endCol: OVERALL_HEADERS.length, backgroundColor: C_ORANGE, bold: true })

  for (const monday of sortedWeeks) {
    const weekDates = getWeekDates(monday)
    const sunday    = weekDates[6]
    const wRev   = revenue.filter((e) => weekDates.includes(e.date))
    const wExp   = expenses.filter((e) => weekDates.includes(e.date))
    const wRec   = timeRecords.filter((r) => weekDates.includes(r.date))
    const wTrips = deliveryTrips.filter((t) => weekDates.includes(t.date))

    const totalSale   = wRev.reduce((s, e) => s + e.lunch.totalSale + e.dinner.totalSale, 0)
    const totalExp    = wExp.reduce((s, e) => s + e.total, 0)
    const staffWage   = employees.filter((e) => !e.positions.includes('Home')).reduce((sum, emp) => {
      const rate = emp.hourlyWage ?? 0
      return sum + wRec.filter((r) => r.employeeId === emp.id)
        .reduce((s, r) => s + (r.morning > 0 ? rate : 0) + (r.evening > 0 ? rate : 0), 0)
    }, 0)
    const deliveryFee = wTrips.reduce((s, t) => s + t.fee, 0)
    const cashRevenue = wRev.reduce((s, e) => {
      const cs = (m: MealRevenue) => m.totalSale - m.eftpos - m.lfyOnline - m.uberOnline - m.doorDash
      return s + cs(e.lunch) + cs(e.dinner)
    }, 0)
    const cashExp     = wExp.filter((e) => e.paymentMethod === 'Cash').reduce((s, e) => s + e.total, 0)
    const cashLeave   = cashRevenue - cashExp - staffWage - deliveryFee

    rows.push([`${monday} - ${sunday}`, totalSale, totalExp, staffWage, deliveryFee, cashLeave])
  }

  // AUD format all numeric columns B-F
  const totalRows = rows.length
  fmtRules.push({ startRow: 1, endRow: totalRows, startCol: 1, endCol: 6, numberFormat: AUD_FORMAT })

  await setSheetDataUserEntered(OVERALL_SHEET, rows, sid)
  await applyFormattingRules(OVERALL_SHEET, sid, fmtRules)
}

// ── Sync all report sheets ────────────────────────────────────────────────────

export async function syncAllReportSheets(shopCode: string): Promise<void> {
  const { sid } = await getShopDb(shopCode)
  await syncIncomeSheet(shopCode)
  await syncWageSheet(shopCode)
  await syncSumSheet(shopCode)
  await syncOverAllSheet(shopCode)
  await hideInternalSheets(sid)
}
