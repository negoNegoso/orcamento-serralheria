export interface OptionRow {
  id: string
  label: string
  surcharge_type: 'fixo' | 'por_m2'
  surcharge_value: number
  price_category_id: string | null
  sort_order: number
  active: boolean
}

export interface OptionGroupRow {
  id: string
  name: string
  required: boolean
  price_category_id: string | null
  sort_order: number
  options: OptionRow[]
}

export interface ModelRow {
  id: string
  name: string
  photo_url: string | null
  surcharge: number
  surcharge_type: 'fixo' | 'por_m2'
  active: boolean
  sort_order: number
}

export interface ProductConfig {
  id: string
  name: string
  pricing_mode: 'm2' | 'm2_direto' | 'fixo' | 'manual'
  price_per_m2: number | null
  base_price: number | null
  price_category_id: string | null
  active: boolean
  sort_order: number
  option_groups: OptionGroupRow[]
  models: ModelRow[]
}

export interface OptionTemplateRow {
  id: string
  label: string
  surcharge_type: 'fixo' | 'por_m2'
  surcharge_value: number
  sort_order: number
}

export interface GroupTemplateRow {
  id: string
  name: string
  required: boolean
  option_templates: OptionTemplateRow[]
}

// Catálogo global de categorias de preço (custo | insumo | repasse).
// Igual para todas as empresas — ver supabase/migrations/0029_price_categories.sql
export interface PriceCategory {
  id: string
  slug: string
  name: string
  sort_order: number
}
