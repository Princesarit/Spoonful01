/**
 * In-memory lock state + SSE broadcast for concurrency control.
 *
 * syncLocked     — true while any shop's full sync is running (global, quota-protection)
 * shopSaveLocked — per-shop ref-count; > 0 while a write operation is in progress
 */

import { Response } from 'express'

let syncLocked = false
const shopSaveLocked = new Map<string, number>()
const sseClients = new Set<Response>()

function currentState() {
  return {
    syncLocked,
    shopSaveLocked: Object.fromEntries(
      [...shopSaveLocked].map(([k, v]) => [k, v > 0])
    ),
  }
}

function broadcast() {
  const msg = `data: ${JSON.stringify(currentState())}\n\n`
  for (const client of [...sseClients]) {
    try { client.write(msg) } catch { sseClients.delete(client) }
  }
}

export function registerSseClient(res: Response): void {
  sseClients.add(res)
  try { res.write(`data: ${JSON.stringify(currentState())}\n\n`) } catch {}
}

export function unregisterSseClient(res: Response): void {
  sseClients.delete(res)
}

export function acquireSyncLock(): boolean {
  if (syncLocked) return false
  syncLocked = true
  broadcast()
  return true
}

export function releaseSyncLock(): void {
  if (!syncLocked) return
  syncLocked = false
  broadcast()
}

export function tryAcquireShopLock(shopCode: string): boolean {
  if ((shopSaveLocked.get(shopCode) ?? 0) > 0) return false
  shopSaveLocked.set(shopCode, 1)
  broadcast()
  return true
}

export function releaseShopLock(shopCode: string): void {
  const n = shopSaveLocked.get(shopCode) ?? 1
  if (n <= 1) shopSaveLocked.delete(shopCode)
  else shopSaveLocked.set(shopCode, n - 1)
  broadcast()
}
