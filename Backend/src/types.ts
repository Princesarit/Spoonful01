export type ShopCode = string
export type Role = 'staff' | 'owner'
export type Position = 'Front' | 'Back' | 'Home'
export type PaymentMethod = 'Cash' | 'Credit Card' | 'Online Banking'

export interface Session {
  shopCode: ShopCode
  role: Role
}

export interface StoredShop {
  code: string
  name: string
  restaurantPassword: string
  ownerPassword: string
}

export interface Employee {
  id: string
  name: string
  position: Position
  dailyWage: number
  defaultDays: boolean[] // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

export interface WeekSchedule {
  weekStart: string // ISO Monday date: YYYY-MM-DD
  entries: { employeeId: string; days: boolean[] }[]
}

export interface TimeRecord {
  date: string // YYYY-MM-DD
  employeeId: string
  attended: boolean
  extra: number
}

export interface DeliveryTrip {
  id: string
  date: string
  employeeId: string
  distance: number
  fee: number
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
