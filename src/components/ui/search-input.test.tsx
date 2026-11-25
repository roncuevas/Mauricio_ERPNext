import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SearchInput } from './search-input'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('SearchInput', () => {
  let container: HTMLDivElement
  let root: Root
  afterEach(() => { act(() => root.unmount()); container.remove() })

  async function render(initial: string, clearable = false) {
    const onClear = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    function Harness() {
      const [value, setValue] = useState(initial)
      return createElement(SearchInput, { value, onChange: (event) => setValue(event.target.value), onClear: () => { onClear(); setValue('') }, clearable, 'aria-label': 'Buscar' })
    }
    await act(async () => { root.render(createElement(Harness)) })
    return onClear
  }
  const clearButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="common.clearSearch"]')

  it('clears the text and keeps focus in the field', async () => {
    const onClear = await render('croquetas')
    await act(async () => { clearButton()!.click() })
    expect(onClear).toHaveBeenCalledOnce()
    expect(container.querySelector('input')!.value).toBe('')
    expect(document.activeElement).toBe(container.querySelector('input'))
    expect(clearButton()).toBeNull()
  })

  it('stays available for an applied search after the text is erased', async () => {
    await render('', true)
    expect(clearButton()).not.toBeNull()
  })
})
