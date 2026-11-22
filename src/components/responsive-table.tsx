import type { ComponentProps, ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { cn } from '@/lib/utils'

export type ResponsiveColumn = { id: string; label: string; align?: 'start' | 'end'; hidden?: boolean; className?: string }

/**
 * shadcn Table with real column headers on wide screens. Below 640px every row stacks into a labelled card,
 * reading each cell's label from `ResponsiveCell` so no markup is duplicated for mobile.
 */
export function ResponsiveTable({ label, columns, children, className }: { label: string; columns: ResponsiveColumn[]; children: ReactNode; className?: string }) {
  return <div className={cn('responsive-table', className)}>
    <Table aria-label={label}>
      <TableHeader><TableRow>{columns.map((column) => <TableHead key={column.id} className={cn(column.align === 'end' && 'text-right', column.className)}>{column.hidden ? <span className="sr-only">{column.label}</span> : column.label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  </div>
}

export const ResponsiveRow = TableRow

type CellRole = 'primary' | 'actions' | 'emphasis'

/** `label` is shown above the value when the row stacks; `role` places the cell in the stacked card. */
export function ResponsiveCell({ label, align, role, className, ...props }: Omit<ComponentProps<'td'>, 'align' | 'role'> & { label?: string; align?: 'start' | 'end'; role?: CellRole }) {
  return <TableCell data-label={label} data-cell={role} className={cn(align === 'end' && 'text-right tabular-nums', className)} {...props} />
}

/** Product name plus code and unit, the first cell of every stock table. */
export function ProductCellContent({ name, code, detail }: { name: string; code: string; detail?: ReactNode }) {
  return <div className="product-cell"><strong>{name}</strong><small>{code}{detail ? <> · {detail}</> : null}</small></div>
}
