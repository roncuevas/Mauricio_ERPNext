import { useRef, useState } from 'react'
import { ListPagination } from './list-pagination'
import { paginate } from '../lib/pagination'

export const LIST_PAGE_SIZES = [25, 50, 100] as const
const PAGE_SIZE_KEY = 'mauricio-erpnext:list-page-size'

function readPageSize() {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return LIST_PAGE_SIZES.find((size) => size === stored) ?? LIST_PAGE_SIZES[0]
  } catch { return LIST_PAGE_SIZES[0] }
}

/**
 * Client-side pages for a search results list. `resetKey` (the search and filters) returns to the first page when
 * it changes. `initialPage` and `onPageChange` let a page keep its number in the URL, so returning from an editor
 * restores it. The page size is shared by every list in this browser. Attach `topRef` to the list so changing page
 * brings its start into view.
 */
export function useListPage<T>(rows: T[], resetKey: string, { initialPage = 1, onPageChange }: { initialPage?: number; onPageChange?: (page: number) => void } = {}) {
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState<number>(readPageSize)
  const [pageKey, setPageKey] = useState(resetKey)
  const topRef = useRef<HTMLDivElement>(null)
  if (pageKey !== resetKey) { setPageKey(resetKey); setPage(1) }
  const paged = paginate(rows, page, pageSize)

  function scrollToTop() {
    const top = topRef.current?.getBoundingClientRect().top
    if (top !== undefined && top < 0) topRef.current?.scrollIntoView?.({ block: 'start' })
  }
  function changePage(next: number) { setPage(next); onPageChange?.(next); scrollToTop() }
  function changePageSize(size: number) {
    setPageSize(size)
    setPage(1)
    onPageChange?.(1)
    try { localStorage.setItem(PAGE_SIZE_KEY, String(size)) } catch { /* The page size is a convenience. */ }
  }

  const pagination = <ListPagination page={paged.page} totalPages={paged.totalPages} total={rows.length} pageSize={pageSize} pageSizes={LIST_PAGE_SIZES} onPage={changePage} onPageSize={changePageSize} />
  return { rows: paged.rows, page: paged.page, pagination, topRef }
}
