import { expect, test } from '@playwright/test'
import { connectRealErpNext, refreshProducts } from './erpnext.helpers'

test.describe('ERPNext real local integration', () => {
  test('connects, fetches cache, searches products and opens prices', async ({ page }) => {
    await connectRealErpNext(page)
    await refreshProducts(page)
    await expect(page.getByText(/Catálogo actualizado: \d+ productos?/)).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar productos' }).fill('E2E Product')
    await expect(page.getByText('E2E Product', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await page.goto('/prices')
    await expect(page.getByRole('heading', { name: 'Precios por producto' })).toBeVisible()
    const actions = page.locator('details.mobile-actions')
    if (await actions.isVisible()) await actions.locator('summary').click()
    await page.locator('.page-header').getByRole('button', { name: 'Refrescar precios' }).click()
    const priceSearch = page.getByRole('textbox', { name: 'Buscar precios por producto' })
    await priceSearch.fill('E2E Product')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('E2E Product', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('loads home, settings caches, variants, suppliers and stock without overflow', async ({ page }) => {
    await connectRealErpNext(page)
    for (const [path, heading] of [['/', 'Inicio'], ['/variants', 'Variantes'], ['/suppliers', 'Proveedores'], ['/stock', 'Inventario'], ['/settings', 'Configuración']] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
      expect(dimensions.body, `${path} overflow horizontal`).toBeLessThanOrEqual(dimensions.viewport + 1)
    }
    await page.getByRole('tab', { name: 'Datos' }).click()
    await expect(page.getByRole('heading', { name: 'Cachés y último fetch' })).toBeVisible()
    await page.getByRole('button', { name: 'Refrescar todo' }).click()
  })

  test('opens POS with a real shift and uses the seeded customer/product', async ({ page }, testInfo) => {
    await connectRealErpNext(page)
    await refreshProducts(page)
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS' })).toBeVisible()
    // Projects run serially against one ERPNext, so an earlier project may have left the shift open.
    const shiftAction = page.getByRole('button', { name: /^(Abrir turno|Preparar cierre)$/ })
    await expect(shiftAction).toBeVisible({ timeout: 30_000 })
    if (await shiftAction.textContent() === 'Abrir turno') await shiftAction.click()
    if (testInfo.project.name === 'mobile') {
      await page.locator('.pos-mobile-tabs').getByRole('button', { name: 'Más acciones' }).click()
      await page.getByRole('menuitem', { name: 'Mostrar contexto' }).click()
    }
    await expect(page.getByRole('button', { name: 'Preparar cierre' })).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Buscar cliente').fill('E2E Customer')
    await expect(page.getByRole('option', { name: 'E2E Customer' })).toBeVisible()
    await page.getByRole('option', { name: 'E2E Customer' }).click()
    await expect(page.getByText('E2E Product', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('opens sales orders and quotations with real server data', async ({ page }) => {
    await connectRealErpNext(page)
    await page.goto('/pos/ventas')
    await expect(page.getByRole('heading', { name: 'Ventas del día', exact: true })).toBeVisible()
    await page.goto('/pos/cotizaciones')
    // VITE_FF_QUOTATIONS_VIEW is off by default, so the route must explain it is disabled.
    await expect(page.getByText('La vista de cotizaciones está deshabilitada.')).toBeVisible()
    await page.goto('/doctypes')
    await expect(page.getByRole('heading', { name: 'DocTypes' })).toBeVisible()
  })
})
