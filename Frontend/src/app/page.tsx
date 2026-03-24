import { getShops } from '@/lib/config'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const shops = await getShops()
  return <LoginForm shops={shops} />
}
