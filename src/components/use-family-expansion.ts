import { useState } from 'react'

/**
 * Which template families of a hierarchy are open, by template name. Families start collapsed; a non-empty query
 * (search or filters) opens the families on screen and clearing it collapses them again. Lives with the page so its
 * toolbar can expand or collapse them all.
 */
export function useFamilyExpansion(familyNames: string[], query: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [expandedQuery, setExpandedQuery] = useState(query)
  if (expandedQuery !== query) {
    setExpandedQuery(query)
    setExpanded(new Set(query ? familyNames : []))
  }
  const allExpanded = familyNames.length > 0 && familyNames.every((name) => expanded.has(name))
  return {
    expanded,
    hasFamilies: familyNames.length > 0,
    allExpanded,
    toggle: (name: string) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next }),
    toggleAll: () => setExpanded(allExpanded ? new Set() : new Set(familyNames)),
  }
}
export type FamilyExpansion = ReturnType<typeof useFamilyExpansion>
