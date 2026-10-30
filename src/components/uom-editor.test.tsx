import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { UomEditor, type UomEditorValues } from './uom-editor'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

beforeAll(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const initialValues: UomEditorValues = {
  stockUom: 'Kg',
  salesUom: '',
  purchaseUom: '',
  conversions: [{ uom: 'Unit', conversion_factor: 25 }],
}

describe('UomEditor stock UOM confirmation', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    if (root) act(() => root.unmount())
    container?.remove()
  })

  async function renderEditor(onSave = vi.fn()) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(UomEditor, {
        itemName: 'ITEM-001',
        itemLabel: 'Example item',
        values: initialValues,
        uomOptions: [],
        busy: false,
        error: '',
        onSave,
        onCancel: vi.fn(),
      }))
    })
    return onSave
  }

  async function openBaseChangeDialog() {
    const stockUomInput = container.querySelector<HTMLInputElement>('input[list="uom-options"]')
    const form = container.querySelector('form')
    if (!stockUomInput || !form) throw new Error('UOM editor controls not found')

    const propsKey = Object.keys(stockUomInput).find((key) => key.startsWith('__reactProps'))
    const inputProps = propsKey ? (stockUomInput as unknown as Record<string, { onChange?: (event: unknown) => void; onBlur?: (event: unknown) => void }>)[propsKey] : undefined
    if (!inputProps?.onChange || !inputProps.onBlur) throw new Error('React input handlers not found')
    await act(async () => {
      Object.defineProperty(stockUomInput, 'value', { configurable: true, value: 'Unit' })
      inputProps.onChange?.({ target: stockUomInput, currentTarget: stockUomInput })
    })
    await act(async () => {
      const nextPropsKey = Object.keys(stockUomInput).find((key) => key.startsWith('__reactProps'))
      const nextProps = nextPropsKey ? (stockUomInput as unknown as Record<string, { onBlur?: (event: unknown) => void }>)[nextPropsKey] : undefined
      nextProps?.onBlur?.({ target: stockUomInput, currentTarget: stockUomInput })
    })
    const formPropsKey = Object.keys(form).find((key) => key.startsWith('__reactProps'))
    const formProps = formPropsKey ? (form as unknown as Record<string, { onSubmit?: (event: unknown) => void }>)[formPropsKey] : undefined
    if (!formProps?.onSubmit) throw new Error('React form handler not found')
    await act(async () => {
      formProps.onSubmit?.({ preventDefault: vi.fn() })
    })
  }

  it('requires acknowledgement and canceling never saves', async () => {
    const onSave = await renderEditor()
    await openBaseChangeDialog()

    const dialog = document.body.querySelector('[role="alertdialog"]')
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'uomEditor.confirmStockUomChange')
    const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'uomEditor.cancel')
    expect(confirm?.hasAttribute('disabled')).toBe(true)

    await act(async () => cancel?.click())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves only after the user acknowledges the reviewed factors', async () => {
    const onSave = await renderEditor()
    await openBaseChangeDialog()

    const dialog = document.body.querySelector('[role="alertdialog"]')
    const checkbox = dialog?.querySelector<HTMLButtonElement>('[role="checkbox"]')
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'uomEditor.confirmStockUomChange')
    expect(dialog?.textContent).toContain('1 Kg = 0.04 Unit')
    expect(confirm?.hasAttribute('disabled')).toBe(true)

    await act(async () => checkbox?.click())
    expect(confirm?.hasAttribute('disabled')).toBe(false)
    expect(checkbox?.getAttribute('data-state')).toBe('checked')
    await act(async () => confirm?.click())

    expect(onSave).toHaveBeenCalledWith({
      stockUom: 'Unit',
      salesUom: '',
      purchaseUom: '',
      conversions: [{ uom: 'Kg', conversion_factor: 0.04 }],
    })
  })

  it('saves ordinary UOM edits without a stock-base confirmation', async () => {
    const onSave = await renderEditor()
    const form = container.querySelector('form')
    const formPropsKey = form && Object.keys(form).find((key) => key.startsWith('__reactProps'))
    const formProps = form && formPropsKey ? (form as unknown as Record<string, { onSubmit?: (event: unknown) => void }>)[formPropsKey] : undefined
    if (!formProps?.onSubmit) throw new Error('React form handler not found')

    await act(async () => formProps.onSubmit?.({ preventDefault: vi.fn() }))

    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    expect(onSave).toHaveBeenCalledWith(initialValues)
  })
})
