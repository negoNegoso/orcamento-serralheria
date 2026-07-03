import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import type { ProductConfig } from '@/lib/config-types'
import { saveProduct } from '../actions'
import { ProductForm } from '../product-form'
import { GroupEditor } from './group-editor'
import { ModelEditor } from './model-editor'

export default async function ProdutoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const { data } = await supabase.from('product_types')
    .select('*, option_groups(*, options(*)), models(*)')
    .eq('id', id).single()
  if (!data) notFound()
  const product = data as unknown as ProductConfig
  product.option_groups.sort((a, b) => a.sort_order - b.sort_order)
  product.option_groups.forEach(g => g.options.sort((a, b) => a.sort_order - b.sort_order))
  product.models.sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{product.name}</h1>
      <ProductForm product={product} action={saveProduct} />
      <GroupEditor productId={product.id} groups={product.option_groups} />
      <ModelEditor productId={product.id} models={product.models} />
    </div>
  )
}
