# Spoonful — Project Notes

## Stack
- **Frontend**: Next.js 15 (App Router, Server Actions, Client Components) — port 3000
- **Backend**: Express.js + TypeScript — port 4001
- **Database**: Google Sheets API (per-shop spreadsheet via `getShopDb()`)

---

## Features Implemented

### Schedule Page (`ScheduleView.tsx`)
- **× Delete** removes employee from current week's schedule only — does NOT delete from Employees page
- After delete + save, employee won't reappear on reload: `posEmps` filters by `savedSched.entries` when `weekSaved = true`
- **Audit modal** required for Edit saves (Name + Note); first-time Save auto-logs with role as editorName
- Add Employee button checks for **duplicate names** (case-insensitive) before saving

### Employees Page (`EmployeeView.tsx`)
- Add/Edit/Delete all log to `edit_log` sheet
  - Add → auto-log, editorName = role (Owner/Manager), no modal
  - Edit → requires Name + Note modal
  - Delete → requires Name + Note modal
- Phone field: display shows `Tel: {phone}`, input accepts numbers only (`inputMode="numeric"`)
- **Duplicate name prevention**: shows inline error under Name field before API call

### Time Record Page (`TimeRecordView.tsx`)
- Per-employee save/edit state: save once → button becomes Edit
- Inputs locked after save; unlock on Edit
- Add Employee modal disables already-occupied shifts for that day
- Skip trips with `distance = 0` when saving delivery data
- Audit modal (Name + Note) before confirming save per employee

### Config Page (`DeliveryRatesView.tsx`)
- Auto-logs to `edit_log` whenever delivery rates or fee are changed
- Logs: Date, Time, diff of changed values (e.g. `rate_0: 30→35`)
- No modal — uses session role as editorName

### edit_log Sheet
- Columns (in order): `date`, `time`, `editorName`, `employeeName`, `shift`, `changes`, `note`
- `note` column is after `changes`
- Append-only via `appendAuditLog` in `db.ts`
- Backend endpoint: `POST /:shopCode/config/audit-log`

### Master Employees Sheet (Auto-sync)
- `saveEmployees()` in `db.ts` automatically syncs the per-shop employee list to the master `Employees` tab
- Reads master, replaces rows for this `shopCode`, keeps other shops' rows

### front_time_records / back_time_records Sheets (Pivot Format)
- **Layout per week block**:
  - Row 1 `DATE`: `DATE | date | date | date | date | ... | TOTAL` (each date repeated twice for AM/PM)
  - Row 2 `NAME`: `NAME | MON_AM | MON_PM | TUE_AM | TUE_PM | ... | SUN_AM | SUN_PM | TOTAL`
  - Employee rows: `name | m | e | m | e | ... | total`
  - 3 blank rows between week blocks
- **Colors**: AM header cells = yellow (`#FFF2CC`), PM header cells = blue (`#ADD8E6`)
- **NUMBER format** applied to employee data cells (prevents `0` displaying as `1899-12-30`)
- **Overlap fix**: `applyTimeRecordFormatting()` clears all backgrounds before reapplying on every write
- **Read back**: `readPivotTimeRecordsTab()` parses pivot layout → `TimeRecord[]` using employee name→ID lookup
- Legacy flat `time_records` tab still readable via `readFlatTimeRecordsTab()` for backward compat

### Color / Format Bug Fixes (Sheets)
- `applyRowColors()` now clears from row index `0` (not `1`) so header row stale colors also reset
- `clearRowsCount` uses `sheet.properties.gridProperties.rowCount` so shrinking data removes stale colors

### ShopHeader Hydration Fix
- `useState(0)` instead of `useState(Date.now() - loginAt)` — real value set in `useEffect` client-side only

### Login Page
- Title image: `/Title.png`, Logo image: `/LOGO.png` (both in `public/`)

### Duplicate Employee Name Prevention
- Frontend: inline error message + red border on Name input
- Backend: `POST /:shopCode/employees` returns 409 if name already exists (case-insensitive)
- Also checked in ScheduleView Add Employee modal

