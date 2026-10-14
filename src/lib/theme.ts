export type ThemeId =
  | 'erp-blue'
  | 'professional-indigo'
  | 'natural-emerald'
  | 'clinical-turquoise'
  | 'energy-orange'
  | 'executive-red'
  | 'warm-amber'
  | 'premium-violet'
  | 'minimal-graphite'
  | 'modern-rose'

export type ColorMode = 'light' | 'dark'

export type ThemeDefinition = {
  id: ThemeId
  name: string
  description: string
  colors: {
    primary: string
    secondary: string
    accent: string
    page: string
  }
}

export const DEFAULT_THEME: ThemeId = 'erp-blue'
export const THEME_STORAGE_KEY = 'mauricio-erpnext:theme'
export const COLOR_MODE_STORAGE_KEY = 'mauricio-erpnext:color-mode'

export const themes: ThemeDefinition[] = [
  { id: 'erp-blue', name: 'Azul ERP', description: 'Claro, profesional y familiar para operación diaria.', colors: { primary: '#2563eb', secondary: '#0ea5e9', accent: '#dbeafe', page: '#f5f7fb' } },
  { id: 'professional-indigo', name: 'Índigo Profesional', description: 'Contraste sobrio con una identidad tecnológica.', colors: { primary: '#4f46e5', secondary: '#7c3aed', accent: '#ede9fe', page: '#f8fafc' } },
  { id: 'natural-emerald', name: 'Esmeralda Natural', description: 'Fresco y equilibrado para catálogos e inventario.', colors: { primary: '#059669', secondary: '#10b981', accent: '#d1fae5', page: '#f3faf7' } },
  { id: 'clinical-turquoise', name: 'Turquesa Clínica', description: 'Limpio y calmado, inspirado en entornos clínicos.', colors: { primary: '#0891b2', secondary: '#06b6d4', accent: '#cffafe', page: '#f0fdfa' } },
  { id: 'energy-orange', name: 'Naranja Energía', description: 'Cálido y visible para flujos de venta activos.', colors: { primary: '#ea580c', secondary: '#f97316', accent: '#ffedd5', page: '#fff7ed' } },
  { id: 'executive-red', name: 'Rojo Ejecutivo', description: 'Fuerte y directo para operación con alta visibilidad.', colors: { primary: '#dc2626', secondary: '#e11d48', accent: '#ffe4e6', page: '#fff7f7' } },
  { id: 'warm-amber', name: 'Ámbar Cálido', description: 'Amable y luminoso para una experiencia cercana.', colors: { primary: '#d97706', secondary: '#f59e0b', accent: '#fef3c7', page: '#fffbeb' } },
  { id: 'premium-violet', name: 'Violeta Premium', description: 'Distintivo y elegante para una interfaz de marca.', colors: { primary: '#7c3aed', secondary: '#a855f7', accent: '#f3e8ff', page: '#faf7ff' } },
  { id: 'minimal-graphite', name: 'Grafito Minimalista', description: 'Neutral, discreto y enfocado en los datos.', colors: { primary: '#334155', secondary: '#64748b', accent: '#e2e8f0', page: '#f8fafc' } },
  { id: 'modern-rose', name: 'Rosa Moderno', description: 'Contemporáneo y expresivo sin perder legibilidad.', colors: { primary: '#db2777', secondary: '#ec4899', accent: '#fce7f3', page: '#fff7fb' } },
]

const themeIds = new Set<ThemeId>(themes.map((theme) => theme.id))

export function isThemeId(value: string | null): value is ThemeId {
  return value !== null && themeIds.has(value as ThemeId)
}

export function readTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeId(saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export function saveTheme(theme: ThemeId) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}

export function isColorMode(value: string | null): value is ColorMode {
  return value === 'light' || value === 'dark'
}

export function readColorMode(): ColorMode {
  try {
    const saved = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    return isColorMode(saved) ? saved : 'light'
  } catch {
    return 'light'
  }
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode
}

export function saveColorMode(mode: ColorMode) {
  localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode)
  applyColorMode(mode)
}
