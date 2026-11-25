import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PendingImages } from './pending-images'
import { useFamilyExpansion } from './use-family-expansion'
import { familyTemplateNames, findMissingImageGroups, missingImageRows, type MissingImageView } from '../lib/pending-items'
import type { VariantItem } from '../lib/types'

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }))
vi.mock('../lib/product-image-cache', () => ({ readProductImage: async () => null, writeProductImage: async () => undefined }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const item = (name: string, overrides: Partial<VariantItem> = {}): VariantItem => ({ name, item_name: name, ...overrides })

describe('PendingImages', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    if (root) act(() => root.unmount())
    container?.remove()
  })

  async function render(items: VariantItem[], view: MissingImageView = 'tree') {
    const client = { setItemImage: vi.fn(async (_name: string, url: string) => url), isExternalImageUrl: (url: string) => url.startsWith('https://'), getImage: vi.fn(async () => new Blob(['x'])), getDocument: vi.fn() }
    const onImagesSaved = vi.fn(async () => false)
    const onMessage = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      const groups = findMissingImageGroups(items)
      // The page owns the expansion and its "expand all" control; the harness stands in for it.
      function Harness() {
        const expansion = useFamilyExpansion(familyTemplateNames(groups), '')
        return createElement('div', null,
          createElement('button', { type: 'button', 'aria-label': 'toggle-all', onClick: expansion.toggleAll }),
          createElement(PendingImages, { client: client as never, profileId: 'profile', view, groups, rows: view === 'tree' ? [] : missingImageRows(groups, view), expansion, empty: null, onAssignImage: () => undefined, onImagesSaved, onMessage }))
      }
      root.render(createElement(Harness))
    })
    return { client, onImagesSaved, onMessage }
  }

  const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent?.includes(label) || candidate.getAttribute('aria-label')?.includes(label))
  const click = async (element: HTMLElement | undefined) => {
    expect(element).toBeDefined()
    await act(async () => { element!.click() })
  }

  it('applies the template image to every variant without one after confirming', async () => {
    const { client, onImagesSaved } = await render([item('shirt', { has_variants: 1, image: '/files/shirt.png' }), item('shirt-s', { variant_of: 'shirt' }), item('shirt-m', { variant_of: 'shirt' }), item('shirt-l', { variant_of: 'shirt', image: '/files/l.png' })])
    await click(button('pendingPage.images.applyToVariants'))
    await click(button('pendingPage.images.applyConfirm'))
    expect(client.setItemImage.mock.calls).toEqual([['shirt-m', '/files/shirt.png'], ['shirt-s', '/files/shirt.png']])
    expect(onImagesSaved).toHaveBeenCalledWith([expect.objectContaining({ name: 'shirt-m' }), expect.objectContaining({ name: 'shirt-s' })], '/files/shirt.png')
  })

  it('lets the template take the image of its only variant with one', async () => {
    const { client } = await render([item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap', image: '/files/red.png' })])
    await click(button('pendingPage.images.useVariantImage'))
    await click(button('pendingPage.images.useForTemplate'))
    expect(client.setItemImage).toHaveBeenCalledWith('cap', '/files/red.png')
  })

  it('starts collapsed and shows the variants when expanded', async () => {
    await render([item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap' })])
    const toggle = button('pendingPage.images.showVariants')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.pending-variant-row')).toBeNull()
    await click(toggle)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.pending-variant-row h3')?.textContent).toBe('cap-red')
  })

  it('expands and collapses every family at once', async () => {
    await render([item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap' }), item('bowl', { has_variants: 1 }), item('bowl-xl', { variant_of: 'bowl' })])
    await click(button('toggle-all'))
    expect(container.querySelectorAll('.pending-variant-row')).toHaveLength(2)
    await click(button('toggle-all'))
    expect(container.querySelector('.pending-variant-row')).toBeNull()
  })

  it('opens a shown image larger and closes it', async () => {
    await render([item('bowl', { has_variants: 1, image: 'https://cdn.example/bowl.png' }), item('bowl-xl', { variant_of: 'bowl' })])
    await click(button('productImages.viewFor'))
    expect(document.querySelector('.image-preview-frame img')?.getAttribute('src')).toBe('https://cdn.example/bowl.png')
    await click(button('common.close'))
    expect(document.querySelector('.image-preview-frame')).toBeNull()
  })

  it('shows only the variants without an image in the variants view', async () => {
    const { client } = await render([item('shirt', { has_variants: 1, image: '/files/shirt.png' }), item('shirt-s', { variant_of: 'shirt' }), item('shirt-m', { variant_of: 'shirt', image: '/files/m.png' }), item('bowl')], 'variants')
    expect(Array.from(container.querySelectorAll('.pending-row h2')).map((heading) => heading.textContent)).toEqual(['shirt-s'])
    await click(button('pendingPage.assignTemplateImage'))
    expect(client.setItemImage).toHaveBeenCalledWith('shirt-s', '/files/shirt.png')
  })

  it('lets the template pick among several variant images', async () => {
    const { client } = await render([item('cap', { has_variants: 1 }), item('cap-red', { variant_of: 'cap', image: '/files/red.png' }), item('cap-blue', { variant_of: 'cap', image: '/files/blue.png' })], 'templates')
    const trigger = button('pendingPage.images.useVariantImage')
    await act(async () => { trigger!.focus(); trigger!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })) })
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    expect(options.map((option) => option.textContent)).toEqual(['cap-blue', 'cap-red'])
    await click(options[1])
    await click(button('pendingPage.images.useForTemplate'))
    expect(client.setItemImage).toHaveBeenCalledWith('cap', '/files/red.png')
  })

  it('loads the thumbnail of an image that is not cached yet', async () => {
    const createObjectURL = vi.fn(() => 'blob:thumb')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    await render([item('bowl', { has_variants: 1, image: '/files/bowl.png' }), item('bowl-xl', { variant_of: 'bowl' })])
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.querySelector('.pending-family-head img')?.getAttribute('src')).toBe('blob:thumb')
  })
})

