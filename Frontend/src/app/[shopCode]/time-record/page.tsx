import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import TimeRecordView from './TimeRecordView'

export default async function TimeRecordPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return <TimeRecordView />
}
