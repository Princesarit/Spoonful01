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
  try {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    })
    titles.add(sheetName)
  } catch {
    // Tab may already exist (created externally) — refresh cache and verify
    sheetTitleCacheMap.delete(spreadsheetId)
    const refreshed = await getSheetTitles(spreadsheetId)
    if (!refreshed.has(sheetName)) {
      throw new Error(`Failed to create sheet tab: ${sheetName}`)
    }
    // Tab exists now, proceed normally
  }
}

/**
 * อ่านข้อมูลดิบจาก sheet เป็น 2D array (ไม่ parse header)
 */
export async function getSheetDataRaw(
  sheetName: string,
  spreadsheetId = config.spreadsheetId,
): Promise<string[][]> {
  try {
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    })
    return (res.data.values ?? []) as string[][]
  } catch {
    return []
  }
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
    const res = await sheetsApi.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    })
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
 * เขียนข้อมูลดิบลง sheet เป็น 2D array (clear แล้ว write ใหม่, ไม่มี header row พิเศษ)
 */
export async function setSheetDataRaw(
  sheetName: string,
  rows: (string | number)[][],
  spreadsheetId = config.spreadsheetId,
): Promise<void> {
  await ensureSheet(sheetName, spreadsheetId)
  await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: sheetName })
  if (rows.length > 0) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
  }
}

/**
 * เขียนข้อมูลดิบลง sheet ด้วย USER_ENTERED (รองรับ formula เช่น =SUM(...))
 */
export async function setSheetDataUserEntered(
  sheetName: string,
  rows: (string | number | null)[][],
  spreadsheetId = config.spreadsheetId,
): Promise<void> {
  await ensureSheet(sheetName, spreadsheetId)
  await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: sheetName })
  if (rows.length > 0) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })
  }
}

export type ColorRGB = { red: number; green: number; blue: number }
export type ColorRuleBlock = {
  startRow: number; endRow: number; startCol: number; endCol: number; color: ColorRGB
}

export type SheetFormatRule = {
  startRow: number; endRow: number; startCol: number; endCol: number
  backgroundColor?: ColorRGB
  foregroundColor?: ColorRGB
  bold?: boolean
  numberFormat?: { type: string; pattern: string }
}

/**
 * Apply mixed formatting rules (background, text color, bold, number format) in batches
 */
export async function applyFormattingRules(
  sheetName: string,
  spreadsheetId: string,
  rules: SheetFormatRule[],
  clearRowsCount?: number,
): Promise<void> {
  if (rules.length === 0 && !clearRowsCount) return
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  const sheetId = sheet?.properties?.sheetId
  if (sheetId === undefined) return

  const WHITE = { red: 1, green: 1, blue: 1 }
  const clearRequests: object[] = []
  if (clearRowsCount && clearRowsCount > 0) {
    const gridRowCount = sheet?.properties?.gridProperties?.rowCount ?? clearRowsCount
    const clearEnd = Math.max(clearRowsCount + 1, gridRowCount)
    clearRequests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: clearEnd }, cell: { userEnteredFormat: { backgroundColor: WHITE } }, fields: 'userEnteredFormat.backgroundColor' } })
  }

  const requests = rules.map(({ startRow, endRow, startCol, endCol, backgroundColor, foregroundColor, bold, numberFormat }) => {
    const ueFormat: Record<string, unknown> = {}
    const fields: string[] = []

    if (backgroundColor) {
      ueFormat.backgroundColor = backgroundColor
      fields.push('userEnteredFormat.backgroundColor')
    }
    if (foregroundColor !== undefined || bold !== undefined) {
      const tf: Record<string, unknown> = {}
      if (foregroundColor !== undefined) {
        tf.foregroundColor = foregroundColor
        fields.push('userEnteredFormat.textFormat.foregroundColor')
      }
      if (bold !== undefined) {
        tf.bold = bold
        fields.push('userEnteredFormat.textFormat.bold')
      }
      ueFormat.textFormat = tf
    }
    if (numberFormat) {
      ueFormat.numberFormat = numberFormat
      fields.push('userEnteredFormat.numberFormat')
    }

    return {
      repeatCell: {
        range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
        cell: { userEnteredFormat: ueFormat },
        fields: fields.join(','),
      },
    }
  })

  const allRequests = [...clearRequests, ...requests]
  for (let i = 0; i < allRequests.length; i += 100) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: allRequests.slice(i, i + 100) },
    })
  }
}

/**
 * Apply background color rules to a sheet in batches (to avoid API size limits)
 */
export async function applyColorRules(
  sheetName: string,
  spreadsheetId: string,
  rules: ColorRuleBlock[],
): Promise<void> {
  if (rules.length === 0) return
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  const sheetId = sheet?.properties?.sheetId
  if (sheetId === undefined) return

  const requests = rules.map(({ startRow, endRow, startCol, endCol, color }) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { backgroundColor: color } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  }))

  for (let i = 0; i < requests.length; i += 100) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: requests.slice(i, i + 100) },
    })
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
 * Apply formatting for time record pivot sheets:
 *   - clear all backgrounds to white
 *   - AM header cells → yellow, PM header cells → blue
 *   - employee data rows → NUMBER format (prevents 0 showing as date)
 */
