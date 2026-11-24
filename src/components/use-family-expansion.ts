import { useState } from 'react'
import type { MissingImageGroup } from '../lib/pending-items'

type Family = Extract<MissingImageGroup, { kind: 'family' }>

/**
 * Which template families of the hierarchy are open. Families start collapsed; searching opens the matching ones
 * and clearing the search collapses them again. Lives with the page so its toolbar can expand or collapse them all.
 */
export function useFamilyExpansion(groups: MissingImageGroup[], search: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [expandedSearch, setExpandedSearch] = useState(search)
  if (expandedSearch !== search) {
    setExpandedSearch(search)
    setExpanded(new Set(search ? groups.filter((group): group is Family => group.kind === 'family').map((family) => family.template.name) : []))
  }
  const families = groups.filter((group): group is Family => group.kind === 'family')
  const allExpanded = families.length > 0 && families.every((family) => expanded.has(family.template.name))
  return {
    expanded,
    hasFamilies: families.length > 0,
    allExpanded,
    toggle: (name: string) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next }),
    toggleAll: () => setExpanded(allExpanded ? new Set() : new Set(families.map((family) => family.template.name))),
  }
}
export type FamilyExpansion = ReturnType<typeof useFamilyExpansion>
