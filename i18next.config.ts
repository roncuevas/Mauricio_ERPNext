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
  types: {
    input: ['src/locales/es/*.json'],
    basePath: 'src/locales/es',
    output: 'src/types/generated-i18next.d.ts',
    enableSelector: false,
  },
})
