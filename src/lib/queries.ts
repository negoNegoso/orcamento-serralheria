import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductConfig } from '@/lib/config-types'

export async function fetchProductConfigs(supabase: SupabaseClient): Promise<ProductConfig[]> {
  const { data, error } = await supabase.from('product_types')
    .select('*, option_groups(*, options(*)), models(*)')
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(error.message)
  const products = (data ?? []) as unknown as ProductConfig[]
  for (const p of products) {
    p.option_groups.sort((a, b) => a.sort_order - b.sort_order)
    for (const g of p.option_groups) {
      g.options = g.options.filter(o => o.active).sort((a, b) => a.sort_order - b.sort_order)
    }
    p.models = p.models.filter(m => m.active).sort((a, b) => a.sort_order - b.sort_order)
  }
  return products
}
