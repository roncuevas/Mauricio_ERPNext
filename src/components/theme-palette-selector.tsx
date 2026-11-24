import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useTheme } from './theme-provider'
import type { ThemeId } from '../lib/theme'

/** Color palette choice, the same palettes as Settings › Appearance; `compact` shows only an icon. */
export function ThemePaletteSelector({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation()
  const { theme, setTheme, themes } = useTheme()
  return <Select searchable={false} value={theme} onValueChange={(next) => setTheme(next as ThemeId)}>
    <SelectTrigger className={`theme-palette-selector ${className}`.trim()} aria-label={t('settings.appearance.palette')} title={t('settings.appearance.palette')}>{compact ? <Palette aria-hidden="true" focusable="false" strokeWidth={1.8} /> : <SelectValue />}</SelectTrigger>
    <SelectContent align="end">
      {themes.map((entry) => <SelectItem key={entry.id} value={entry.id}>
        <span className="theme-palette-option"><span className="theme-palette-swatch" style={{ background: entry.colors.primary }} aria-hidden="true" />{entry.name}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>
}
