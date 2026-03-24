/**
 * Google Sheets client
 *
 * โครงสร้าง Spreadsheet (ใช้ไฟล์เดียว):
 *   shops                  → รายชื่อร้านทั้งหมด
 *   {shopCode}_employees   → พนักงานของแต่ละร้าน
 *   {shopCode}_schedules
 *   {shopCode}_time_records
 *   {shopCode}_delivery_trips
 *   {shopCode}_platforms
 *   {shopCode}_revenue
 *   {shopCode}_expenses
 *   {shopCode}_notes
 */

import { google } from 'googleapis'
import { config } from './config'

const auth = new google.auth.GoogleAuth({
  keyFile: config.googleKeyFile,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheetsApi = google.sheets({ version: 'v4', auth })

// Cache ชื่อ sheet ที่มีอยู่แล้วเพื่อลด API calls
let sheetTitleCache: Set<string> | null = null

async function getSheetTitles(): Promise<Set<string>> {
  if (sheetTitleCache) return sheetTitleCache
  const res = await sheetsApi.spreadsheets.get({ spreadsheetId: config.spreadsheetId })
  sheetTitleCache = new Set(res.data.sheets?.map((s) => s.properties?.title ?? '') ?? [])
  return sheetTitleCache
}

export async function ensureSheet(sheetName: string): Promise<void> {
  const titles = await getSheetTitles()
  if (titles.has(sheetName)) return

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  })
  titles.add(sheetName)
}

/**
 * อ่านข้อมูลจาก sheet — คืนเป็น array of objects โดยใช้ row แรกเป็น header
 */
export async function getSheetData(sheetName: string): Promise<Record<string, string>[]> {
  try {
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: sheetName,
    })
    const rows = res.data.values
    console.log(`[sheets] ${sheetName} raw rows:`, JSON.stringify(rows))
    if (!rows || rows.length < 2) return []
    const headers = rows[0] as string[]
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        obj[h] = String(row[i] ?? '')
      })
      return obj
    })
  } catch (err) {
    console.error(`[sheets] getSheetData(${sheetName}) error:`, err)
    return []
  }
}

/**
 * เขียนข้อมูลทั้งหมดลง sheet (clear แล้ว write ใหม่)
 */
export async function setSheetData(
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean)[][],
): Promise<void> {
  await ensureSheet(sheetName)
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range: sheetName,
  })
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers, ...rows],
    },
  })
}
