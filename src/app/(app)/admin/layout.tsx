import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { isCompanyAdmin } from '@/lib/tenant'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (!isCompanyAdmin(profile)) redirect('/')
  return <>{children}</>
}
