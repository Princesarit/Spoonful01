import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import RevenueView from './RevenueView'

export default async function RevenuePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return <RevenueView />
}
