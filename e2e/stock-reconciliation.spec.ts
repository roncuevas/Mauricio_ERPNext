import { expect, test } from '@playwright/test'
import { company, connect, mockStock, refreshFrom, warehouse } from './stock-helpers'

test('counts stock and submits only counted rows after confirming, keeping ERPNext valuation and posting time', async ({ page }) => {
  const erp = await mockStock(page)
  await connect(page)
  await refreshFrom(page, '/stock', 'Inventario', 'Refrescar inventario')
  await page.getByRole('link', { name: 'Ajustar Croquetas Adulto Premium' }).click()

  await expect(page.getByRole('heading', { name: 'Reconciliación de inventario' })).toBeVisible()
  const counted = page.getByRole('spinbutton', { name: 'Cantidad contada de Croquetas Adulto Premium' })
  await expect(counted).toBeFocused()
  await counted.fill('7')
  await expect(page.getByRole('row').filter({ hasText: 'Croquetas Adulto Premium' })).toContainText('-3')

  // Enter in a quantity never posts the document: it returns to the product search.
  await counted.press('Enter')
  const search = page.getByRole('combobox', { name: 'Buscar producto' })
  await expect(search).toBeFocused()
  expect(erp.created).toHaveLength(0)

  // Templates (items with variants) never hold stock, so the picker does not offer them.
  await search.fill('Croquetas')
  await expect(page.getByRole('option', { name: /Croquetas Adulto Premium/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Croquetas plantilla/ })).toHaveCount(0)
  await search.fill('ITEM-002')
  await search.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Cantidad contada de Arena para gato' })).toBeFocused()
  await expect(page.locator('.stock-document-summary')).toHaveText('1 de 2 productos contados · 1 con diferencia')

  // Leaving and coming back keeps the unsent count.
  await page.getByRole('tab', { name: 'Inventario' }).click()
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Reconciliación' }).click()
  await expect(page.getByText('Recuperamos la captura que no enviaste.')).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Cantidad contada de Croquetas Adulto Premium' })).toHaveValue('7')

  await page.getByRole('button', { name: 'Enviar reconciliación (1)' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('¿Enviar la reconciliación a ERPNext?')
  await expect(dialog).toContainText('10 → 7 (-3)')
  expect(erp.created).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Enviar reconciliación (1)' }).click()

  await expect(page.getByText('Reconciliación MAT-RECO-0001 enviada con 1 producto.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir en ERPNext' })).toHaveAttribute('href', /\/app\/stock-reconciliation\/MAT-RECO-0001$/)
  expect(erp.submitted).toEqual(['MAT-RECO-0001'])
  expect(erp.created).toHaveLength(1)
  expect(erp.created[0]).toMatchObject({ doctype: 'Stock Reconciliation', purpose: 'Stock Reconciliation', company: company.name })
  expect(erp.created[0]).not.toHaveProperty('set_posting_time')
  expect(erp.created[0].items).toEqual([{ item_code: 'ITEM-001', warehouse: warehouse.name, qty: 7 }])
  await expect(page.locator('.stock-table [data-cell="emphasis"]').first()).toHaveText('7')
})
