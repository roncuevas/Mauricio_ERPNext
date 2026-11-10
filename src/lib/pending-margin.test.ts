import { describe, expect, it } from 'vitest'
import { findLowMarginPrices } from './pending-items'
import type { ItemPrice, VariantItem } from './types'

const item: VariantItem = { name: 'FOOD-1', item_name: 'Food' }
const price = (name: string, fields: Partial<ItemPrice>): ItemPrice => ({ name, item_code: item.name, price_list_rate: 100, ...fields })

describe('findLowMarginPrices', () => {
  it('returns each active selling price using the highest comparable Standard Buying cost', () => {
    const prices = [
      price('buy-low', { buying: 1, price_list: 'Standard Buying', price_list_rate: 60 }),
      price('buy-high', { buying: 1, price_list: 'Standard Buying', price_list_rate: 90 }),
      price('other-list', { buying: 1, price_list: 'Other Buying', price_list_rate: 99 }),
      price('sale-a', { selling: 1, price_list: 'Retail', price_list_rate: 100 }),
      price('sale-b', { selling: 1, price_list: 'Wholesale', price_list_rate: 80 }),
    ]

    expect(findLowMarginPrices([item], prices, 10, '2026-11-10')).toEqual([
      expect.objectContaining({ selling: expect.objectContaining({ name: 'sale-b' }), purchase: expect.objectContaining({ name: 'buy-high' }), marginPercentage: -12.5 }),
      expect.objectContaining({ selling: expect.objectContaining({ name: 'sale-a' }), purchase: expect.objectContaining({ name: 'buy-high' }), marginPercentage: 10 }),
    ])
  })

  it('requires the same UOM and currency, active dates, and a comparable cost', () => {
    const prices = [
      price('buy-unit', { buying: 1, price_list: 'Standard Buying', uom: 'Unit', currency: 'MXN', price_list_rate: 95 }),
      price('buy-old', { buying: 1, price_list: 'Standard Buying', uom: 'Kg', currency: 'MXN', price_list_rate: 99, valid_upto: '2026-11-09' }),
      price('sale-unit', { selling: 1, price_list: 'Retail', uom: 'Unit', currency: 'MXN', price_list_rate: 100 }),
      price('sale-kg', { selling: 1, price_list: 'Retail', uom: 'Kg', currency: 'MXN', price_list_rate: 100 }),
      price('sale-usd', { selling: 1, price_list: 'Retail', uom: 'Unit', currency: 'USD', price_list_rate: 100 }),
      price('sale-future', { selling: 1, price_list: 'Retail', uom: 'Unit', currency: 'MXN', price_list_rate: 100, valid_from: '2026-11-11' }),
    ]

    expect(findLowMarginPrices([item], prices, 10, '2026-11-10').map(({ selling }) => selling.name)).toEqual(['sale-unit'])
  })

  it('skips missing or zero sales and disabled items', () => {
    const disabled = { ...item, disabled: 1 }
    const prices = [price('buy', { buying: 1, price_list: 'Standard Buying', price_list_rate: 100 }), price('zero', { selling: 1, price_list: 'Retail', price_list_rate: 0 })]
    expect(findLowMarginPrices([item, disabled], prices, 10, '2026-11-10')).toEqual([])
  })
})
