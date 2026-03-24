export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  spreadsheetId: process.env.SPREADSHEET_ID ?? '',
  masterPassword: process.env.MASTER_PASSWORD ?? '',
  googleKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? './service-account.json',
}
