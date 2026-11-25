import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ProductImage } from './product-image'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))
vi.mock('../lib/product-image-cache', () => ({ readProductImage: async () => null, writeProductImage: async () => undefined }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('ProductImage', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('opens the viewer without activating the clickable row around it', async () => {
    const onRowClick = vi.fn()
    const client = { isExternalImageUrl: () => true }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement('div', { onClick: onRowClick }, createElement(ProductImage, { client: client as never, profileId: 'profile', item: { name: 'bowl', image: 'https://cdn.example/bowl.png' }, previewable: true })))
    })
    const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    await act(async () => { button('productImages.viewFor').click() })
    expect(document.querySelector('.image-preview-frame img')?.getAttribute('src')).toBe('https://cdn.example/bowl.png')
    await act(async () => { button('common.close').click() })
    expect(document.querySelector('.image-preview-frame')).toBeNull()
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('shows a plain image when it is not previewable', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(ProductImage, { client: { isExternalImageUrl: () => true } as never, profileId: 'profile', item: { name: 'bowl', image: 'https://cdn.example/bowl.png' } }))
    })
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })
})
