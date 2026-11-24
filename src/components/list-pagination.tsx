import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

/** Previous/next controls, the visible range and a page size choice; hidden while every row fits the smallest size. */
export function ListPagination({ page, totalPages, total, pageSize, pageSizes, onPage, onPageSize }: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  pageSizes: readonly number[]
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const { t } = useTranslation()
  if (total <= Math.min(...pageSizes)) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return <nav className="list-pagination" aria-label={t('pagination.label')}>
    <span className="list-pagination-range">{t('pagination.range', { first, last, count: total })}</span>
    <div className="list-pagination-controls">
      <Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value))}>
        <SelectTrigger className="list-pagination-size" aria-label={t('pagination.pageSize')}><SelectValue /></SelectTrigger>
        <SelectContent>{pageSizes.map((size) => <SelectItem key={size} value={String(size)}>{t('pagination.perPage', { count: size })}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" variant="secondary" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('pagination.previous')}><ChevronLeft aria-hidden="true" /></Button>
      <span className="list-pagination-page">{t('pagination.page', { page, totalPages })}</span>
      <Button type="button" variant="secondary" size="icon" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t('pagination.next')}><ChevronRight aria-hidden="true" /></Button>
    </div>
  </nav>
}
