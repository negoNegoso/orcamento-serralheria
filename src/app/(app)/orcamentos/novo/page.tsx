import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { QuoteEditor } from '@/components/quote/quote-editor'

export default async function NovoOrcamento() {
  const { supabase } = await getProfile()
  const products = await fetchProductConfigs(supabase)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Novo orçamento</h1>
      <QuoteEditor products={products} />
    </div>
  )
}
