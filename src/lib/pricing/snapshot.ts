import type { ProductConfig } from '@/lib/config-types'
import { PricingError, calcItem } from './calc'
import type { SelectedOption } from './types'

export interface ItemSelection {
  productTypeId: string
  modelId: string | null
  optionIds: string[]
  widthM: number | null
  heightM: number | null
  /** valor combinado — só para produto de preço manual */
  manualPrice: number | null
  qty: number
  /** ajuste livre em R$ aplicado uma vez na linha (positivo ou negativo) */
  extraValue: number | null
  /** observação do item, visível ao cliente */
  note: string
}

export interface ItemSnapshot {
  product_type_id: string
  product_name: string
  model_id: string | null
  model_name: string | null
  model_photo_url: string | null
  width_m: number | null
  height_m: number | null
  area_m2: number | null
  qty: number
  unit_base_price: number
  selected_options: SelectedOption[]
  unit_total: number
  line_total: number
  extra_value: number
  note: string
}

export function buildSnapshot(product: ProductConfig, sel: ItemSelection): ItemSnapshot {
  if (product.id !== sel.productTypeId) throw new PricingError('Produto não corresponde à seleção')

  const selected: SelectedOption[] = sel.optionIds.map(id => {
    for (const g of product.option_groups) {
      const o = g.options.find(o => o.id === id)
      if (o)
        return {
          optionId: o.id,
          group: g.name,
          label: o.label,
          surchargeType: o.surcharge_type,
          surchargeValue: o.surcharge_value,
        }
    }
    throw new PricingError('Opção selecionada não existe mais — atualize o item')
  })

  for (const g of product.option_groups) {
    if (g.required && !g.options.some(o => sel.optionIds.includes(o.id))) {
      throw new PricingError(`Selecione uma opção em "${g.name}"`)
    }
  }

  let model = null
  if (sel.modelId) {
    model = product.models.find(m => m.id === sel.modelId) ?? null
    if (!model) throw new PricingError('Modelo selecionado não existe mais — atualize o item')
  }

  const totals = calcItem({
    pricingMode: product.pricing_mode,
    pricePerM2: product.price_per_m2,
    basePrice: product.base_price,
    manualPrice: sel.manualPrice,
    widthM: sel.widthM,
    heightM: sel.heightM,
    qty: sel.qty,
    options: selected,
    modelSurcharge: model?.surcharge ?? 0,
    extraValue: sel.extraValue,
  })

  const keepDims = product.pricing_mode !== 'fixo' // m2 obrigatório; manual opcional-informativo
  return {
    product_type_id: product.id,
    product_name: product.name,
    model_id: model?.id ?? null,
    model_name: model?.name ?? null,
    model_photo_url: model?.photo_url ?? null,
    width_m: keepDims ? sel.widthM : null,
    height_m: keepDims ? sel.heightM : null,
    area_m2: totals.areaM2,
    qty: sel.qty,
    unit_base_price: totals.unitBasePrice,
    selected_options: selected,
    unit_total: totals.unitTotal,
    line_total: totals.lineTotal,
    extra_value: sel.extraValue ?? 0,
    note: sel.note.trim(),
  }
}
