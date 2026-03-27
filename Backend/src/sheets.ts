/**
 * Google Sheets client
 *
 * Master Spreadsheet (SPREADSHEET_ID in .env):
 *   shops  → รายชื่อร้าน + spreadsheetId ของแต่ละร้าน
 *
 * Per-shop Spreadsheet (สร้างอัตโนมัติ):
 *   employees, schedules, time_records, delivery_trips,
 *   platforms, revenue, expenses, notes, config
 *
 * Backward compat: ถ้าร้านไม่มี spreadsheetId ใช้ master sheet
 *   พร้อม prefix เช่น SEED_employees (พฤติกรรมเดิม)
 */

import { google } from 'googleapis'
import { config } from './config'

const auth = new google.auth.GoogleAuth({
  keyFile: config.googleKeyFile,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ],
})

const sheetsApi = google.sheets({ version: 'v4', auth })
const driveApi = google.drive({ version: 'v3', auth })

// Cache ชื่อ sheet แยกตาม spreadsheetId
const sheetTitleCacheMap = new Map<string, Set<string>>()

async function getSheetTitles(spreadsheetId: string): Promise<Set<string>> {
  const cached = sheetTitleCacheMap.get(spreadsheetId)
  if (cached) return cached
  const res = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const titles = new Set(res.data.sheets?.map((s) => s.properties?.title ?? '') ?? [])
  sheetTitleCacheMap.set(spreadsheetId, titles)
  return titles
}

async function ensureSheet(sheetName: string, spreadsheetId: string): Promise<void> {
  const titles = await getSheetTitles(spreadsheetId)
  if (titles.has(sheetName)) return
  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  titles.add(sheetName)
}

/**
 * อ่านข้อมูลจาก sheet
 * @param sheetName ชื่อ tab
 * @param spreadsheetId ถ้าไม่ส่งใช้ master spreadsheet
 */
export async function getSheetData(
  sheetName: string,
  spreadsheetId = config.spreadsheetId,
): Promise<Record<string, string>[]> {
  try {
    const res = await sheetsApi.spreadsheets.values.get({ spreadsheetId, range: sheetName })
    const rows = res.data.values
    if (!rows || rows.length < 2) return []
    const headers = rows[0] as string[]
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = String(row[i] ?? '') })
      return obj
    })
  } catch (err) {
    console.error(`[sheets] getSheetData(${sheetName}) error:`, err)
    return []
  }
}

/**
 * เขียนข้อมูลลง sheet (clear แล้ว write ใหม่)
 * @param spreadsheetId ถ้าไม่ส่งใช้ master spreadsheet
 */
export async function setSheetData(
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean)[][],
  spreadsheetId = config.spreadsheetId,
): Promise<void> {
  await ensureSheet(sheetName, spreadsheetId)
  await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: sheetName })
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] },
  })
}

type RGB = { red: number; green: number; blue: number }

/**
 * ย้อม background color ทีละ row (rowIndex = 0-based รวม header)
 * ถ้า color = null → reset เป็นสีขาว
 */
export async function applyRowColors(
  sheetName: string,
  spreadsheetId: string,
  rules: Array<{
    rowIndex: number
    color: RGB | null
    colStart?: number  // 0-based, inclusive (default = entire row)
    colEnd?: number    // 0-based, exclusive
  }>,
): Promise<void> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  const sheetId = sheet?.properties?.sheetId
  if (sheetId === undefined) return

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: rules.map(({ rowIndex, color, colStart, colEnd }) => ({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            ...(colStart !== undefined ? { startColumnIndex: colStart } : {}),
            ...(colEnd !== undefined ? { endColumnIndex: colEnd } : {}),
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: color ?? { red: 1, green: 1, blue: 1 },
            },
          },
          fields: 'userEnteredFormat.backgroundColor',
        },
      })),
    },
  })
}

/**
 * สร้าง Spreadsheet ใหม่สำหรับสาขา — คืน spreadsheetId
 */
export async function createSpreadsheet(title: string): Promise<string> {
  const res = await driveApi.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.spreadsheet',
    },
    fields: 'id',
  })
  const id = res.data.id!
  sheetTitleCacheMap.set(id, new Set())
  return id
}
