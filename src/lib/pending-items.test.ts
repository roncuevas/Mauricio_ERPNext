import { describe, expect, it } from 'vitest'
import { findIncompleteCatalogItems, findMissingImages, findPendingItems, findStockShortages } from './pending-items'
import type { ItemPrice, StockBin, VariantItem } from './types'

const item = (name: string, fields: Partial<VariantItem> = {}): VariantItem => ({ name, ...fields })
const price = (item_code: string, price_list: string, kind: 'buying' | 'selling', fields: Partial<ItemPrice> = {}): ItemPrice => ({ name: `${item_code}-${price_list}-${kind}`, item_code, price_list, [kind]: 1, ...fields })

describe('findPendingItems', () => {
  it('finds standalone items and variants missing either configured active price', () => {
    const items = [item('plain'), item('variant', { variant_of: 'template' }), item('complete')]
    const prices = [price('complete', 'Standard Buying', 'buying'), price('complete', 'Standard Selling', 'selling')]
    expect(findPendingItems(items, prices, { buying: 'Standard Buying', selling: 'Standard Selling' })).toEqual([
      { item: items[0], kind: 'item', missingPrices: ['buying', 'selling'], inheritedPrices: [] },
      { item: items[1], kind: 'variant', missingPrices: ['buying', 'selling'], inheritedPrices: [] },
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

  const lists = { buying: 'Standard Buying', selling: 'Standard Selling' }

  it('ignores customer, supplier and batch prices like ERPNext without a party', () => {
    const target = item('target')
    const prices = [price('target', 'Standard Buying', 'buying', { supplier: 'SUP-1' }), price('target', 'Standard Selling', 'selling', { customer: 'CUST-1' }), price('target', 'Standard Selling', 'selling', { name: 'batch', batch_no: 'B-1' })]
    expect(findPendingItems([target], prices, lists)[0].missingPrices).toEqual(['buying', 'selling'])
  })

  it('only asks for the prices an item is used for', () => {
    const internal = item('internal', { is_sales_item: 0 })
    const service = item('service', { is_purchase_item: 0 })
    const unused = item('unused', { is_sales_item: 0, is_purchase_item: 0 })
    expect(findPendingItems([internal, service, unused], [], lists).map(({ item: row, missingPrices }) => [row.name, missingPrices])).toEqual([['internal', ['buying']], ['service', ['selling']]])
  })

  it('marks variant prices inherited from the template and lists them last', () => {
    const template = item('template', { has_variants: 1 })
    const inherited = item('inherited', { variant_of: 'template' })
    const plain = item('plain')
    const prices = [price('template', 'Standard Selling', 'selling'), price('template', 'Standard Buying', 'buying'), price('plain', 'Standard Buying', 'buying')]
    expect(findPendingItems([template, inherited, plain], prices, lists)).toEqual([
      { item: plain, kind: 'item', missingPrices: ['selling'], inheritedPrices: [] },
      { item: inherited, kind: 'variant', missingPrices: [], inheritedPrices: ['buying', 'selling'] },
    ])
  })
})

describe('other pending checks', () => {
  it('skips disabled items without an image', () => {
    expect(findMissingImages([item('shown'), item('hidden', { disabled: 1 }), item('with-image', { image: '/a.png' })]).map(({ item: row }) => row.name)).toEqual(['shown'])
  })

  it('keeps brand as an optional field', () => {
    expect(findIncompleteCatalogItems([item('brandless', { item_group: 'Food', stock_uom: 'Nos' }), item('no-group', { stock_uom: 'Nos', brand: 'X' })])).toEqual([
      { item: expect.objectContaining({ name: 'no-group' }), missingFields: ['item_group'], optionalFields: [] },
      { item: expect.objectContaining({ name: 'brandless' }), missingFields: [], optionalFields: ['brand'] },
    ])
  })

  it('filters stock shortages by warehouse', () => {
    const stocked = item('food', { is_stock_item: 1 })
    const bins: StockBin[] = [{ item_code: 'food', warehouse: 'Store', actual_qty: 0 }, { item_code: 'food', warehouse: 'Backroom', actual_qty: 5 }]
    const warehouses = [{ name: 'Store' }, { name: 'Backroom' }]
    expect(findStockShortages([stocked], bins, warehouses)).toEqual([])
    expect(findStockShortages([stocked], bins, warehouses, 'Store')).toEqual([expect.objectContaining({ status: 'out', actualQty: 0 })])
  })
})

