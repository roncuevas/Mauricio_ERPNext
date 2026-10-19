import { defineConfig } from 'i18next-cli'

export default defineConfig({
  locales: ['es', 'en'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
  },
  primaryLanguage: 'es',
  secondaryLanguages: ['en'],
  defaultValue: '',
  sort: true,
  // Legacy screens still contain user-facing Spanish and ERPNext technical
  // literals. Keep them out of the gate until each screen is migrated without
  // translating routes, DocTypes, storage keys, query fields or CSS classes.
  lint: {
    ignore: [
      'src/components/metadata-editor.tsx',
      'src/components/pos-drafts-sheet.tsx',
      'src/components/pos-missing-price-dialog.tsx',
      'src/components/pos-price-sheet.tsx',
      'src/components/pos-product-card.tsx',
      'src/components/pos-sales.tsx',
      'src/components/pos-shadcn.tsx',
      'src/components/pos-variant-sheet.tsx',
      'src/components/price-filter-sheet.tsx',
      'src/components/product-card.tsx',
      'src/components/product-table.tsx',
      'src/components/sales-order-product-tree.tsx',
      'src/components/stock-filter-sheet.tsx',
      'src/components/ui.tsx',
      'src/components/uom-editor.tsx',
      'src/components/variant-tree.tsx',
      'src/pages/catalog-pages.tsx',
      'src/pages/editors.tsx',
      'src/pages/pos-page.tsx',
      'src/pages/pos-shifts-page.tsx',
      'src/pages/prices-page.tsx',
      'src/pages/product-workspace-page.tsx',
      'src/pages/quotations-page.tsx',
      'src/pages/sales-orders-page.tsx',
      'src/pages/stock-page.tsx',
    ],
  },
  types: {
    input: ['src/locales/es/*.json'],
    basePath: 'src/locales/es',
    output: 'src/types/generated-i18next.d.ts',
    enableSelector: false,
  },
})
