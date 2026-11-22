import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

const VIRTUALIZATION_THRESHOLD = 200

// Long page lists scroll with the window: no nested scroll area, and callers
// that restore window.scrollY (e.g. returning from an editor) keep working.
export function VirtualizedCollection<T>({ items, getKey, estimateSize, overscan = 8, className, renderItem, children, virtualize = true }: { items: T[]; getKey: (item: T) => string; estimateSize: number; overscan?: number; className?: string; renderItem: (item: T, index: number) => ReactNode; children?: ReactNode; virtualize?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  // CSS grids need each card as a direct child. Callers can opt out when the
  // collection layout is a responsive grid instead of a virtualized list.
  const virtualized = virtualize && items.length >= VIRTUALIZATION_THRESHOLD
  const virtualizer = useWindowVirtualizer({ count: virtualized ? items.length : 0, estimateSize: () => estimateSize, overscan, scrollMargin })

  // Content above the list (notices, toolbars) can change its document offset.
  useLayoutEffect(() => {
    if (!virtualized || !listRef.current) return
    const offset = Math.round(listRef.current.getBoundingClientRect().top + window.scrollY)
    if (offset !== scrollMargin) setScrollMargin(offset)
  })

  if (!virtualized) return <div ref={listRef} className={className}>{items.map((item, index) => <div key={getKey(item)}>{renderItem(item, index)}</div>)}{children}</div>

  return <div ref={listRef} className={className}><div className="virtualized-collection-content" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualItem) => { const item = items[virtualItem.index]; return <div key={getKey(item)} data-index={virtualItem.index} ref={virtualizer.measureElement} className="virtualized-collection-item" style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}>{renderItem(item, virtualItem.index)}</div> })}</div>{children}</div>
}
