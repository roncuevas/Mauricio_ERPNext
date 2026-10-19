import { useTranslation } from 'react-i18next'

export function Spinner() {
  const { t } = useTranslation()
  return <span data-slot="spinner" className="spinner" role="status" aria-label={t('common.loading')} />
}
