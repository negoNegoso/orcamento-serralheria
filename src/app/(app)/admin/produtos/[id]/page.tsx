import { notFound } from 'next/navigation'
import { getCompany } from '@/lib/auth'
import type { GroupTemplateRow, PriceCategory, ProductConfig } from '@/lib/config-types'
import { saveProduct } from '../actions'
import { ProductForm } from '../product-form'
import { GroupEditor } from './group-editor'
import { ModelEditor } from './model-editor'

export default async function ProdutoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, company } = await getCompany()
  const [{ data }, { data: templateData }, { data: categoryData }] = await Promise.all([
    supabase.from('product_types')
      .select('*, option_groups(*, options(*)), models(*)')
      .eq('id', id).single(),
    supabase.from('option_group_templates')
      .select('*, option_templates(*)')
      .order('name'),
    supabase.from('price_categories')
      .select('*')
      .order('sort_order'),
  ])
  if (!data) notFound()
  const product = data as unknown as ProductConfig
  product.option_groups.sort((a, b) => a.sort_order - b.sort_order)
  product.option_groups.forEach(g => g.options.sort((a, b) => a.sort_order - b.sort_order))
  product.models.sort((a, b) => a.sort_order - b.sort_order)
  const templates = (templateData ?? []) as unknown as GroupTemplateRow[]
  const categories = (categoryData ?? []) as unknown as PriceCategory[]
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{product.name}</h1>
      <ProductForm product={product} action={saveProduct} categories={categories} />
      <GroupEditor
        productId={product.id}
        groups={product.option_groups}
        templates={templates}
        categories={categories}
      />
      <ModelEditor productId={product.id} models={product.models} companyId={company!.id} />
    </div>
  )
}
