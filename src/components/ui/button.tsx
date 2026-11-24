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
      link: 'button-link',
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

type IconButtonProps = Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; icon: ReactNode; loading?: boolean; variant?: NonNullable<ButtonProps['variant']>; size?: 'default' | 'compact' }

/** Square icon-only button. Every icon action uses it so size, centering and touch target stay identical. */
export function IconButton({ label, icon, loading = false, variant = 'secondary', size = 'default', className, ...props }: IconButtonProps) {
  return <Button {...props} className={cn(size === 'compact' && 'button-icon-compact', className)} variant={variant} size="icon" loading={loading} aria-label={label} title={props.title ?? label}>{loading ? null : icon}</Button>
}

type PresetIconButtonProps = Omit<IconButtonProps, 'label' | 'icon'>

export function RefreshButton({ label, loading = false, ...props }: PresetIconButtonProps & { label: string }) {
  return <IconButton {...props} type="button" label={label} loading={loading} icon={<RotateCw aria-hidden="true" />} />
}

export function SearchButton({ label, loading = false, ...props }: PresetIconButtonProps & { label?: string }) {
  const { t } = useTranslation()
  label ??= t('common.search')
  return <IconButton {...props} type="submit" label={label} loading={loading} title={`${label} (Enter)`} icon={<Search aria-hidden="true" />} />
}

export function FilterButton({ label, activeCount = 0, expanded = false, ...props }: PresetIconButtonProps & { label?: string; activeCount?: number; expanded?: boolean }) {
  const { t } = useTranslation()
  label ??= t('common.filters')
  return <IconButton {...props} type="button" label={label} aria-expanded={expanded} icon={<><ListFilter aria-hidden="true" />{activeCount > 0 && <span className="filter-button-count">{activeCount}</span>}</>} />
}
