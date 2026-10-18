import { SelectGroup, SelectItem, SelectLabel } from './ui/select'
import { flattenVariantHierarchy } from '../lib/variant-cache'
import type { VariantItem } from '../lib/types'

export function ItemHierarchySelectItems({ items, includeTemplates = true }: { items: VariantItem[]; includeTemplates?: boolean }) {
  const entries = flattenVariantHierarchy(items, includeTemplates)
  const groups: Array<{ name: string; entries: typeof entries }> = []
  for (const entry of entries) {
    if (entry.depth === 0 || !groups.length) groups.push({ name: entry.item.item_name || entry.item.name, entries: [] })
    groups[groups.length - 1].entries.push(entry)
  }
  return <>{groups.map((group) => <SelectGroup key={group.name}><SelectLabel className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{group.name}</SelectLabel>{group.entries.map(({ item, depth, role }) => <SelectItem key={item.name} value={item.name}><span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 12}px` }}><span className="truncate">{item.item_name || item.name}</span><span className="shrink-0 text-xs text-[var(--color-muted)]">{role === 'plantilla' ? 'Plantilla' : role === 'variante' ? 'Variante' : item.stock_uom || 'Item'}</span></span></SelectItem>)}</SelectGroup>)}</>
}
