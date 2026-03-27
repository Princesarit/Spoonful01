export type ShopCode = string
export type Role = 'staff' | 'manager' | 'owner'
export type Position = 'Front' | 'Back' | 'Home' | 'Manager'
export type PaymentMethod = 'Cash' | 'Credit Card' | 'Online Banking'

export interface Session {
  shopCode: ShopCode
  role: Role
}

export interface StoredShop {
  code: string
  name: string
  restaurantPassword: string  // staff login
  managerPassword: string     // manager login
  ownerPassword?: string      // owner login (optional; if not set, managerPassword gives owner)
  spreadsheetId?: string
}

export interface Employee {
  id: string
  name: string
  positions: Position[]
  phone?: string
  dailyWage?: number
  defaultDays: boolean[]
}

export interface WeekSchedule {
  weekStart: string // ISO Monday date: YYYY-MM-DD
  entries: { employeeId: string; days: boolean[] }[]
}

export interface TimeRecord {
  date: string // YYYY-MM-DD
  employeeId: string
  morning: number
  evening: number
}

export interface DeliveryTrip {
  id: string
  date: string
  employeeId: string
  employeeName: string
  distance: number
  fee: number
  cod?: number  // cash on delivery amount
}

export interface DeliveryPlatform {
  id: string
  name: string
}

export interface RevenueEntry {
  id: string
  date: string
  name: string
  netSales: number
  paidOnline: number
  card: number
  cash: number
  platforms: Record<string, number>
}

export interface ExpenseEntry {
  id: string
  date: string
  category: string
  supplier: string
  description: string
  total: number
  paymentMethod: PaymentMethod
  bankAccount?: string
  dueDate?: string
  paid: boolean
}

export interface DailyNote {
  date: string
  note: string
}

export interface DeliveryRate {
  maxKm: number  // 9999 = no upper limit (catch-all)
  fee: number
}
