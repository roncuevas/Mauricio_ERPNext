import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cva, type VariantProps } from 'class-variance-authority'
import { ListFilter, RotateCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'

export const buttonVariants = cva('button inline-flex shrink-0 items-center justify-center gap-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      action: 'button-action',
      danger: 'button-danger',
    },
    size: {
      default: '',
      compact: 'button-compact',
      icon: 'button-icon',
    },
    fullWidth: { true: 'button-full-width' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'default', fullWidth = false, loading = false, className, disabled, children, ...props }, ref) {
  return <button ref={ref} data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, fullWidth, className }))} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading ? <Spinner /> : null}{children}</button>
})

export type ButtonLinkProps = LinkProps & VariantProps<typeof buttonVariants>

export function ButtonLink({ variant = 'primary', size = 'default', fullWidth = false, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size, fullWidth, className }))} {...props} />
}

export function IconButton({ label, icon, loading = false, variant = 'secondary', ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; icon: ReactNode; loading?: boolean; variant?: NonNullable<ButtonProps['variant']> }) {
  return <Button {...props} variant={variant} size="icon" loading={loading} aria-label={label} title={props.title ?? label}>{icon}</Button>
}

export function RefreshButton({ label, loading = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; loading?: boolean }) {
  return <IconButton {...props} type="button" label={label} loading={loading} icon={<RotateCw aria-hidden="true" />} />
}

export function SearchButton({ label, loading = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label?: string; loading?: boolean }) {
  const { t } = useTranslation()
  label ??= t('common.search')
  return <IconButton {...props} className={cn('toolbar-search-button', props.className)} type="submit" label={label} loading={loading} title={`${label} (Enter)`} icon={<Search aria-hidden="true" />} />
}

export function FilterButton({ label, activeCount = 0, expanded = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant'> & { label?: string; activeCount?: number; expanded?: boolean }) {
  const { t } = useTranslation()
  label ??= t('common.filters')
  return <IconButton {...props} className={cn('toolbar-filter-button', props.className)} type="button" label={label} aria-expanded={expanded} icon={<><ListFilter aria-hidden="true" />{activeCount > 0 && <span className="filter-button-count">{activeCount}</span>}</>} />
}
