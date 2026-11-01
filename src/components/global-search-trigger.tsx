import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGlobalSearch } from './global-search-context'

export function GlobalSearchNavigationAction({ className, collapsed = false }: { className: string; collapsed?: boolean }) {
  const { t } = useTranslation()
  const openSearch = useGlobalSearch()
  if (!openSearch) return null
  const label = t('globalSearch.open')

  return <button type="button" className={className} aria-label={label} title={collapsed ? label : undefined} onClick={openSearch}>
    <Search className="sidebar-icon" aria-hidden="true" />
    <span className="navigation-home-label">{label}</span>
  </button>
}