### Soft Delete — Employee Fired (ไล่ออก)
- **ลบพนักงานจากหน้า Employees = soft delete** เท่านั้น — ข้อมูลเก่าทั้งหมดยังคงอยู่
- `fired?: boolean` field ใน `Employee` interface (ทั้ง Frontend และ Backend types)
- `employees` sheet มีคอลัมน์ `fired` เพิ่มมาใน `EMP_HEADERS`
- `listEmployees(shopCode, includeAll = false)` — default กรอง fired ออก; `includeAll = true` เอาทุกคน
- `DELETE /:shopCode/employees/:id` — เปลี่ยนจาก hard-delete เป็น set `fired: true`
- `GET /:shopCode/employees?all=true` — คืนพนักงานรวม fired (ใช้สำหรับ historical display)
- Routes ที่ใช้ `includeAll: true`:
  - `GET /:shopCode/schedules` — เพื่อให้ Schedule page แสดงพนักงานที่ถูก fired ในอดีต
  - `GET /:shopCode/time-records` — เพื่อให้ Time Record page แสดงข้อมูลของพนักงานที่ถูก fired ในอดีต
- **ScheduleView**: `posEmps` filter เพิ่ม `if (!isPast && e.fired) return false` — ซ่อน fired ในสัปดาห์ปัจจุบัน/อนาคต, ยังแสดงในอดีต
- **TimeRecordView**: `staffEmps` และ `homeEmps` ซ่อน fired employees ในสัปดาห์/วันปัจจุบัน-อนาคต
- **EmployeeView**: ไม่ต้องแก้ — `GET /employees` (ไม่มี `?all=true`) คืนแค่ active employees อยู่แล้ว
- Dedup logic อัปเดต: fired employees ข้ามการ dedup (เก็บไว้เสมอ), dedup ทำเฉพาะ active employees

### Expenses Page — Redesigned Form (`ExpenseView.tsx`)
- Form ใหม่ตาม spec Task 4: Date + Day (auto) | Description/Name | Amount ($AUD) | Payment Method | Notes
- `Day` auto-calculated จาก date (read-only, แสดงเป็น Mon/Tue/...)
- `supplier` field = Description/Name ของร้านหรือรายการ (e.g. Woolworths, Home, BBQ ducks)
- `description` field = Notes (optional)
- `category` ยังคงอยู่ใน type แต่ default = 'General' ไม่แสดงใน form
- Amount แสดงเป็น AUD `$X.XX` format
- Payment Method: 3 icon buttons (💵 Cash / 💳 Credit Card / 🏦 Online Banking)
- Save disabled ถ้า Description/Name ว่าง หรือ Amount = 0
- List card แสดง: Day + Date | Name | Payment badge | Notes | Amount | Paid toggle

### Time Record — Wage Summary (`TimeRecordView.tsx`)
- Section ใหม่ "Wage Summary" อยู่ระหว่าง Weekly section กับ Daily Home Delivery
- ใช้ข้อมูล `weekAttend` (morning/evening) เดียวกับ Weekly section
- ตาราง: Name | Rate | จ/อ/พ/พฤ/ศ/ส/อา (แต่ละวัน L/D) | WAGE | TAX | PAID | Remaining
- L = morning > 0 (สีเหลือง), D = evening > 0 (สีฟ้า)
- WAGE คำนวณ: จำนวนกะที่มา × `employee.hourlyWage`
- TAX และ PAID เป็น input ที่แก้ได้ (local state: `wageTax`, `wagePaid`)
- Remaining = WAGE - TAX - PAID (สีแดงถ้าติดลบ, เขียวถ้าบวก)
- แถว Total ด้านล่างรวมยอดทุกคน + นับจำนวนคนต่อกะต่อวัน

### Time Record — Delivery Count Summary
- **Delivery Count** section แสดงด้านบนของ Home Delivery section
- คำนวณจาก `trips` state: 0-4km (≤4), 5-6km (5-6), >7km (≥7), Total
- แสดงทันทีเมื่อกรอก km ของแต่ละ trip (real-time)
- COD ไม่ถูก auto-save ไปหน้า Revenue อีกต่อไป (เก็บแค่ใน audit log)

### Revenue Page — New Lunch/Dinner Model (`RevenueView.tsx`)
- **RevenueEntry** ถูก redesign ใหม่ทั้งหมดให้แยก Lunch / Dinner
- **MealRevenue** interface: `eftpos, lfyOnline, lfyCards, lfyCash, uberOnline, doorDash, cashLeftInBag, totalSale`
- **Bill counts**: `lfyBills, uberBills, doorDashBills` (จำนวน bill ต่อ platform)
- **cashSale** คำนวณ auto = `totalSale - eftpos - lfyOnline - uberOnline - doorDash`
- Sheet column: `id, date, lfyBills, uberBills, doorDashBills, lunch (JSON), dinner (JSON), note`
- Backward compat: อ่าน format เก่า (netSales, card) แล้ว map ไป lunch.totalSale + lunch.eftpos
- Platform manager ถูกเอาออก (ใช้ LFY / Uber / DoorDash fixed แทน)
- **SummaryView** อัปเดต `calcDay()` ให้ใช้ `lunch.totalSale + dinner.totalSale` แทน `netSales`

