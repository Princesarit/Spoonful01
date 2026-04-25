export type ShopCode = string
export type Role = 'staff' | 'manager' | 'owner'
export type Position = 'Front' | 'Kitchen' | 'Home' | 'Manager'
export type PaymentMethod = 'Cash' | 'Credit Card' | 'Online Banking'

export interface Session {
  shopCode: ShopCode
  role: Role
  baseRole: Role  // role at initial login, before any elevation
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
  hourlyWage?: number      // derived: wageLunch / 4 (kept for backward compat & sheet sync)
  wageLunch?: number       // wage per lunch shift
  wageDinner?: number      // wage per dinner shift
  deliveryFeePerTrip?: number  // flat fee per delivery trip; overrides distance-based calc
  defaultDays: boolean[]  // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  fired?: boolean         // soft-delete: true = ไล่ออก, ยังเก็บข้อมูลประวัติ
  instanceId?: string     // in-memory only: unique key for homeEmps duplicates (not persisted)
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
  distance: number // km
  fee: number // calculated fee in THB
  cod?: number  // cash on delivery amount
}

export interface DeliveryPlatform {
  id: string
  name: string
}

export interface MealRevenue {
  eftpos: number        // Eftpos payment
  lfyOnline: number     // Local for You - Paid Online
  lfyCards: number      // Local for You - Cards
  lfyCash: number       // Local for You - Cash
  uberOnline: number    // Uber Eat - Paid Online
  doorDash: number      // DoorDash
  cashLeftInBag: number // Cash left in bag
  cashSale?: number     // user-entered cash sale (legacy entries derive from totalSale)
  totalSale: number     // auto-calculated: eftpos + lfyOnline + lfyCash + uberOnline + doorDash + cashSale
}

export interface RevenueEntry {
  id: string
  date: string
  lfyBills: number    // combined total (lunchLfyBills + dinnerLfyBills)
  uberBills: number
  doorDashBills: number
  lunchLfyBills?: number
  lunchUberBills?: number
  lunchDoorDashBills?: number
  dinnerLfyBills?: number
  dinnerUberBills?: number
  dinnerDoorDashBills?: number
  lunch: MealRevenue
  dinner: MealRevenue
  frontExtra?: number   // legacy — kept for backward compat
  kitchenExtra?: number // legacy — kept for backward compat
  lunchFrontExtra?: number
  lunchKitchenExtra?: number
  dinnerFrontExtra?: number
  dinnerKitchenExtra?: number
  lunchNote?: string
  dinnerNote?: string
  lunchRecorderName?: string
  dinnerRecorderName?: string
  deleted?: boolean
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
  deleted?: boolean
}

export interface DailyNote {
  date: string
  note: string
}

export interface DeliveryRate {
  maxKm: number  // 9999 = no upper limit (catch-all)
  fee: number
}
