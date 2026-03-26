import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import type { Employee } from '@/lib/types'
import EmployeeView from './EmployeeView'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '')

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  let employees: Employee[] = []
  try {
    const res = await fetch(`${BACKEND_URL}/${shopCode}/employees`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: 'no-store',
    })
    if (res.ok) employees = await res.json()
  } catch { /* ใช้ [] แทน */ }

  return (
    <EmployeeView
      initialEmployees={employees}
      shopCode={shopCode}
      role={session.role}
    />
  )
}
