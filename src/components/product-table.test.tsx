import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ProductTable } from './product-table'
import { useFamilyExpansion } from './use-family-expansion'
import { groupProductFamilies, productFamilyIndex } from '../lib/product-list'
import type { CachedItem, VariantItem } from '../lib/types'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string, options?: { count?: number; name?: string }) => options?.count !== undefined ? `${key}:${options.count}` : options?.name ? `${key}:${options.name}` : key, i18n: { language: 'es' } }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const catalog: CachedItem[] = [{ name: 'T', item_name: 'Croquetas' }, { name: 'T-1', item_name: 'Croquetas 1 kg' }, { name: 'T-2', item_name: 'Croquetas 4 kg' }, { name: 'S', item_name: 'Arroz' }]
const variants = [{ name: 'T', has_variants: 1 }, { name: 'T-1', variant_of: 'T' }, { name: 'T-2', variant_of: 'T' }] as VariantItem[]

describe('ProductTable families', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    if (root) act(() => root.unmount())
    container?.remove()
  })

  async function render() {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const index = productFamilyIndex(variants)
    const families = groupProductFamilies(catalog, catalog, index)
    function Harness() {
      const expansion = useFamilyExpansion(['T'], '')
      return createElement(ProductTable, { families, expansion, familyIndex: index, prices: [], variants, profileId: 'profile', client: {} as never, showImages: false, onOpen: () => undefined, onUom: () => undefined })
    }
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Harness))) })
  }

  const titles = () => Array.from(container.querySelectorAll('.product-table-desktop .product-table-title')).map((link) => link.textContent)

  it('marks templates and keeps their variants folded until opened', async () => {
    await render()
    expect(titles()).toEqual(['Croquetas', 'Arroz'])
    expect(container.querySelector('.product-table-desktop .product-table-family')?.textContent).toBe('catalog.table.templateVariants:2')
    const toggle = container.querySelector<HTMLButtonElement>('.product-table-desktop .product-table-family-toggle')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { toggle.click() })
    expect(titles()).toEqual(['Croquetas', 'Croquetas 1 kg', 'Croquetas 4 kg', 'Arroz'])
    expect(container.querySelectorAll('.product-table-desktop .product-table-row.is-child')).toHaveLength(2)
    expect(container.querySelector('.product-table-desktop .product-table-family-toggle')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('opens and closes every family from the toolbar', async () => {
    await render()
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="catalog.table.expandFamilies"]')!.click() })
    expect(titles()).toHaveLength(4)
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="catalog.table.collapseFamilies"]')!.click() })
    expect(titles()).toEqual(['Croquetas', 'Arroz'])
  })
})
