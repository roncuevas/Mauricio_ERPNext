import { expect, type Page } from '@playwright/test'

type Payload = Record<string, unknown> & { items?: Array<Record<string, unknown>> }

const suppliers = [{ name: 'PROVEEDOR A', supplier_name: 'PROVEEDOR A', disabled: 0 }, { name: 'PROVEEDOR B', supplier_name: 'PROVEEDOR B', disabled: 0 }]
const prices = [
  { name: 'P-1', item_code: 'ITEM-001', price_list: 'Standard Buying', price_list_rate: 1250, buying: 1, uom: 'Kg', supplier: 'PROVEEDOR B', valid_from: '2026-09-09' },
  { name: 'P-2', item_code: 'ITEM-001', price_list: 'Standard Buying', price_list_rate: 1200.5, buying: 1, uom: 'Kg', supplier: 'PROVEEDOR A', valid_from: '2026-10-13' },
]
export const company = { name: 'Mauricio Demo', company_name: 'Mauricio Demo', default_currency: 'MXN' }
export const warehouse = { name: 'Almacén Demo', warehouse_name: 'Almacén Demo', company: company.name, is_group: 0, disabled: 0 }
export const items = [
  { name: 'ITEM-001', item_name: 'Croquetas Adulto Premium', stock_uom: 'Kg', is_stock_item: 1, disabled: 0, has_serial_no: 0, has_batch_no: 0 },
  { name: 'ITEM-002', item_name: 'Arena para gato', stock_uom: 'Pza', is_stock_item: 1, disabled: 0, has_serial_no: 0, has_batch_no: 0 },
  { name: 'ITEM-TPL', item_name: 'Croquetas plantilla', stock_uom: 'Kg', is_stock_item: 1, disabled: 0, has_variants: 1, has_serial_no: 0, has_batch_no: 0 },
]

export async function mockStock(page: Page) {
  const created: Payload[] = []
  const submitted: string[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = decodeURIComponent(request.url())
    if (url.includes('frappe.auth.get_logged_user')) return route.fulfill({ json: { message: 'Administrator' } })
    if (url.includes('frappe.client.submit')) { submitted.push(JSON.parse(JSON.parse(request.postData() ?? '{}').doc).name); return route.fulfill({ json: { message: { docstatus: 1 } } }) }
    for (const [doctype, name] of [['Stock Reconciliation', 'MAT-RECO-0001'], ['Purchase Receipt', 'MAT-PRE-0001']]) {
      if (!url.includes(`/api/resource/${doctype}`)) continue
      if (request.method() === 'POST') { created.push(JSON.parse(request.postData() ?? '{}')); return route.fulfill({ json: { data: { name } } }) }
      return route.fulfill({ json: { data: { name, docstatus: 0 } } })
    }
    if (url.includes('/api/resource/Supplier?')) return route.fulfill({ json: { data: suppliers } })
    if (url.includes('/api/resource/Item Price?')) return route.fulfill({ json: { data: prices } })
    if (url.includes('/api/resource/Company?')) return route.fulfill({ json: { data: [company] } })
    if (url.includes('/api/resource/Warehouse?')) return route.fulfill({ json: { data: [warehouse] } })
    if (url.includes('/api/resource/Bin?')) {
      const actual = submitted.includes('MAT-PRE-0001') ? 15 : submitted.length ? 7 : 10
      return route.fulfill({ json: { data: [{ name: 'BIN-1', item_code: 'ITEM-001', warehouse: warehouse.name, actual_qty: actual, projected_qty: actual, valuation_rate: 100, stock_value: actual * 100 }] } })
    }
    if (url.includes('/api/resource/Item?')) return route.fulfill({ json: { data: items } })
    return route.fulfill({ json: { data: [] } })
  })
  return { created, submitted }
}

export async function connect(page: Page) {
  await page.goto('/')
  const fields = page.getByRole('textbox')
  await fields.nth(0).fill('E2E local')
  await fields.nth(1).fill('https://erp.example.test')
  await fields.nth(2).fill('e2e-key')
  await fields.nth(3).fill('e2e-secret')
  await fields.nth(4).fill('e2e-passphrase')
  await page.getByRole('button', { name: 'Cifrar y conectar' }).click()
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
}

export async function refreshFrom(page: Page, path: string, heading: string, button: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  const actions = page.locator('details.mobile-actions')
  if (await actions.isVisible()) await actions.locator('summary').click()
  await page.getByRole('button', { name: button }).click()
}
