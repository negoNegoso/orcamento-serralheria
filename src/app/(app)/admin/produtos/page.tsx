import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { deleteProduct, saveProduct } from './actions'
import { ProductForm } from './product-form'
import { SubmitButton } from '@/components/ui/submit-button'

export default async function ProdutosPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase.from('product_types').select('*').order('sort_order').order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data: products } = await query
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Preços</h1>
      <ul className="space-y-2">
        {(products ?? []).map(p => (
          <li key={p.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <Link href={`/admin/produtos/${p.id}`} className="font-medium underline">{p.name}</Link>
              <p className="text-sm text-muted-foreground">
                {(p.pricing_mode === 'm2' || p.pricing_mode === 'm2_direto') && `${formatBRL(p.price_per_m2 ?? 0)}/m²`}
                {p.pricing_mode === 'fixo' && formatBRL(p.base_price ?? 0)}
                {p.pricing_mode === 'manual' && 'Sob consulta'}
                {!p.active && ' · inativo'}
              </p>
            </div>
            <form action={deleteProduct.bind(null, p.id)}>
              <SubmitButton variant="ghost" size="sm" className="text-red-600">Excluir</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      <h2 className="font-semibold">Novo produto</h2>
      <ProductForm action={saveProduct} />
    </div>
  )
}
