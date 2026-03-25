import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getScheduleData } from './actions'
import ScheduleView from './ScheduleView'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  let employees = [], schedules = []
  try {
    const data = await getScheduleData(shopCode)
    employees = data.employees
    schedules = data.schedules
  } catch {
    // backend ไม่ตอบสนอง — แสดง UI ว่างเปล่า
  }

  return (
    <ScheduleView
      initialEmployees={employees}
      initialSchedules={schedules}
      role={session.role}
    />
  )
}
