import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]',
        secondary:
          'border-transparent bg-[var(--muted)] text-[var(--foreground)]',
        success:
          'border-transparent bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
        warning:
          'border-transparent bg-amber-500/20 text-amber-900 dark:text-amber-200',
        destructive:
          'border-transparent bg-red-600/15 text-red-800 dark:text-red-300',
        outline: 'text-[var(--foreground)] border-[var(--border)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
