import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getShopConfig } from '@/lib/config'
import { ShopProvider } from '@/components/ShopProvider'
import { ShopHeader } from '@/components/ShopHeader'

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ shopCode: string }>
}) {
  const { shopCode } = await params
  const session = await getSession()

  if (!session || session.shopCode !== shopCode) {
    redirect('/')
  }

  const shop = await getShopConfig(shopCode)
  if (!shop) redirect('/')

  return (
    <ShopProvider session={session} shop={shop}>
      <div className="min-h-screen bg-brand-parchment">
        <ShopHeader shopName={shop.name} role={session.role} />
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </div>
    </ShopProvider>
  )
}
