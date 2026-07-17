import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { QuoteEditor } from '@/components/quote/quote-editor'
import type { ClientHit } from '@/app/(app)/clientes/actions'

export default async function NovoOrcamento({ searchParams }: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const { cliente } = await searchParams
  const { supabase } = await getProfile()
  const products = await fetchProductConfigs(supabase)
  let initialClient: ClientHit | undefined
  if (cliente) {
    const { data } = await supabase.from('clients')
      .select('id, name, phone').eq('id', cliente).single()
    if (data) initialClient = data as ClientHit
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Novo orçamento</h1>
      <QuoteEditor products={products} initialClient={initialClient} />
    </div>
  )
}
