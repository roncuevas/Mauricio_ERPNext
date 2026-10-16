import type { ReactNode } from 'react'
import { Button } from './ui'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'

export function FilterSheet({ label, title, description, open, onOpenChange, children }: { label: ReactNode; title: string; description: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><Button type="button" variant="secondary" size="compact" aria-expanded={open} onClick={() => onOpenChange(true)}>{label}</Button><SheetContent side="right"><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader><div className="grid gap-4 overflow-y-auto py-2">{children}</div></SheetContent></Sheet>
}
