import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/lib/data'
import ScheduleView from './ScheduleView'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return (
    <ScheduleView
      initialEmployees={db.employees.list(shopCode)}
      initialSchedules={db.schedules.list(shopCode)}
      role={session.role}
    />
  )
}
