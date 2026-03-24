import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import SummaryView from './SummaryView'

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return <SummaryView />
}
