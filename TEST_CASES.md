# Spoonful — Test Case Document

> **อัปเดตล่าสุด:** 2026-05-01  
> **ครอบคลุม:** Bug fixes + Feature verification แยกตามหน้า/ปุ่ม

---

## สารบัญ

1. [ประวัติ Bug ที่แก้แล้ว (Changelog)](#1-ประวัติ-bug-ที่แก้แล้ว)
2. [Login](#2-login)
3. [Employees Page](#3-employees-page)
4. [Schedule Page](#4-schedule-page)
5. [Time Record Page](#5-time-record-page)
6. [Revenue Page](#6-revenue-page)
7. [Expenses Page](#7-expenses-page)
8. [Config / Delivery Rates Page](#8-config--delivery-rates-page)
9. [Summary Page](#9-summary-page)
10. [Google Sheets — Employee Tab](#10-google-sheets--employee-tab)
11. [Google Sheets — Income 2026](#11-google-sheets--income-2026)
12. [Google Sheets — Wage 2026](#12-google-sheets--wage-2026)
13. [Google Sheets — Sum 2026](#13-google-sheets--sum-2026)
14. [Google Sheets — OverAll](#14-google-sheets--overall)
15. [Google Sheets — Master Employees Tab](#15-google-sheets--master-employees-tab)
16. [Known Issues / ยังไม่ได้แก้](#16-known-issues--ยังไม่ได้แก้)

---

## 1. ประวัติ Bug ที่แก้แล้ว

| # | วันที่แก้ | หน้า / ปุ่ม | ปัญหา | วิธีแก้ |
|---|-----------|-------------|-------|---------|
| B-01 | 2026-04-xx | Employees — Add | ข้อมูลทั้งหมดหายหลัง Add Employee ใหม่ | `deleteTable` API ลบทั้ง Table object และ cell data — แก้โดยเปลี่ยน order: delete table → write data → add table |
| B-02 | 2026-04-xx | Employees — Sheet | Header row ใน Google Sheet หาย (column names ว่าง) | `tableColumnProperties` ใน `addTable` ทำให้ API reject — แก้โดยเลิกใช้ Table API ทั้งหมด ใช้ manual cell formatting แทน |
| B-03 | 2026-04-xx | Employees — Sheet | Row ใหม่ตกขอบตาราง (อยู่นอก Table border) | `updateTable` ไม่ทำงาน — แก้โดยเลิกใช้ Table API, ใช้ `updateBorders` ครอบ range ที่ถูกต้องแทน |
| B-04 | 2026-05-01 | Employees — Sheet | Column AF, AW, AX ใน Income 2026 มีสีเทาในแถว SUM และ header | SUM rows paint ทุก column ด้วย dark gray, ไม่มี override สำหรับ gap columns — แก้โดยเพิ่ม explicit white สำหรับ gap2/gap3/gap4 ใน SUM rows และ row 0 |
| B-05 | 2026-04-xx | Summary — Report | Cash from Bank ป้อนเลขติดลบได้ | เพิ่ม `min="0"` + `Math.max(0, ...)` ใน input onChange |
| B-06 | 2026-04-xx | ShopHeader | Hydration error / ค่า timer กระโดด | เปลี่ยน `useState(Date.now() - loginAt)` → `useState(0)` แล้วใช้ `useEffect` set ค่าจริง |
| B-07 | 2026-04-xx | Schedule — Delete | ลบพนักงานออกจาก Schedule แล้วชื่อกลับมาตอน reload | `posEmps` filter เพิ่ม `!isPast && e.fired` check |
| B-08 | 2026-04-xx | Employees — Delete | Hard delete ลบข้อมูลเก่าทิ้งหมด | เปลี่ยนเป็น Soft delete (set `fired: true`) เก็บประวัติไว้ |

---

## 2. Login

### TC-LOGIN-01 — เข้าสู่ระบบสำเร็จ
| | |
|---|---|
| **ขั้นตอน** | 1. เปิดหน้า Login  2. เลือก Shop  3. กรอก Password ถูก  4. กด Login |
| **ผลที่คาดหวัง** | Redirect ไปหน้า Summary |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-LOGIN-02 — Password ผิด
| | |
|---|---|
| **ขั้นตอน** | กรอก Password ผิด → กด Login |
| **ผลที่คาดหวัง** | แสดง error message, ไม่ redirect |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-LOGIN-03 — Session หมดอายุ
| | |
|---|---|
| **ขั้นตอน** | Login แล้วรอ session หมด หรือลบ cookie → เข้าหน้าอื่น |
| **ผลที่คาดหวัง** | Redirect กลับหน้า Login |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 3. Employees Page

### TC-EMP-01 — แสดงรายชื่อพนักงาน
| | |
|---|---|
| **ขั้นตอน** | เข้าหน้า Employees |
| **ผลที่คาดหวัง** | แสดงเฉพาะพนักงาน Active (ไม่แสดงคนที่ fired) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EMP-02 — ปุ่ม Add Employee (ชื่อใหม่)
| | |
|---|---|
| **ขั้นตอน** | 1. กด Add Employee  2. กรอก Name, Position, Wage  3. กด Save |
| **ผลที่คาดหวัง** | พนักงานใหม่ปรากฏในรายการ, log ใน edit_log sheet, ข้อมูลเดิมไม่หาย |
| **สถานะ** | ✅ ใช้งานได้ (แก้ B-01 แล้ว) |
| **Bug ที่เคยพบ** | ข้อมูลทั้งหมดหายหลัง add (B-01) |

### TC-EMP-03 — ปุ่ม Add Employee (ชื่อซ้ำ)
| | |
|---|---|
| **ขั้นตอน** | Add พนักงานที่มีชื่อเดียวกับคนที่มีอยู่แล้ว (case-insensitive) |
| **ผลที่คาดหวัง** | แสดง inline error "ชื่อนี้มีอยู่แล้ว", ไม่ save |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EMP-04 — ปุ่ม Edit Employee
| | |
|---|---|
| **ขั้นตอน** | 1. กด Edit บนพนักงาน  2. แก้ไขข้อมูล  3. กรอก Name + Note ใน modal  4. ยืนยัน |
| **ผลที่คาดหวัง** | ข้อมูลอัปเดต, log ใน edit_log ระบุ editor และ note |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EMP-05 — ปุ่ม Delete Employee (Soft Delete)
| | |
|---|---|
| **ขั้นตอน** | 1. กด Delete  2. กรอก Name + Note ใน modal  3. ยืนยัน |
| **ผลที่คาดหวัง** | พนักงานหายจากหน้า Employees แต่ยังมีข้อมูลใน Sheet (fired=true), ประวัติ Time Record/Schedule เดิมยังคงอยู่ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EMP-06 — Phone Field
| | |
|---|---|
| **ขั้นตอน** | กรอกเบอร์โทร (ตัวเลขเท่านั้น) |
| **ผลที่คาดหวัง** | รับเฉพาะตัวเลข, แสดง "Tel: XXXXXXXXX" |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 4. Schedule Page

### TC-SCH-01 — แสดง Schedule สัปดาห์ปัจจุบัน
| | |
|---|---|
| **ขั้นตอน** | เข้าหน้า Schedule |
| **ผลที่คาดหวัง** | แสดงเฉพาะพนักงาน Active ในสัปดาห์นี้ (ไม่แสดงคนที่ fired) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SCH-02 — แสดง Schedule สัปดาห์ที่ผ่านมา
| | |
|---|---|
| **ขั้นตอน** | เลือก week ก่อนหน้า |
| **ผลที่คาดหวัง** | แสดงพนักงานที่ทำงานในสัปดาห์นั้น รวมถึงคนที่ fired ในภายหลัง |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SCH-03 — ปุ่ม Delete (ลบพนักงานออกจาก Schedule)
| | |
|---|---|
| **ขั้นตอน** | กด × ที่ชื่อพนักงานใน Schedule → Save |
| **ผลที่คาดหวัง** | พนักงานหายจาก Schedule สัปดาห์นี้เท่านั้น, หน้า Employees ยังมีชื่ออยู่, reload ไม่กลับมา |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SCH-04 — ปุ่ม Save (ครั้งแรก)
| | |
|---|---|
| **ขั้นตอน** | บันทึก Schedule ครั้งแรกของสัปดาห์ |
| **ผลที่คาดหวัง** | Auto-log ใน edit_log โดยใช้ role เป็น editorName (ไม่ต้องกรอก modal) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SCH-05 — ปุ่ม Edit (Save ครั้งต่อไป)
| | |
|---|---|
| **ขั้นตอน** | แก้ไข Schedule ที่ save แล้ว → กด Edit Save |
| **ผลที่คาดหวัง** | เปิด Audit modal ให้กรอก Name + Note ก่อนบันทึก |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SCH-06 — Add Employee ใน Schedule (ชื่อซ้ำ)
| | |
|---|---|
| **ขั้นตอน** | Add พนักงานที่มีชื่อซ้ำใน Schedule modal |
| **ผลที่คาดหวัง** | แสดง error "ชื่อนี้มีอยู่แล้ว" |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 5. Time Record Page

### TC-TR-01 — แสดง Time Record
| | |
|---|---|
| **ขั้นตอน** | เข้าหน้า Time Record เลือกสัปดาห์ |
| **ผลที่คาดหวัง** | แสดงพนักงานที่ active และ fired ที่มีข้อมูลในสัปดาห์นั้น, ไม่แสดง fired ในสัปดาห์ปัจจุบัน |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-02 — ปุ่ม Save (ต่อพนักงาน)
| | |
|---|---|
| **ขั้นตอน** | กรอก Morning/Evening ของพนักงาน → กด Save |
| **ผลที่คาดหวัง** | บันทึกสำเร็จ, ปุ่มเปลี่ยนเป็น Edit, input ล็อค, Audit modal ถูกเปิดก่อน confirm |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-03 — ปุ่ม Edit (unlock record)
| | |
|---|---|
| **ขั้นตอน** | กด Edit บน record ที่ save แล้ว |
| **ผลที่คาดหวัง** | input ปลดล็อค, ปุ่มกลับเป็น Save |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-04 — Wage Summary Section
| | |
|---|---|
| **ขั้นตอน** | ดู Wage Summary หลัง save time record |
| **ผลที่คาดหวัง** | ตารางแสดง Name, Rate, กะ L/D แต่ละวัน, WAGE, TAX (กรอกได้), PAID (กรอกได้), Remaining (auto) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-05 — Delivery Count Summary
| | |
|---|---|
| **ขั้นตอน** | กรอก km ของ delivery trips |
| **ผลที่คาดหวัง** | Delivery Count แสดง real-time: 0-4km, 5-6km, ≥7km, Total |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-06 — Skip trip distance = 0
| | |
|---|---|
| **ขั้นตอน** | บันทึก delivery trip ที่ distance = 0 |
| **ผลที่คาดหวัง** | Trip ที่ distance=0 ไม่ถูก save ลง DB |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-TR-07 — Add Employee modal (shift ซ้ำ)
| | |
|---|---|
| **ขั้นตอน** | Add Employee ใน Time Record modal สำหรับ shift ที่มีคนแล้ว |
| **ผลที่คาดหวัง** | Shift ที่ถูก occupy แล้ว disabled ให้เลือกไม่ได้ |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 6. Revenue Page

### TC-REV-01 — กรอก Revenue แยก Lunch / Dinner
| | |
|---|---|
| **ขั้นตอน** | เลือกวัน → กรอก Eftpos, LFY Online, Cards, Uber, DoorDash, Cash in Bag, Total Sale สำหรับ Lunch และ Dinner |
| **ผลที่คาดหวัง** | Cash Sale คำนวณอัตโนมัติ = TotalSale - Eftpos - LFYOnline - UberOnline - DoorDash |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-REV-02 — Bill counts
| | |
|---|---|
| **ขั้นตอน** | กรอกจำนวน bill (lfyBills, uberBills, doorDashBills) |
| **ผลที่คาดหวัง** | ค่าถูกบันทึกและแสดงถูกต้อง |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-REV-03 — Backward compatibility (ข้อมูลเก่า)
| | |
|---|---|
| **ขั้นตอน** | เปิดดู Revenue ที่บันทึกในรูปแบบเก่า (มี netSales, card) |
| **ผลที่คาดหวัง** | แสดงข้อมูลเก่าถูกต้อง map ไป lunch.totalSale + lunch.eftpos |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 7. Expenses Page

### TC-EXP-01 — เพิ่ม Expense
| | |
|---|---|
| **ขั้นตอน** | 1. เลือกวัน  2. กรอก Description/Name, Amount  3. เลือก Payment Method  4. กด Save |
| **ผลที่คาดหวัง** | Expense ถูกบันทึก, แสดงใน list การ์ด (Day+Date | Name | Payment badge | Amount) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EXP-02 — Save disabled เมื่อ Description ว่าง
| | |
|---|---|
| **ขั้นตอน** | เว้น Description/Name ว่าง หรือ Amount = 0 |
| **ผลที่คาดหวัง** | ปุ่ม Save disabled |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EXP-03 — Payment Method Icons
| | |
|---|---|
| **ขั้นตอน** | กด icon 💵 Cash / 💳 Credit Card / 🏦 Online Banking |
| **ผลที่คาดหวัง** | เลือกได้ทีละอัน, แสดง badge ใน list |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-EXP-04 — Day auto-calculated
| | |
|---|---|
| **ขั้นตอน** | เลือกวันที่ใน Date field |
| **ผลที่คาดหวัง** | Day (Mon/Tue/...) คำนวณ auto และแสดง read-only |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 8. Config / Delivery Rates Page

### TC-CFG-01 — แก้ไข Delivery Rates
| | |
|---|---|
| **ขั้นตอน** | แก้ไขค่า rate → Save |
| **ผลที่คาดหวัง** | ค่าถูกบันทึก, auto-log ใน edit_log ระบุ diff ที่เปลี่ยน (เช่น rate_0: 30→35) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-CFG-02 — แก้ไข Delivery Fee
| | |
|---|---|
| **ขั้นตอน** | แก้ไขค่า fee → Save |
| **ผลที่คาดหวัง** | ค่าถูกบันทึก, auto-log ไม่ต้องกรอก modal (ใช้ role เป็น editorName) |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 9. Summary Page

### TC-SUM-01 — แสดง Daily View (วันล่าสุด)
| | |
|---|---|
| **ขั้นตอน** | เข้าหน้า Summary |
| **ผลที่คาดหวัง** | แสดงเฉพาะวันล่าสุด 1 วัน, วันอื่นซ่อนอยู่ในปุ่ม "Show more (N more days)" |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-02 — ปุ่ม Show more / Show less
| | |
|---|---|
| **ขั้นตอน** | กด "Show more" → กด "Show less" |
| **ผลที่คาดหวัง** | แสดง/ซ่อนวันที่เหลือ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-03 — เปลี่ยน Month รีเซ็ต Show more
| | |
|---|---|
| **ขั้นตอน** | เปิด Show more แล้วเปลี่ยน month |
| **ผลที่คาดหวัง** | กลับมาแสดงแค่วันล่าสุด (showAllDays = false) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-04 — ปุ่ม Total/AM/PM per day card
| | |
|---|---|
| **ขั้นตอน** | กดปุ่ม AM/PM/Total ที่อยู่บนการ์ดวันนั้นๆ |
| **ผลที่คาดหวัง** | toggle shift เฉพาะการ์ดนั้น, sync กับ global shift toggle |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-05 — ปุ่ม Report (เปิด/ปิด Panel)
| | |
|---|---|
| **ขั้นตอน** | กด "Report" ใน header |
| **ผลที่คาดหวัง** | Panel แสดง/ซ่อน ตารางสรุปรายสัปดาห์ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-06 — Report Panel: Cash from Bank (ไม่ให้ติดลบ)
| | |
|---|---|
| **ขั้นตอน** | พยายามกรอกตัวเลขติดลบใน "Cash from Bank" |
| **ผลที่คาดหวัง** | ค่าถูก clamp ที่ 0, ป้อนติดลบไม่ได้ |
| **สถานะ** | ✅ ใช้งานได้ (แก้ B-05 แล้ว) |

### TC-SUM-07 — Report Panel: Income Special Items (max 4 รายการ)
| | |
|---|---|
| **ขั้นตอน** | เพิ่ม income items ใน Report panel สูงสุด 4 รายการ |
| **ผลที่คาดหวัง** | รับได้สูงสุด 4 รายการ (label, amount, note) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-08 — Report Panel: Expense Special Items (max 5 รายการ)
| | |
|---|---|
| **ขั้นตอน** | เพิ่ม expense items ใน Report panel สูงสุด 5 รายการ |
| **ผลที่คาดหวัง** | รับได้สูงสุด 5 รายการ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-09 — Report Panel: Cash Left in Bag (manual input)
| | |
|---|---|
| **ขั้นตอน** | กรอก "Cash Left in Bag" ในสัปดาห์ |
| **ผลที่คาดหวัง** | บันทึกค่า manual (ไม่ auto-compute) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-10 — ปุ่ม Save Report
| | |
|---|---|
| **ขั้นตอน** | แก้ไขข้อมูลใน Report panel → กด Save |
| **ผลที่คาดหวัง** | บันทึกทุก week ที่แก้, trigger syncSumSheet อัตโนมัติ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-11 — ปุ่ม Sync Sheets
| | |
|---|---|
| **ขั้นตอน** | กด "Sync Sheets" ใน header |
| **ผลที่คาดหวัง** | Sync ทุก sheet (Income 2026, Wage 2026, Sum 2026, OverAll), แสดง loading state |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-SUM-12 — ปุ่ม Hide Sheets
| | |
|---|---|
| **ขั้นตอน** | กด "Hide Sheets" |
| **ผลที่คาดหวัง** | ซ่อน internal sheets (config, edit_log, expenses, ฯลฯ) ใน Google Sheet |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 10. Google Sheets — Employee Tab

### TC-GS-EMP-01 — Row Colors ตาม Position
| | |
|---|---|
| **ขั้นตอน** | บันทึก / แก้ไข / ลบพนักงาน แล้วเปิด Google Sheet tab "employees" |
| **ผลที่คาดหวัง** | สี: Fired=ชมพู(#F4CCCC), Front=เหลือง(#FFF2CC), Kitchen=เขียว(#D9EAD3), Home=ฟ้า(#CFE2F3) |
| **สถานะ** | ✅ ใช้งานได้ (แก้ B-02, B-03 แล้ว) |

### TC-GS-EMP-02 — Fired Employees ขึ้นบนสุด
| | |
|---|---|
| **ขั้นตอน** | มีพนักงานที่ fired → บันทึก |
| **ผลที่คาดหวัง** | พนักงานที่ fired อยู่บนสุด ตามด้วย Front, Kitchen, Home |
| **สถานะ** | ✅ ใช้งานได้ (แก้ 2026-05-01) |

### TC-GS-EMP-03 — Header Row Bold
| | |
|---|---|
| **ขั้นตอน** | เปิด Sheet หลัง save พนักงาน |
| **ผลที่คาดหวัง** | Row 1 (positions, name, phone, ...) เป็นตัวหนา |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-EMP-04 — Black Borders (เฉพาะ A-K)
| | |
|---|---|
| **ขั้นตอน** | เปิด Sheet หลัง save |
| **ผลที่คาดหวัง** | มี border สีดำรอบ range A1:K{n}, column L ขึ้นไปเป็นสีขาว |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-EMP-05 — Hidden Columns
| | |
|---|---|
| **ขั้นตอน** | เปิด Sheet |
| **ผลที่คาดหวัง** | Column A (id), B (employeeId), J (defaultDays) ซ่อน |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-EMP-06 — เพิ่มพนักงาน แล้ว re-check formatting
| | |
|---|---|
| **ขั้นตอน** | Add Employee ใหม่ → ตรวจ Google Sheet |
| **ผลที่คาดหวัง** | ข้อมูลเดิมครบ, border ครอบพนักงานใหม่ด้วย, สีถูกต้อง |
| **สถานะ** | ✅ ใช้งานได้ (แก้ B-01, B-03 แล้ว) |

---

## 11. Google Sheets — Income 2026

### TC-GS-INC-01 — Column Structure
| | |
|---|---|
| **ขั้นตอน** | Sync → เปิด Income 2026 |
| **ผลที่คาดหวัง** | Columns: Date, Day, LFY/Uber/DD bills, Delivery tiers, Lunch (9 cols), gap, Dinner (9 cols), gap, Combined (16 cols), Running Total, Simplified section |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-INC-02 — SUM Rows (orange)
| | |
|---|---|
| **ขั้นตอน** | Sync → ดู Income 2026 |
| **ผลที่คาดหวัง** | SUM row ท้ายแต่ละสัปดาห์เป็นสีส้มเข้ม, ตัวหนา |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-INC-03 — Columns AF, AW, AX เป็นสีขาว
| | |
|---|---|
| **ขั้นตอน** | Sync → ดู Income 2026 column AF, AW, AX ทั้งใน data rows, SUM rows, และ header |
| **ผลที่คาดหวัง** | ทุก row รวม SUM rows ใน column AF/AW/AX ต้องเป็นสีขาว (separator columns) |
| **สถานะ** | ✅ ใช้งานได้ (แก้ 2026-05-01) |
| **Bug ที่เคยพบ** | SUM rows paint dark gray ทุก column รวม separator, row 0 paint medium gray ครอบ AW/AX |

### TC-GS-INC-04 — Cash Sale Formulas
| | |
|---|---|
| **ขั้นตอน** | Sync → ตรวจ column L:Cash Sale และ D:Cash Sale |
| **ผลที่คาดหวัง** | เป็น formula `=TotalSale-Eftpos-LFYOnline-Uber-DD` (ไม่ใช่ค่า hard-coded) |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-INC-05 — Color Scheme Headers
| | |
|---|---|
| **ขั้นตอน** | Sync → ดูสี header row |
| **ผลที่คาดหวัง** | Yellow=CashInBag, Blue=LFY cols, Green=Uber/DD, Amber=Running Total |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 12. Google Sheets — Wage 2026

### TC-GS-WAG-01 — Row per Employee per Week
| | |
|---|---|
| **ขั้นตอน** | Sync → เปิด Wage 2026 |
| **ผลที่คาดหวัง** | แต่ละ week มีแถวต่อพนักงาน: Week Start, Employee, Rate, Mon-Sun shifts, Total Shifts, WAGE |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-WAG-02 — TOTAL Row per Week
| | |
|---|---|
| **ขั้นตอน** | Sync → ดู TOTAL row |
| **ผลที่คาดหวัง** | TOTAL row (สีส้ม) รวม shifts + WAGE ของทุกคนในสัปดาห์ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-WAG-03 — Formulas (Total Shifts, WAGE)
| | |
|---|---|
| **ขั้นตอน** | ตรวจ cell Total Shifts และ WAGE |
| **ผลที่คาดหวัง** | Total Shifts = `=SUM(D:J)`, WAGE = `=Rate × Total Shifts` (formula) |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 13. Google Sheets — Sum 2026

### TC-GS-SUM-01 — One Row per Week
| | |
|---|---|
| **ขั้นตอน** | Sync → เปิด Sum 2026 |
| **ผลที่คาดหวัง** | 1 row ต่อสัปดาห์: Week Start, Week End, Total Sale, Eftpos, Online, Cash Revenue, Cash Expense, Non-Cash Expense, Staff Wage, Delivery Fee, Total Labor, Cash Leave |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-SUM-02 — Cash Leave Color
| | |
|---|---|
| **ขั้นตอน** | Sync → ดู Cash Leave column |
| **ผลที่คาดหวัง** | สีเขียวถ้า ≥ 0, สีแดงถ้า < 0 |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-SUM-03 — GRAND TOTAL Row
| | |
|---|---|
| **ขั้นตอน** | Sync → ดูแถวล่างสุด |
| **ผลที่คาดหวัง** | GRAND TOTAL row รวมทุกสัปดาห์ |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-SUM-04 — Income Special Items ใน Sum 2026
| | |
|---|---|
| **ขั้นตอน** | กรอก income items ใน Report panel → Save → Sync |
| **ผลที่คาดหวัง** | Items ปรากฏใน Sum 2026 ที่ rows 17-20, ถูก SUM รวมใน Total Cash |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-SUM-05 — Expense Special Items ใน Sum 2026
| | |
|---|---|
| **ขั้นตอน** | กรอก expense items ใน Report panel → Save → Sync |
| **ผลที่คาดหวัง** | Items ปรากฏใน Sum 2026 ที่ rows 25-29 |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 14. Google Sheets — OverAll

### TC-GS-OVR-01 — One Row per Week
| | |
|---|---|
| **ขั้นตอน** | Sync → เปิด OverAll |
| **ผลที่คาดหวัง** | 1 row ต่อสัปดาห์: Weekly, Income, Expense, Wage, Delivery Fee, Cash Leave |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-OVR-02 — Black Borders
| | |
|---|---|
| **ขั้นตอน** | Sync → เปิด OverAll |
| **ผลที่คาดหวัง** | มี border สีดำรอบ data range (A1:F{n}), rows ที่เกินไม่มี border |
| **สถานะ** | ✅ ใช้งานได้ (แก้ 2026-05-01) |

### TC-GS-OVR-03 — Header Bold + Orange
| | |
|---|---|
| **ขั้นตอน** | Sync → ดู row 1 |
| **ผลที่คาดหวัง** | Header เป็นสีส้ม (#FFC000) และตัวหนา |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-OVR-04 — เพิ่ม/ลบสัปดาห์ แล้ว Sync
| | |
|---|---|
| **ขั้นตอน** | เพิ่มข้อมูลสัปดาห์ใหม่ → Sync → ดู OverAll |
| **ผลที่คาดหวัง** | Row ใหม่ถูกเพิ่ม, border ขยายตาม, rows เก่าที่ไม่มีข้อมูลแล้วไม่มี border |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 15. Google Sheets — Master Employees Tab

### TC-GS-MEMP-01 — Fired Column
| | |
|---|---|
| **ขั้นตอน** | Fire พนักงาน → บันทึก → เปิด Master "Employees" tab |
| **ผลที่คาดหวัง** | Column H (fired) แสดง "true" สำหรับพนักงานที่ถูก fire |
| **สถานะ** | ✅ ใช้งานได้ (แก้ 2026-05-01) |

### TC-GS-MEMP-02 — Row Colors
| | |
|---|---|
| **ขั้นตอน** | บันทึกพนักงาน → เปิด Master Employees tab |
| **ผลที่คาดหวัง** | สีเหมือน per-shop sheet: Fired=ชมพู, Front=เหลือง, Kitchen=เขียว, Home=ฟ้า |
| **สถานะ** | ✅ ใช้งานได้ (แก้ 2026-05-01) |

### TC-GS-MEMP-03 — Hidden Columns
| | |
|---|---|
| **ขั้นตอน** | เปิด Master Employees tab |
| **ผลที่คาดหวัง** | Column B (id), C (employeeId), H (fired) ซ่อน |
| **สถานะ** | ✅ ใช้งานได้ |

### TC-GS-MEMP-04 — Multiple Shops
| | |
|---|---|
| **ขั้นตอน** | มีหลาย shop → บันทึกพนักงาน shop A |
| **ผลที่คาดหวัง** | ข้อมูล shop B ยังอยู่ครบ, แค่แถวของ shop A ที่อัปเดต |
| **สถานะ** | ✅ ใช้งานได้ |

---

## 16. Known Issues / ยังไม่ได้แก้

| # | หน้า / ฟีเจอร์ | ปัญหา | Priority |
|---|----------------|--------|----------|
| P-01 | Google Sheets — Employee Tab | ไม่มี Table chip (Table1) แล้ว เนื่องจากเลิกใช้ Table API — ถ้าต้องการ Table กลับมาต้องหา approach ใหม่ที่ safe | Low |
| P-02 | Income 2026 — Simplified Section | Simplified section (AY ขวาสุด) ยังไม่ได้ทดสอบ edge cases ที่ข้อมูลครบทุก platform | Medium |
| P-03 | Summary — Cash Flow | "Remaining" ติดลบ ไม่ trigger notification/alert | Low |
| P-04 | Summary — Monthly view | ไม่มี pagination สำหรับ month ที่มีข้อมูลเยอะ | Low |
| P-05 | Time Record — Wage Summary | TAX และ PAID ไม่ถูก persist ใน DB (แค่ local state) | Medium |
| P-06 | Expenses — Edit | ยังไม่มีปุ่ม Edit expense ที่บันทึกไปแล้ว | Medium |
| P-07 | Revenue — Edit | ยังไม่มีปุ่ม Edit revenue ที่บันทึกไปแล้ว | Medium |
| P-08 | Sync Sheets — Error handling | ถ้า Sync ล้มเหลวบาง sheet แต่ผ่านบางอัน ไม่แสดง partial error ชัดเจน | Low |
| P-09 | Income 2026 — defaultDays column | Master Employees tab แสดง defaultDays เป็น JSON string `[true,true,...]` แทนที่จะเป็นวันที่อ่านได้ | Low |

---

*เอกสารนี้อัปเดตทุกครั้งที่มีการแก้ bug หรือเพิ่ม feature ใหม่*
