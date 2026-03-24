import fs from 'fs'
import path from 'path'
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

const GLOBAL_DIR = path.join(process.cwd(), 'data')
function globalFile(name: string) {
  if (!fs.existsSync(GLOBAL_DIR)) fs.mkdirSync(GLOBAL_DIR, { recursive: true })
  return path.join(GLOBAL_DIR, name)
}

const DEFAULT_PLATFORMS: DeliveryPlatform[] = [
  { id: 'local_for_you', name: 'Local for you' },
  { id: 'uber_eats', name: 'Uber Eats' },
  { id: 'doordash', name: 'Doordash' },
]

function dir(shopCode: string): string {
  const d = path.join(process.cwd(), 'data', shopCode)
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

function read<T>(file: string, def: T): T {
  if (!fs.existsSync(file)) return def
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return def
  }
}

function write<T>(file: string, data: T): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function f(shopCode: string, name: string) {
  return path.join(dir(shopCode), name)
}

export const db = {
  shops: {
    list: () => read<StoredShop[]>(globalFile('shops.json'), []),
    save: (d: StoredShop[]) => write(globalFile('shops.json'), d),
  },
  employees: {
    list: (s: string) => read<Employee[]>(f(s, 'employees.json'), []),
    save: (s: string, d: Employee[]) => write(f(s, 'employees.json'), d),
  },
  schedules: {
    list: (s: string) => read<WeekSchedule[]>(f(s, 'schedules.json'), []),
    save: (s: string, d: WeekSchedule[]) => write(f(s, 'schedules.json'), d),
  },
  timeRecords: {
    list: (s: string) => read<TimeRecord[]>(f(s, 'time-records.json'), []),
    save: (s: string, d: TimeRecord[]) => write(f(s, 'time-records.json'), d),
  },
  deliveryTrips: {
    list: (s: string) => read<DeliveryTrip[]>(f(s, 'delivery-trips.json'), []),
    save: (s: string, d: DeliveryTrip[]) => write(f(s, 'delivery-trips.json'), d),
  },
  platforms: {
    list: (s: string) =>
      read<DeliveryPlatform[]>(f(s, 'platforms.json'), DEFAULT_PLATFORMS),
    save: (s: string, d: DeliveryPlatform[]) => write(f(s, 'platforms.json'), d),
  },
  revenue: {
    list: (s: string) => read<RevenueEntry[]>(f(s, 'revenue.json'), []),
    save: (s: string, d: RevenueEntry[]) => write(f(s, 'revenue.json'), d),
  },
  expenses: {
    list: (s: string) => read<ExpenseEntry[]>(f(s, 'expenses.json'), []),
    save: (s: string, d: ExpenseEntry[]) => write(f(s, 'expenses.json'), d),
  },
  notes: {
    list: (s: string) => read<DailyNote[]>(f(s, 'notes.json'), []),
    save: (s: string, d: DailyNote[]) => write(f(s, 'notes.json'), d),
  },
}
