import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import i18n, { type AppLanguage } from '../lib/i18n'
import { Globe2 } from 'lucide-react'
import { WithTooltip } from './ui/tooltip'

/** Language choice; `compact` shows only an icon, and `tooltip` names it on hover or keyboard focus. */
export function LanguageSelector({ className = '', compact = false, tooltip = false }: { className?: string; compact?: boolean; tooltip?: boolean }) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const value = (i18n.resolvedLanguage === 'en' ? 'en' : 'es') as AppLanguage
  return <Select open={menuOpen} onOpenChange={setMenuOpen} value={value} onValueChange={(next) => { if (next === 'es' || next === 'en') void i18n.changeLanguage(next) }}>
    <WithTooltip suppressed={menuOpen} label={tooltip ? `${t('language.select')}: ${value === 'en' ? t('language.english') : t('language.spanish')}` : undefined}>
      <SelectTrigger className={`language-selector ${compact ? 'language-selector-compact' : ''} ${className}`.trim()} aria-label={`${t('language.select')}: ${value === 'en' ? t('language.english') : t('language.spanish')}`}>
        {compact ? <Globe2 aria-hidden="true" focusable="false" strokeWidth={1.8} /> : <SelectValue />}
      </SelectTrigger>
    </WithTooltip>
    <SelectContent align="end"><SelectItem value="es">{t('language.spanish')}</SelectItem><SelectItem value="en">{t('language.english')}</SelectItem></SelectContent>
  </Select>
}
