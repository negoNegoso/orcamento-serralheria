'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      className="text-muted-foreground underline"
      onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh() }}
    >
      Sair
    </button>
  )
}
