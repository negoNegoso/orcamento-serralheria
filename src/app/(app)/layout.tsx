import { redirect } from 'next/navigation'
import { getCompany } from '@/lib/auth'
import { resolveAccess } from '@/lib/tenant'
import { readableTextColor } from '@/lib/color'
import { AppShell } from '@/components/nav/app-shell'
import { SuspendedNotice } from '@/components/nav/suspended-notice'

export async function generateMetadata() {
  const { company } = await getCompany()
  return { title: company ? `Orçamentos — ${company.business_area}` : 'Orçamentos' }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, company } = await getCompany()
  const access = resolveAccess(profile, company)
  if (access === 'sistema') redirect('/sistema/empresas')
  if (access === 'suspensa') return <SuspendedNotice companyName={company?.name ?? null} />

  const accent = company!.accent_color
  const onAccent = readableTextColor(accent)
  const vars = {
    '--primary': accent,
    '--sidebar-primary': accent,
    '--on-primary': onAccent,
    '--primary-foreground': onAccent,
  } as React.CSSProperties

  return (
    <div style={vars}>
      <AppShell profile={profile} company={company!}>{children}</AppShell>
    </div>
  )
}
