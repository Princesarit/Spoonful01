export type ShopCode = string
export type Role = 'staff' | 'manager' | 'owner'
export type Position = 'Front' | 'Kitchen' | 'Home' | 'Manager'
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
  hourlyWage?: number      // derived: wageLunch / 4
  wageLunch?: number       // wage per lunch shift
  wageDinner?: number      // wage per dinner shift
  deliveryFeePerTrip?: number  // flat fee per delivery trip (overrides distance-based calc)
  defaultDays: boolean[]
  fired?: boolean   // soft-delete flag
}

export interface WeekSchedule {
  weekStart: string // ISO Monday date: YYYY-MM-DD
  entries: { employeeId: string; days: (string | null)[] }[]
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

export interface MealRevenue {
  eftpos: number
  lfyOnline: number
  lfyCards: number
  lfyCash: number
  uberOnline: number
  doorDash: number
  cashLeftInBag: number
  cashSale?: number     // user-entered cash sale (auto-populated from formula for legacy entries)
  totalSale: number     // auto-calculated: eftpos + lfyOnline + lfyCash + uberOnline + doorDash + cashSale
}

export interface RevenueEntry {
  id: string
  date: string
  lfyBills: number
  uberBills: number
  doorDashBills: number
  lunch: MealRevenue
  dinner: MealRevenue
  note?: string
  lunchRecorderName?: string   // staff who filled in lunch
  dinnerRecorderName?: string  // staff who filled in dinner
  deleted?: boolean            // soft-delete: true = ถูกลบแล้ว ยังเก็บไว้ใน Sheet
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
  filledBy?: string
}

export interface DailyNote {
  date: string
  note: string
}

export interface DeliveryRate {
  maxKm: number  // 9999 = no upper limit (catch-all)
  fee: number
}
