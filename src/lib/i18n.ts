import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en/translation.json'
import es from '../locales/es/translation.json'

export const supportedLanguages = ['es', 'en'] as const
export type AppLanguage = typeof supportedLanguages[number]
export const languageStorageKey = 'mauricio-erpnext:language'

export const resources = { es: { translation: es }, en: { translation: en } } as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: supportedLanguages,
    fallbackLng: 'es',
    load: 'languageOnly',
    ns: ['translation'],
    defaultNS: 'translation',
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'], lookupLocalStorage: languageStorageKey },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

export default i18n
