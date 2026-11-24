import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PendingPage } from './pending-page'
import { queryKeys } from '../lib/query-keys'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('PendingPage', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    if (root) act(() => root.unmount())
    container?.remove()
  })

  async function renderAt(url: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(queryKeys.catalog.variant('profile'), { updatedAt: '2026-11-23T00:00:00Z', imageFieldLoaded: true, items: [{ name: 'FOOD-1', item_name: 'Croquetas', item_group: 'Food', stock_uom: 'Nos', is_stock_item: 1 }] })
    queryClient.setQueryData(queryKeys.catalog.price('profile'), { updatedAt: '2026-11-23T00:00:00Z', prices: [] })
    queryClient.setQueryData(queryKeys.catalog.item('profile'), { items: [] })
    queryClient.setQueryData(queryKeys.catalog.stock('profile'), { updatedAt: '2026-11-23T00:00:00Z', companies: [], warehouses: [{ name: 'Tienda' }], bins: [{ item_code: 'FOOD-1', warehouse: 'Tienda', actual_qty: 0 }] })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client: queryClient },
        createElement(MemoryRouter, { initialEntries: [url] },
          createElement(Routes, null, createElement(Route, { path: '/pendientes', element: createElement(PendingPage, { client: {} as never, profileId: 'profile' }) })))))
    })
  }

  it('offers one action per missing price that returns to the same view', async () => {
    await renderAt('/pendientes?q=Croq')
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/prices/manage/"]'))
    expect(links.map((link) => new URL(link.href, 'http://x').searchParams.get('kind'))).toEqual(['buying', 'selling'])
    expect(new URL(links[0].href, 'http://x').searchParams.get('returnTo')).toBe('/pendientes?q=Croq')
  })

  it('restores the tab and search from the URL', async () => {
    await renderAt('/pendientes?tab=stock&q=Croq')
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('pendingPage.tabs.stock')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="pendingPage.search"]')?.value).toBe('Croq')
    expect(container.textContent).toContain('pendingPage.stockStatus.out')
  })

  it('filters prices by the missing kind', async () => {
    await renderAt('/pendientes?price=selling')
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/prices/manage/"]'))
    expect(links.map((link) => new URL(link.href, 'http://x').searchParams.get('kind'))).toEqual(['selling'])
    expect(container.querySelector('[aria-label="pendingPage.priceFilter.label"]')?.textContent).toContain('pendingPage.priceFilter.selling')
  })
})

