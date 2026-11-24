import { describe, expect, it } from 'vitest'
import { findIncompleteCatalogItems, findMissingImageGroups, countMissingImages, missingImageRows, findPendingItems, findStockShortages, summarizePending } from './pending-items'
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
    const groups = findMissingImageGroups([item('shown'), item('hidden', { disabled: 1 }), item('with-image', { image: '/a.png' })])
    expect(groups).toEqual([{ kind: 'item', item: expect.objectContaining({ name: 'shown' }) }])
  })

  it('groups variants under their template and keeps complete families out', () => {
    const groups = findMissingImageGroups([
      item('shirt', { has_variants: 1, image: '/shirt.png' }), item('shirt-10', { variant_of: 'shirt' }), item('shirt-2', { variant_of: 'shirt', image: '/s2.png' }), item('shirt-off', { variant_of: 'shirt', disabled: 1 }),
      item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap', image: '/red.png' }),
      item('done', { has_variants: 1, image: '/d.png' }), item('done-1', { variant_of: 'done', image: '/d1.png' }),
      item('orphan', { variant_of: 'missing-template' }),
    ])
    expect(groups.map((group) => group.kind === 'item' ? group.item.name : group.template.name)).toEqual(['shirt', 'cap', 'orphan'])
    const [shirt, cap] = groups
    expect(shirt).toMatchObject({ kind: 'family', templateMissing: false })
    if (shirt.kind !== 'family' || cap.kind !== 'family') throw new Error('expected families')
    expect(shirt.variants.map((variant) => variant.name)).toEqual(['shirt-2', 'shirt-10'])
    expect(shirt.missingVariants.map((variant) => variant.name)).toEqual(['shirt-10'])
    expect(cap).toMatchObject({ templateMissing: true, missingVariants: [] })
    expect(cap.variantsWithImage.map((variant) => variant.name)).toEqual(['cap-red'])
    expect(countMissingImages(groups)).toBe(3)
  })

  it('flattens missing images by view', () => {
    const groups = findMissingImageGroups([item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap' }), item('cap-blue', { variant_of: 'cap', image: '/b.png' }), item('bowl')])
    const names = (view: 'list' | 'templates' | 'variants') => missingImageRows(groups, view).map((row) => `${row.role}:${row.item.name}`)
    expect(names('list')).toEqual(['template:cap', 'variant:cap-red', 'item:bowl'])
    expect(names('templates')).toEqual(['template:cap'])
    expect(names('variants')).toEqual(['variant:cap-red'])
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


describe('summarizePending', () => {
  const item = (name: string, extra: Partial<VariantItem> = {}) => ({ name, item_name: name, item_group: 'Productos', stock_uom: 'Pza', disabled: 0, has_variants: 0, image: '/files/x.png', ...extra }) as VariantItem
  const price = (item_code: string, price_list: string, buying: boolean, rate = 100) => ({ name: `${item_code}-${price_list}`, item_code, price_list, price_list_rate: rate, buying: buying ? 1 : 0, selling: buying ? 0 : 1, currency: 'MXN' }) as ItemPrice
  const preferences = { buyingPriceList: 'Compra', sellingPriceList: 'Venta', lowMarginThreshold: 10 }

  it('counts each pending category the way the Pendientes tabs do', () => {
    const items = [item('Martillo'), item('Pinzas', { image: '' }), item('Taladro', { item_group: '' }), item('Gorra', { has_variants: 1 })]
    const prices = [price('Martillo', 'Compra', true, 95), price('Martillo', 'Venta', false), price('Taladro', 'Compra', true, 50), price('Taladro', 'Venta', false)]
    expect(summarizePending({ items, prices, stock: null, imagesReady: true, preferences }, '2026-11-24')).toEqual({ prices: 1, templates: 1, margin: 1, images: 1, stock: null, data: 1 })
  })

  it('leaves images unknown until the catalog tracks them', () => {
    expect(summarizePending({ items: [item('Pinzas', { image: '' })], prices: [], stock: { bins: [], warehouses: [] }, imagesReady: false, preferences }).images).toBeNull()
  })
})
