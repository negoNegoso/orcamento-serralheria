export type PricingMode = 'm2' | 'fixo' | 'manual'
export type SurchargeType = 'fixo' | 'por_m2'

export interface SelectedOption {
  optionId?: string
  group: string
  label: string
  surchargeType: SurchargeType
  surchargeValue: number
}

export interface ItemInput {
  pricingMode: PricingMode
  pricePerM2?: number | null
  basePrice?: number | null
  /** modo manual: valor combinado, digitado pelo vendedor (produto orçado pela responsável) */
  manualPrice?: number | null
  widthM?: number | null
  heightM?: number | null
  qty: number
  options: SelectedOption[]
  modelSurcharge?: number
  /** ajuste livre em R$ aplicado uma vez na linha (positivo ou negativo) */
  extraValue?: number | null
}

export interface ItemTotals {
  areaM2: number | null
  unitBasePrice: number
  unitTotal: number
  lineTotal: number
}
