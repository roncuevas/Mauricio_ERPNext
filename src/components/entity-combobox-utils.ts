import type { EntityComboboxOption } from './entity-combobox'

export function filterEntityOptions(options: EntityComboboxOption[], search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  return normalizedSearch ? options.filter((option) => `${option.label} ${option.searchText ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)) : options
}
