import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getExtraRate } from '../config/actions'
import ExtraRateView from './ExtraRateView'

export default async function ExtraRatePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  const rate = await getExtraRate(shopCode)

  return <ExtraRateView initialExtraRate={rate} role={session.role} />
}
