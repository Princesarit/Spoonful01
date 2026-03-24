import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import ExpenseView from './ExpenseView'

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()
  if (!session || session.shopCode !== shopCode) redirect('/')

  return <ExpenseView />
}
