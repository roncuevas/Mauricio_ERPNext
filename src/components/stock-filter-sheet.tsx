import { Button, Field, FilterButton, Input } from './ui'
import { EntityCombobox } from './entity-combobox'
import { FilterSheet } from './filter-sheet'
import type { Company, Warehouse } from '../lib/types'

export function StockFilterSheet({ open, onOpenChange, company, warehouse, search, companies, warehouses, onCompany, onWarehouse, onSearch, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; company: string; warehouse: string; search: string; companies: Company[]; warehouses: Warehouse[]; onCompany: (value: string) => void; onWarehouse: (value: string) => void; onSearch: (value: string) => void; onApply: () => void }) {
  return <FilterSheet trigger={<FilterButton label="Filtros de inventario" expanded={open} onClick={() => onOpenChange(true)} />} title="Filtros de Inventario" description="Filtra existencias por empresa, almacén y producto." open={open} onOpenChange={onOpenChange}>
    <Field label="Empresa"><EntityCombobox ariaLabel="Empresa" value={company} onValueChange={onCompany} placeholder="Todas las empresas" searchPlaceholder="Buscar empresa…" allowClear options={companies.map((item) => ({ value: item.name, label: item.company_name || item.name, searchText: item.name }))} /></Field>
    <Field label="Sucursal / almacén"><EntityCombobox ariaLabel="Sucursal / almacén" value={warehouse} onValueChange={onWarehouse} placeholder="Todos los almacenes" searchPlaceholder="Buscar almacén…" allowClear options={warehouses.map((item) => ({ value: item.name, label: item.warehouse_name || item.name, searchText: `${item.name} ${item.company ?? ''}` }))} /></Field>
    <Field label="Producto"><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Código o nombre" /></Field>
    <Button type="button" onClick={onApply}>Aplicar filtros</Button>
  </FilterSheet>
}
