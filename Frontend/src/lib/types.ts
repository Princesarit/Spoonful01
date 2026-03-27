export type ShopCode = string
export type Role = 'staff' | 'manager' | 'owner'
export type Position = 'Front' | 'Back' | 'Home' | 'Manager'
export type PaymentMethod = 'Cash' | 'Credit Card' | 'Online Banking'

export interface Session {
  shopCode: ShopCode
  role: Role
  token: string
  loginAt: number // Unix timestamp ms
}

export interface StoredShop {
  code: string
  name: string
  restaurantPassword: string  // staff login
  managerPassword: string     // manager login
  ownerPassword?: string      // owner login (optional)
}

export interface Employee {
  id: string
  name: string
  positions: Position[]   // replaces position (supports multi-position)
  phone?: string
  dailyWage?: number      // kept optional for backward compat
  defaultDays: boolean[]  // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
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
  distance: number // km
  fee: number // calculated fee in THB
  cod?: number  // cash on delivery amount
}

export interface DeliveryPlatform {
  id: string
  name: string
}

export interface RevenueEntry {
  id: string
  date: string
  name: string // cashier name
  netSales: number
  paidOnline: number
  card: number
  cash: number
  platforms: Record<string, number> // platformId → amount
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