### Google Sheet Report Sync (Task 5)
- **Sync button** ใน SummaryView header — กด "Sync Sheets" เพื่อ sync ข้อมูลทั้งหมด
- **Backend route**: `POST /:shopCode/sheets/sync` → `syncAllReportSheets(shopCode)`
- **4 report sheets** สร้าง/อัปเดตอัตโนมัติ:

#### Income 2026 (`syncIncomeSheet`)
- Columns A-Y: Date | Day | LFY/Uber/DD Bills | Lunch (Eftpos/LFY Online/Cards/Cash/Uber/DD/CashInBag/TotalSale/CashSale) | Dinner (same) | Grand Total | Grand Cash Sale
- `L:Cash Sale` = formula `=M-F-G-J-K` (auto), `D:Cash Sale` = `=V-O-P-S-T`
- Color: L:Total Sale + D:Total Sale = **green** (#92D050), L:Cash in Bag + D:Cash in Bag = **yellow** (#FFFF00)
- **SUM row** per week (orange #FFC000): `=SUM(Cs1:Cs2)` ทุก column
- Week blocks: 7 data rows + 1 SUM row (no blank between weeks)

#### Wage 2026 (`syncWageSheet`)
- Columns: Week Start | Employee | Rate (฿) | Mon-Sun (shift count 0/1/2) | Total Shifts | WAGE
- Total Shifts = `=SUM(D:J)`, WAGE = `=Rate × Total Shifts`
- **TOTAL row** per week (orange): รวม shifts + WAGE ของทุกคน

#### Sum 2026 (`syncSumSheet`)
- One row per week: Week Start | Week End | Total Sale | Eftpos | Online Orders | Cash Revenue | Cash Expense | Non-Cash Expense | Staff Wage | Delivery Fee | Total Labor | Cash Leave
- Cash Leave cell: green ถ้า ≥ 0, red ถ้า < 0
- **GRAND TOTAL row** ด้านล่าง

#### OverAll (`syncOverAllSheet`)
- One row per month: Month | Total Sale | Online Orders | Total Eftpos | Cash Revenue | Cash/Non-Cash/Total Expense | Staff Wage | Delivery Fee | Total Labor | Cash Leave | Net Profit (est)

#### sheets.ts additions
- `setSheetDataUserEntered()` — เขียน sheet ด้วย `USER_ENTERED` (รองรับ formula)
- `applyColorRules(rules[])` — apply background color แบบ batch (100 per request)

---

## Key Files

| File | Purpose |
|------|---------|
| `Backend/src/db.ts` | All Google Sheets read/write logic |
| `Backend/src/sheets.ts` | Sheets API client (`getSheetData`, `setSheetData`, `applyRowColors`, `applyTimeRecordFormatting`, `setSheetDataUserEntered`, `applyColorRules`) |
| `Backend/src/routes/employees.ts` | Employee CRUD + duplicate check + soft delete |
| `Backend/src/routes/config.ts` | Config + audit-log endpoint |
| `Backend/src/routes/sheetSync.ts` | Report sheet sync endpoints (`POST /:shopCode/sheets/sync`) |
| `Frontend/src/app/[shopCode]/schedule/ScheduleView.tsx` | Schedule grid + delete logic |
| `Frontend/src/app/[shopCode]/employees/EmployeeView.tsx` | Employee list + add/edit/delete |
| `Frontend/src/app/[shopCode]/time-record/TimeRecordView.tsx` | Per-employee time record save/edit |
| `Frontend/src/app/[shopCode]/config/DeliveryRatesView.tsx` | Delivery rate config + auto-log |
| `Frontend/src/app/LoginForm.tsx` | Login + shop selector |

---

## Important Patterns

- **Audit log**: always use `appendAuditLog(shopCode, { editorName, note, employeeName, shift, changes })`
- **Add actions**: log with `role` as `editorName`, no modal
- **Edit/Delete actions**: require Name + Note modal before confirming
- **Sheet colors**: always pass `clearRowsCount` to `applyRowColors` to avoid stale color overlap
- **Time records split**: Front employees → `front_time_records`, Back → `back_time_records`
- **Soft delete pattern**: never hard-delete employees — set `fired: true`; use `listEmployees(shopCode, true)` in routes that need historical data; use `listEmployees(shopCode)` (default) for active-only views