export async function applyTimeRecordFormatting(
  sheetName: string,
  spreadsheetId: string,
  nameRowIndices: number[],     // 0-based row indices of NAME header rows
  empRowRanges: Array<{ start: number; end: number }>,  // 0-based [start, end) of employee data rows
  totalRows: number,
): Promise<void> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  const sheetId = sheet?.properties?.sheetId
  if (sheetId === undefined) return

  const gridRowCount = sheet?.properties?.gridProperties?.rowCount ?? totalRows
  const clearEnd = Math.max(totalRows, gridRowCount)

  const WHITE = { red: 1, green: 1, blue: 1 }
  const AM_YELLOW = { red: 1, green: 0.949, blue: 0.8 }
  const PM_BLUE = { red: 0.678, green: 0.847, blue: 0.933 }

  const requests: object[] = []

  // 1. Clear all backgrounds to white
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: clearEnd },
      cell: { userEnteredFormat: { backgroundColor: WHITE } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  })

  // 2. Apply NUMBER format to employee data rows (prevents 0 → date display)
  for (const { start, end } of empRowRanges) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 1, endColumnIndex: 16 },
        cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.##' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    })
  }

  // 3. AM (odd cols 1,3,5,7,9,11,13) = yellow, PM (even cols 2,4,6,8,10,12,14) = blue on NAME rows
  for (const rowIdx of nameRowIndices) {
    for (const col of [1, 3, 5, 7, 9, 11, 13]) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { backgroundColor: AM_YELLOW } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      })
    }
    for (const col of [2, 4, 6, 8, 10, 12, 14]) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: { userEnteredFormat: { backgroundColor: PM_BLUE } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      })
    }
  }

  await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
}

/**
 * ย้อม background color ทีละ row (rowIndex = 0-based รวม header)
 * ถ้า color = null → reset เป็นสีขาว
 * clearRowsCount: ถ้าส่งมา จะล้างสีทุก row (1..clearRowsCount) เป็นขาวก่อน แล้วค่อย apply rules
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
  clearRowsCount?: number,
): Promise<void> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  const sheetId = sheet?.properties?.sheetId
  if (sheetId === undefined) return

  const WHITE = { red: 1, green: 1, blue: 1 }
  const requests: object[] = []

  // Clear all row backgrounds to white before applying new colors
  // Use actual sheet grid row count so shrinking data doesn't leave stale colors
  if (clearRowsCount !== undefined && clearRowsCount > 0) {
    const gridRowCount = sheet?.properties?.gridProperties?.rowCount ?? clearRowsCount
    const clearEnd = Math.max(clearRowsCount + 1, gridRowCount)
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: clearEnd },
        cell: { userEnteredFormat: { backgroundColor: WHITE } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    })
  }

  for (const { rowIndex, color, colStart, colEnd } of rules) {
    requests.push({
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
            backgroundColor: color ?? WHITE,
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    })
  }

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    })
  }
}

/**
 * Get the numeric sheetId for a named tab
 */
export async function getSheetIdByName(
  spreadsheetId: string,
  sheetName: string,
): Promise<number | undefined> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName)
  return sheet?.properties?.sheetId ?? undefined
}

/**
 * Unmerge all existing merged cells in a sheet.
 * The API requires exact bounds for each merge — a bulk range unmerge fails if
 * it doesn't perfectly cover every existing merge, so we fetch them first.
 */
export async function clearSheetMerges(
  spreadsheetId: string,
  sheetId: number,
): Promise<void> {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === sheetId)
  const merges = sheet?.merges ?? []
  if (merges.length === 0) return
  const requests = merges.map((m) => ({
    unmergeCells: { range: { sheetId, ...m } },
  }))
  await batchUpdateSheet(spreadsheetId, requests)
}

/**
 * Send arbitrary batchUpdate requests (merges, borders, column widths, etc.)
 */
export async function batchUpdateSheet(
  spreadsheetId: string,
  requests: object[],
): Promise<void> {
  if (requests.length === 0) return
  for (let i = 0; i < requests.length; i += 100) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: requests.slice(i, i + 100) },
    })
  }
}

const INTERNAL_SHEETS = new Set([
  'config', 'edit_log', 'wage_payments', 'schedules',
  'delivery_trips', 'front_time_records', 'back_time_records',
  'expenses', 'revenue',
])

/**
 * Hide internal/raw-data sheet tabs so only report sheets are visible.
 * Safe to call repeatedly — only sends requests for sheets that are currently visible.
 */
export async function hideInternalSheets(spreadsheetId: string): Promise<void> {
  const res = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const requests = (res.data.sheets ?? [])
    .filter((s) => {
      const title = s.properties?.title ?? ''
      return INTERNAL_SHEETS.has(title) && !s.properties?.hidden
    })
    .map((s) => ({
      updateSheetProperties: {
        properties: { sheetId: s.properties!.sheetId, hidden: true },
        fields: 'hidden',
      },
    }))
  await batchUpdateSheet(spreadsheetId, requests)
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
