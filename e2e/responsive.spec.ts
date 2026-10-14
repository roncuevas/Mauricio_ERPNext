import { expect, test, type Page } from '@playwright/test'

async function mockErpNext(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = request.url()
    const item = { name: 'ITEM-001', item_code: 'SKU-001', item_name: 'Croquetas Adulto Premium', brand: 'Nupec', item_group: 'Alimento', stock_uom: 'Kg', sales_uom: 'Kg', purchase_uom: 'Bulto', disabled: 0, uoms: [{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }] }
    if (url.includes('frappe.auth.get_logged_user')) return route.fulfill({ json: { message: 'Administrator' } })
    if (request.method() === 'POST') return route.fulfill({ status: 200, json: { data: { name: 'SUP-001' } } })
    if (url.includes('/meta')) return route.fulfill({ json: { data: { fields: [] } } })
    if (url.includes('Item%20Barcode')) return route.fulfill({ status: 403, json: { message: 'Forbidden' } })
    if (url.includes('UOM%20Conversion%20Detail')) return route.fulfill({ json: { data: [{ parent: 'ITEM-001', uom: 'Bulto', conversion_factor: 20 }] } })
    if (url.includes('Item%20Price')) return route.fulfill({ json: { data: [{ name: 'PRICE-BUY-001', item_code: 'ITEM-001', price_list: 'Standard Buying', price_list_rate: 100, buying: 1, selling: 0, uom: 'Kg', currency: 'MXN', supplier: 'Proveedor demo' }, { name: 'PRICE-SELL-001', item_code: 'ITEM-001', price_list: 'Standard Selling', price_list_rate: 150, buying: 0, selling: 1, uom: 'Kg', currency: 'MXN' }] } })
    if (url.includes('/api/resource/Item?')) return route.fulfill({ json: { data: [item] } })
    if (url.includes('/api/resource/Item/')) return route.fulfill({ json: { data: item } })
    return route.fulfill({ json: { data: [] } })
  })
}

async function createConnection(page: Page) {
  await page.goto('/')
  await page.getByLabel('Nombre del perfil').fill('E2E local')
  await page.getByLabel('URL de ERPNext').fill('https://erp.example.test')
  await page.getByLabel('API Key').fill('e2e-key')
  await page.getByLabel('API Secret').fill('e2e-secret')
  await page.getByLabel('Contraseña local').fill('e2e-passphrase')
  await page.getByRole('button', { name: 'Cifrar y conectar' }).click()
  await expect(page).toHaveURL(/\/items$/)
}

