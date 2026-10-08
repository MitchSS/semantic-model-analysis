import { cn } from '@/lib/utils';

export const buttonClass = (variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary') =>
  cn(
    'inline-flex items-center justify-center gap-200 rounded-md px-300 py-200 text-300 font-medium transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
    variant === 'secondary' && 'border border-input bg-card text-foreground hover:bg-accent',
    variant === 'ghost' && 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    variant === 'danger' && 'border border-destructive/50 text-destructive hover:bg-destructive/10'
  );

export const inputClass = cn(
  'w-full rounded-md border border-input bg-card px-300 py-200 text-300 text-foreground',
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'aria-[invalid=true]:border-destructive'
);
