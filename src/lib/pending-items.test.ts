import { describe, expect, it } from 'vitest'
import { findPendingItems } from './pending-items'
import type { ItemPrice, VariantItem } from './types'

const item = (name: string, fields: Partial<VariantItem> = {}): VariantItem => ({ name, ...fields })
const price = (item_code: string, price_list: string, kind: 'buying' | 'selling', fields: Partial<ItemPrice> = {}): ItemPrice => ({ name: `${item_code}-${price_list}-${kind}`, item_code, price_list, [kind]: 1, ...fields })

describe('findPendingItems', () => {
  it('finds standalone items and variants missing either configured active price', () => {
    const items = [item('plain'), item('variant', { variant_of: 'template' }), item('complete')]
    const prices = [price('complete', 'Standard Buying', 'buying'), price('complete', 'Standard Selling', 'selling')]
    expect(findPendingItems(items, prices, { buying: 'Standard Buying', selling: 'Standard Selling' })).toEqual([
      { item: items[0], kind: 'item', missingPrices: ['buying', 'selling'] },
      { item: items[1], kind: 'variant', missingPrices: ['buying', 'selling'] },
    ])
  })

  it('uses exact lists, price type and validity dates', () => {
    const target = item('target')
    const prices = [price('target', 'Other', 'buying'), price('target', 'Standard Selling', 'selling', { valid_upto: '2025-01-01' })]
    expect(findPendingItems([target], prices, { buying: 'Standard Buying', selling: 'Standard Selling' }, '2026-11-10')[0].missingPrices).toEqual(['buying', 'selling'])
    expect(findPendingItems([target], [price('target', 'Standard Buying', 'buying')], { buying: 'Standard Buying', selling: 'Standard Selling' })[0].missingPrices).toEqual(['selling'])
  })

  it('flags empty templates, excludes populated templates and disabled items', () => {
    const empty = item('empty-template', { has_variants: 1 })
    const populated = item('populated', { has_variants: 1 })
    const hidden = item('hidden', { disabled: 1 })
    const child = item('child', { variant_of: 'populated' })
    const childPrices = [price('child', '', 'buying'), price('child', '', 'selling')]
    expect(findPendingItems([empty, populated, child, hidden], childPrices, { buying: '', selling: '' }).map(({ item: row, kind }) => [row.name, kind])).toEqual([['empty-template', 'template']])
  })
})