test.describe('responsive navigation and empty states', () => {
  test.beforeEach(async ({ page }) => {
    await mockErpNext(page)
  })

  test('mobile uses compact navigation and keeps pages inside the viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Este caso corresponde al proyecto móvil')
    await createConnection(page)
    await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Menú' }).click()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    const menuLayout = await page.evaluate(() => {
      const menu = document.querySelector('.mobile-navigation')
      return { height: menu?.getBoundingClientRect().height ?? 0, viewport: window.innerHeight, bodyOverflow: document.body.style.overflow }
    })
    expect(menuLayout.height).toBeGreaterThanOrEqual(menuLayout.viewport)
    expect(menuLayout.bodyOverflow).toBe('hidden')
    await page.getByRole('link', { name: 'Variantes' }).click()
    await expect(page).toHaveURL(/\/variants$/)
    await expect(page.getByRole('button', { name: 'Menú' })).toBeVisible()

    const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1)
  })

  test('imports shared credentials, pre-fills the form, and removes secrets from the URL', async ({ page }) => {
    await page.goto('/#share=eyJiYXNlVXJsIjoiaHR0cHM6Ly9lcnAuZXhhbXBsZS50ZXN0IiwibGFiZWwiOiJFbmxhY2UgY29tcGFydGlkbyIsImFwaUtleSI6ImUyZS1rZXkiLCJhcGlTZWNyZXQiOiJlMmUtc2VjcmV0In0')
    await expect(page.getByLabel('Nombre del perfil')).toHaveValue('Enlace compartido')
    await expect(page.getByLabel('URL de ERPNext')).toHaveValue('https://erp.example.test')
    await expect(page.getByLabel('API Key')).toHaveValue('e2e-key')
    await expect(page).not.toHaveURL(/api_secret/)
    await page.getByLabel('Contraseña local').fill('e2e-passphrase')
    await page.getByRole('button', { name: 'Cifrar y conectar' }).click()
    await expect(page).toHaveURL(/\/items$/)
  })

  test('mobile routes remain usable screen by screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Este caso corresponde al proyecto móvil')
    await createConnection(page)
    await page.getByRole('button', { name: 'Refrescar catálogo' }).click()
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await page.getByRole('button', { name: 'Cards' }).click()
    await expect(page.getByRole('alert')).toContainText('La vista Cards carga información enriquecida')
    await page.getByRole('button', { name: 'Cargar y guardar en caché' }).click()
    await expect(page.getByText('Precios, UOM y conversiones guardados en caché')).toBeVisible()
    await expect(page.locator('.product-card')).toHaveCount(1)
    await expect(page.getByText('Ganancia aprox.')).toBeVisible()
    await expect(page.getByText('$50.00', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Tabla' }).click()
    await page.getByRole('button', { name: 'Cards' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.goto('/prices')
    await expect(page.getByRole('heading', { name: 'Precios por producto' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('Croquetas')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await expect(page.getByRole('button', { name: /Filtros/ })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: /Filtros/ }).click()
    await expect(page.getByRole('button', { name: /Filtros/ })).toHaveAttribute('aria-expanded', 'true')
    await page.getByLabel('Filtrar por marca').selectOption('Nupec')
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await page.getByLabel('Precio mínimo').fill('151')
    await expect(page.getByText('No hay productos para la búsqueda actual.')).toBeVisible()
    await page.getByLabel('Precio mínimo').fill('100')
    await expect(page.getByText('Croquetas Adulto Premium')).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('producto que no existe')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await expect(page.getByText('No hay productos para la búsqueda actual.')).toBeVisible()
    await page.getByRole('textbox', { name: 'Buscar precios por producto' }).fill('Croquetas')
    await page.getByRole('button', { name: 'Buscar precios por producto' }).click()
    await page.getByRole('button', { name: 'Agregar precio' }).first().click()
    await expect(page.locator('h1').filter({ hasText: 'Agregar precio' })).toBeVisible()
    await expect(page.getByLabel('Precio *')).toBeVisible()

    const routes = [
      ['/items', 'Productos'],
      ['/variants', 'Variantes'],
      ['/prices', 'Precios por producto'],
      ['/suppliers', 'Proveedores'],
      ['/doctypes', 'DocTypes'],
      ['/settings', 'Configuración'],
    ] as const

    for (const [path, heading] of routes) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expect(page.locator('.page-header')).toBeVisible()
      await expect(page.locator('.page-header')).toHaveCSS('position', 'static')
      if (['/items', '/suppliers'].includes(path)) await expect(page.locator('.page-header-toolbar')).toBeVisible()
      if (path === '/suppliers') {
        await page.getByRole('textbox', { name: 'Buscar proveedores' }).fill('demo')
        await page.getByRole('button', { name: 'Buscar proveedores' }).click()
      }
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
      expect(dimensions.body, `${path} has horizontal page overflow`).toBeLessThanOrEqual(dimensions.viewport + 1)
      if (path !== '/settings') await expect(page.locator('.mobile-actions')).toBeVisible()
    }
  })

  test('desktop preserves the sidebar and compact actions stay hidden', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Este caso corresponde al proyecto de escritorio')
    await createConnection(page)
    await expect(page.locator('.app-sidebar')).toBeVisible()
    await expect(page.locator('.app-sidebar .app-brand-name')).toHaveText('Mauricio')
    await expect(page.getByText('Conexión activa')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Productos' })).toBeVisible()
    await expect(page.locator('.mobile-actions')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Bloquear sesión' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar modo oscuro' })).toBeVisible()
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark')
    await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()
    await page.getByRole('button', { name: 'Activar modo claro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'light')
    await page.getByRole('link', { name: 'Conexión' }).click()
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
  })
})
