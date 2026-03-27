import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDeliveryRates, getDeliveryFee } from './actions'
import DeliveryRatesView from './DeliveryRatesView'

export default async function ConfigPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  const [rates, deliveryFee] = await Promise.all([
    getDeliveryRates(shopCode),
    getDeliveryFee(shopCode),
  ])

  return <DeliveryRatesView initialRates={rates} initialDeliveryFee={deliveryFee} role={session.role} />
}
