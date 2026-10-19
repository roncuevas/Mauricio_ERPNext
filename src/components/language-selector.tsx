import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import i18n, { type AppLanguage } from '../lib/i18n'

export function LanguageSelector({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const value = (i18n.resolvedLanguage === 'en' ? 'en' : 'es') as AppLanguage
  return <Select value={value} onValueChange={(next) => { if (next === 'es' || next === 'en') void i18n.changeLanguage(next) }}>
    <SelectTrigger className={`language-selector ${className}`.trim()} aria-label={t('language.select')}><SelectValue /></SelectTrigger>
    <SelectContent align="end"><SelectItem value="es">{t('language.spanish')}</SelectItem><SelectItem value="en">{t('language.english')}</SelectItem></SelectContent>
  </Select>
}
