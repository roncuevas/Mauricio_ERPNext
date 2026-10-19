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
      'src/components/ui.tsx',
      'src/pages/pos-page.tsx',
      'src/pages/quotations-page.tsx',
      'src/pages/sales-orders-page.tsx',
    ],
  },
  types: {
    input: ['src/locales/es/*.json'],
    basePath: 'src/locales/es',
    output: 'src/types/generated-i18next.d.ts',
    enableSelector: false,
  },
})
