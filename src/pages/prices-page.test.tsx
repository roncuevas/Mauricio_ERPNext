import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PriceManagementPage } from './prices-page'
import { queryKeys } from '../lib/query-keys'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('PriceManagementPage deep link', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    if (root) act(() => root.unmount())
    container?.remove()
  })

  it('opens the editor for an item that is already in the local catalog', async () => {
    const item = { name: 'ITEM-20-KG', item_name: 'Premio 20 kg', stock_uom: 'Nos', uoms: [{ uom: 'Nos', conversion_factor: 1 }, { uom: 'Kg', conversion_factor: 0.05 }] }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(queryKeys.catalog.variant('profile'), { items: [item] })
    queryClient.setQueryData(queryKeys.catalog.price('profile'), { prices: [] })
    queryClient.setQueryData(queryKeys.prices.lists('profile'), [{ name: 'Standard Selling', selling: 1 }])
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ['/prices/manage/ITEM-20-KG?returnTo=%2Fpos&priceList=Standard+Selling&uom=Kg'] },
          createElement(Routes, null, createElement(Route, { path: '/prices/manage/:itemName', element: createElement(PriceManagementPage, { client: {} as never, profileId: 'profile' }) })))))
    })

    expect(container.textContent).toContain('pricesPage.addPrice')
    expect(container.textContent).toContain('ITEM-20-KG')
  })
})
