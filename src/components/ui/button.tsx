import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cva, type VariantProps } from 'class-variance-authority'
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
