import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List className={cn('segmented-control', className)} {...props} /> }
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger className={cn('rounded-md px-3 py-2 text-sm font-semibold text-[var(--color-muted)] data-[state=active]:bg-[var(--color-primary-soft)] data-[state=active]:text-[var(--color-primary-hover)]', className)} {...props} /> }
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content className={cn('mt-2 outline-none', className)} {...props} /> }
