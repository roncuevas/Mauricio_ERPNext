import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useTheme } from './theme-provider'
import { WithTooltip } from './ui/tooltip'
import type { ThemeId } from '../lib/theme'

/** Color palette choice, the same palettes as Settings › Appearance; `compact` shows only an icon. */
export function ThemePaletteSelector({ className = '', compact = false, tooltip = false }: { className?: string; compact?: boolean; tooltip?: boolean }) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, setTheme, themes } = useTheme()
  const current = themes.find((entry) => entry.id === theme)
  return <Select searchable={false} open={menuOpen} onOpenChange={setMenuOpen} value={theme} onValueChange={(next) => setTheme(next as ThemeId)}>
    <WithTooltip suppressed={menuOpen} label={tooltip ? `${t('settings.appearance.palette')}: ${current?.name ?? theme}` : undefined}>
      <SelectTrigger className={`theme-palette-selector ${className}`.trim()} aria-label={t('settings.appearance.palette')}>{compact ? <Palette aria-hidden="true" focusable="false" strokeWidth={1.8} /> : <SelectValue />}</SelectTrigger>
    </WithTooltip>
    <SelectContent align="end">
      {themes.map((entry) => <SelectItem key={entry.id} value={entry.id}>
        <span className="theme-palette-option"><span className="theme-palette-swatch" style={{ background: entry.colors.primary }} aria-hidden="true" />{entry.name}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>
}
