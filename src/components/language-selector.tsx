import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import i18n, { type AppLanguage } from '../lib/i18n'

export function LanguageSelector({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation()
  const value = (i18n.resolvedLanguage === 'en' ? 'en' : 'es') as AppLanguage
  return <Select value={value} onValueChange={(next) => { if (next === 'es' || next === 'en') void i18n.changeLanguage(next) }}>
    <SelectTrigger className={`language-selector ${compact ? 'language-selector-compact' : ''} ${className}`.trim()} aria-label={`${t('language.select')}: ${value === 'en' ? t('language.english') : t('language.spanish')}`}>
      {compact ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M3 12h18M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z" stroke="currentColor" strokeWidth="1.5" /></svg> : <SelectValue />}
    </SelectTrigger>
    <SelectContent align="end"><SelectItem value="es">{t('language.spanish')}</SelectItem><SelectItem value="en">{t('language.english')}</SelectItem></SelectContent>
  </Select>
}
