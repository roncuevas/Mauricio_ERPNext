import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const VIRTUALIZATION_THRESHOLD = 200

export function VirtualizedCollection<T>({ items, getKey, estimateSize, overscan = 8, className, renderItem, children, virtualize = true }: { items: T[]; getKey: (item: T) => string; estimateSize: number; overscan?: number; className?: string; renderItem: (item: T, index: number) => ReactNode; children?: ReactNode; virtualize?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // CSS grids need each card as a direct child. Callers can opt out when the
  // collection layout is a responsive grid instead of a virtualized list.
  const virtualized = virtualize && items.length >= VIRTUALIZATION_THRESHOLD
  const virtualizer = useVirtualizer({ count: virtualized ? items.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => estimateSize, overscan })

  if (!virtualized) return <div ref={scrollRef} className={className}>{items.map((item, index) => <div key={getKey(item)}>{renderItem(item, index)}</div>)}{children}</div>

  return <div ref={scrollRef} className={className}><div className="virtualized-collection-content" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualItem) => { const item = items[virtualItem.index]; return <div key={getKey(item)} data-index={virtualItem.index} ref={virtualizer.measureElement} className="virtualized-collection-item" style={{ transform: `translateY(${virtualItem.start}px)` }}>{renderItem(item, virtualItem.index)}</div> })}</div>{children}</div>
}
