export interface OptionRow {
  id: string
  label: string
  surcharge_type: 'fixo' | 'por_m2'
  surcharge_value: number
  sort_order: number
  active: boolean
}

export interface OptionGroupRow {
  id: string
  name: string
  required: boolean
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
