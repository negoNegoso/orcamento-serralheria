import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import type { PriceCategory } from '@/lib/config-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  pricingModeLabel,
  priceLabel,
  groupsCountLabel,
  type PricingMode,
} from '@/lib/pricing/product-listing'
import { deleteProduct, saveProduct } from './actions'
import { ProductForm } from './product-form'
import { ActiveToggle } from './active-toggle'
import { NewProductPanel } from './new-product-panel'

export default async function ProdutosPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase
    .from('product_types')
    .select('*, option_groups(count)')
    .order('sort_order')
    .order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = (data ?? []) as any[]
  const { data: categoryData } = await supabase
    .from('price_categories')
    .select('*')
    .order('sort_order')
  const categories = (categoryData ?? []) as unknown as PriceCategory[]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Preços</h1>

      <NewProductPanel
        heading={
          <p className="text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
          </p>
        }
      >
        <ProductForm action={saveProduct} categories={categories} />
      </NewProductPanel>

      {products.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border">
          {products.map((p, i) => {
            const groupsCount = p.option_groups?.[0]?.count ?? 0
            const price = priceLabel(p)
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-4 p-4 ${i > 0 ? 'border-t' : ''} ${!p.active ? 'opacity-60' : ''}`}
              >
                <div className="min-w-0 space-y-1">
                  <Link href={`/admin/produtos/${p.id}`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <Badge variant="secondary">{pricingModeLabel(p.pricing_mode as PricingMode)}</Badge>
                    {price && <span className="font-medium text-foreground">{price}</span>}
                    <span>{groupsCountLabel(groupsCount)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ActiveToggle id={p.id} active={p.active} />
                  <Button
                    render={<Link href={`/admin/produtos/${p.id}`} />}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                  >
                    <Icon name="edit" />
                  </Button>
                  <form action={deleteProduct.bind(null, p.id)}>
                    <SubmitButton variant="ghost" size="icon-sm" className="text-destructive" aria-label="Excluir">
                      <Icon name="delete" />
                    </SubmitButton>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
