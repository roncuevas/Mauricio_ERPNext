import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useTheme } from './theme-provider'
import type { ThemeId } from '../lib/theme'

/** Compact color palette choice, the same palettes as Settings › Appearance. */
export function ThemePaletteSelector({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { theme, setTheme, themes } = useTheme()
  return <Select searchable={false} value={theme} onValueChange={(next) => setTheme(next as ThemeId)}>
    <SelectTrigger className={`theme-palette-selector ${className}`.trim()} aria-label={t('settings.appearance.palette')}><SelectValue /></SelectTrigger>
    <SelectContent align="end">
      {themes.map((entry) => <SelectItem key={entry.id} value={entry.id}>
        <span className="theme-palette-option"><span className="theme-palette-swatch" style={{ background: entry.colors.primary }} aria-hidden="true" />{entry.name}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>
}
