import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List data-slot="tabs-list" className={cn('segmented-control', className)} {...props} /> }
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn('rounded-md px-3 py-2 text-sm font-semibold text-[var(--color-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] data-[state=active]:bg-[var(--color-primary-soft)] data-[state=active]:text-[var(--color-primary-hover)]', className)} {...props} /> }
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content data-slot="tabs-content" className={cn('mt-2 outline-none', className)} {...props} /> }
