import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/lib/data'
import EmployeeView from './EmployeeView'

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return (
    <EmployeeView
      initialEmployees={db.employees.list(shopCode)}
      shopCode={shopCode}
      role={session.role}
    />
  )
}
