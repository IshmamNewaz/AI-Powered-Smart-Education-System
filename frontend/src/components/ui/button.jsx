import { cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
        outline: 'border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800',
        ghost: 'text-slate-200 hover:bg-slate-800 hover:text-white',
        danger: 'bg-rose-600 text-white hover:bg-rose-500',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export function Button({ className, variant, size, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
