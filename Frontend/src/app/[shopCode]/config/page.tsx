import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDeliveryRates, getDeliverySuppliers } from './actions'
import DeliveryRatesView from './DeliveryRatesView'

export default async function ConfigPage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  const [rates, suppliers] = await Promise.all([
    getDeliveryRates(shopCode),
    getDeliverySuppliers(shopCode),
  ])

  return <DeliveryRatesView initialRates={rates} initialSuppliers={suppliers} role={session.role} />
}
