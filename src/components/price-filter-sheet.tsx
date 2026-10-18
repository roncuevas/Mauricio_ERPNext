import { Button, Field, FilterButton, Input } from './ui'
import { EntityCombobox } from './entity-combobox'
import { FilterSheet } from './filter-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export type PriceFilterValues = { minPrice: string; maxPrice: string; brand: string; itemGroup: string; supplier: string; priceList: string; uom: string; priceType: '' | 'buying' | 'selling'; status: '' | 'active' | 'disabled' }
type Options = { brands: string[]; itemGroups: string[]; suppliers: string[]; priceLists: string[]; uoms: string[] }

export function PriceFilterSheet({ open, onOpenChange, filters, options, activeCount, onChange, onClear }: { open: boolean; onOpenChange: (open: boolean) => void; filters: PriceFilterValues; options: Options; activeCount: number; onChange: (patch: Partial<PriceFilterValues>) => void; onClear: () => void }) {
  const entityFilters: Array<[string, keyof Pick<PriceFilterValues, 'brand' | 'itemGroup' | 'supplier' | 'priceList' | 'uom'>, string[]]> = [['Marca', 'brand', options.brands], ['Grupo', 'itemGroup', options.itemGroups], ['Proveedor', 'supplier', options.suppliers], ['Lista de precios', 'priceList', options.priceLists], ['UOM', 'uom', options.uoms]]
  return <FilterSheet trigger={<FilterButton label="Filtros de precios" activeCount={activeCount} expanded={open} aria-controls="price-filters-sheet" onClick={() => onOpenChange(true)} />} title="Filtros de Precios" description="Combina filtros sin volver a descargar datos." open={open} onOpenChange={onOpenChange}>
    <Field label="Precio mínimo"><Input type="number" min="0" step="any" value={filters.minPrice} onChange={(event) => onChange({ minPrice: event.target.value })} aria-label="Precio mínimo" /></Field>
    <Field label="Precio máximo"><Input type="number" min="0" step="any" value={filters.maxPrice} onChange={(event) => onChange({ maxPrice: event.target.value })} aria-label="Precio máximo" /></Field>
    {entityFilters.map(([label, key, values]) => <Field label={label} key={key}><EntityCombobox ariaLabel={label} value={filters[key]} onValueChange={(value) => onChange({ [key]: value })} placeholder="Todos" searchPlaceholder={`Buscar ${label.toLocaleLowerCase()}…`} allowClear options={values.map((option) => ({ value: option, label: option }))} /></Field>)}
    <Field label="Tipo"><Select value={filters.priceType || '__all__'} onValueChange={(value) => onChange({ priceType: (value === '__all__' ? '' : value) as PriceFilterValues['priceType'] })}><SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Compra y venta</SelectItem><SelectItem value="buying">Compra</SelectItem><SelectItem value="selling">Venta</SelectItem></SelectContent></Select></Field>
    <Field label="Estado"><Select value={filters.status || '__all__'} onValueChange={(value) => onChange({ status: (value === '__all__' ? '' : value) as PriceFilterValues['status'] })}><SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Activos y deshabilitados</SelectItem><SelectItem value="active">Activos</SelectItem><SelectItem value="disabled">Deshabilitados</SelectItem></SelectContent></Select></Field>
    <Button type="button" variant="secondary" onClick={onClear}>Limpiar filtros</Button>
  </FilterSheet>
}
