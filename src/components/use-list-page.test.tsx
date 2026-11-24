import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useListPage } from './use-list-page'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const rows = Array.from({ length: 60 }, (_, index) => `row-${index + 1}`)

function List({ search, onPageChange }: { search: string; onPageChange?: (page: number) => void }) {
  const page = useListPage(rows.filter((row) => row.includes(search)), search, { onPageChange })
  return createElement('div', null, createElement('ul', null, page.rows.map((row) => createElement('li', { key: row }, row))), page.pagination)
}

describe('useListPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(search: string, onPageChange?: (page: number) => void) {
    await act(async () => { root.render(createElement(List, { search, onPageChange })) })
  }
  const items = () => Array.from(container.querySelectorAll('li')).map((item) => item.textContent)
  const next = () => act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="pagination.next"]')!.click() })

  it('pages the rows and returns to the first page when the search changes', async () => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    const onPageChange = vi.fn()
    await render('', onPageChange)
    expect(items()).toHaveLength(25)
    await next()
    expect(items()[0]).toBe('row-26')
    expect(onPageChange).toHaveBeenCalledWith(2)
    await render('row-1')
    expect(items()[0]).toBe('row-1')
  })

  it('starts with the page size remembered in this browser', async () => {
    localStorage.setItem('mauricio-erpnext:list-page-size', '50')
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    await render('')
    expect(items()).toHaveLength(50)
  })
})
