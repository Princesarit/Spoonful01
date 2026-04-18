import { google } from 'googleapis'
import { readFileSync } from 'fs'

async function main() {
  const creds = JSON.parse(readFileSync('./service-account.json', 'utf8'))
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const sheets = google.sheets({ version: 'v4', auth })

  // Read shops to find the spreadsheetId (using main config spreadsheet)
  const configSpreadsheetId = process.env.SPREADSHEET_ID
  if (!configSpreadsheetId) { console.log('Set SPREADSHEET_ID env var'); return }

  const res = await sheets.spreadsheets.get({
    spreadsheetId: configSpreadsheetId,
    includeGridData: true,
    ranges: ['Test2!A1:U25'],
  })

  const sheet = res.data.sheets?.[0]
  const gridData = sheet?.data?.[0]
  const rowData = gridData?.rowData ?? []

  for (let r = 0; r < rowData.length; r++) {
    const cells = rowData[r]?.values ?? []
    const rowInfo: string[] = []
    for (let c = 0; c < cells.length; c++) {
      const bg = cells[c]?.userEnteredFormat?.backgroundColor
      const val = cells[c]?.userEnteredValue?.stringValue ?? cells[c]?.userEnteredValue?.numberValue ?? ''
      const bgStr = bg ? `rgb(${Math.round((bg.red??0)*255)},${Math.round((bg.green??0)*255)},${Math.round((bg.blue??0)*255)})` : 'none'
      if (val !== '' || bgStr !== 'none') rowInfo.push(`C${c+1}="${val}"[${bgStr}]`)
    }
    if (rowInfo.length) console.log(`Row ${r+1}: ${rowInfo.join(' | ')}`)
  }
}
main().catch(console.error)
