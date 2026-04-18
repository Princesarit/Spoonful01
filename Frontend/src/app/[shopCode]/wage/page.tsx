import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import WageView from './WageView'

export default async function WagePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return <WageView />
}
