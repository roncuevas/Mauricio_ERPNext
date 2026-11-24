import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const options = Array.from({ length: 9 }, (_, index) => `option-${index + 1}`)

describe('Select', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(searchable?: boolean) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(Select, { searchable, value: 'option-1' },
        createElement(SelectTrigger, { className: 'my-trigger', 'aria-label': 'Choice' }, createElement(SelectValue)),
        createElement(SelectContent, null, options.map((value) => createElement(SelectItem, { key: value, value }, createElement('span', null, createElement('i', null), `Label ${value}`))))))
    })
  }

  it('turns a list of more than 8 options into a search box that reads nested labels', async () => {
    await render()
    expect(container.querySelector('.my-trigger')).toBeNull()
    expect(container.textContent).toContain('Label option-1')
  })

  it('keeps the plain select when search is turned off', async () => {
    await render(false)
    expect(container.querySelector('.my-trigger')).not.toBeNull()
  })
})
