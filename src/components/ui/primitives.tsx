import type { ComponentProps, ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, LoaderCircle, type LucideIcon } from 'lucide-react';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['canvas', 'surface', 'surface-2', 'fg', 'muted', 'subtle', 'line', 'line-strong', 'accent', 'accent-fg', 'accent-soft'],
    },
  },
});

/** Spojí třídy a vyřeší konflikty Tailwindu (pozdější třída vyhrává, např. w-36 nad w-full). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return twMerge(classes.filter(Boolean).join(' '));
}

/* ------------------------------------------------------------------ */
/* Tlačítka                                                            */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:brightness-110 hover:shadow-md',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  soft: 'bg-accent-soft text-accent hover:brightness-110',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-lg px-2.5 text-[13px]',
  md: 'h-10 rounded-xl px-3.5 text-sm',
  lg: 'h-12 rounded-2xl px-5 text-[15px]',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const iconClass = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <button type={type} className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className={cn(iconClass, 'animate-spin')} aria-hidden /> : Icon ? <Icon className={iconClass} aria-hidden /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

export function IconButton({ icon: Icon, label, size = 'md', tone = 'default', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-colors',
        size === 'sm' ? 'size-8' : 'size-10',
        tone === 'danger' ? 'text-subtle hover:bg-red-500/10 hover:text-red-600' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-[18px]'} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Karty a štítky                                                      */
/* ------------------------------------------------------------------ */

export interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  padded?: boolean;
}

export function Card({ title, icon: Icon, action, padded = true, className, children, ...rest }: CardProps) {
  return (
    <section className={cn('card min-w-0 rounded-3xl', padded && 'p-4 sm:p-5', className)} {...rest}>
      {(title || action) && (
        <header className={cn('mb-3 flex items-center justify-between gap-3', !padded && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
              {Icon && <Icon className="size-4 shrink-0 text-subtle" aria-hidden />}
              <span className="truncate">{title}</span>
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chip({ children, className, icon: Icon, title }: { children: ReactNode; className?: string; icon?: LucideIcon; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5', className ?? 'bg-surface-2 text-muted ring-1 ring-inset ring-line')}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value, className, barClassName, height = 'h-2', label }: { value: number; className?: string; barClassName?: string; height?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line', height, className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div
        className={cn('h-full rounded-full', barClassName ?? 'bg-accent')}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 140, damping: 22 }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, className, trackClassName, children }: { value: number; size?: number; stroke?: number; className?: string; trackClassName?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={cn('stroke-current', trackClassName ?? 'text-surface-2')} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn('stroke-current', className ?? 'text-accent')}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulářové prvky                                                   */
/* ------------------------------------------------------------------ */

const FIELD_BASE =
  'w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_BASE, 'h-10', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-28 py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(FIELD_BASE, 'h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a92a5' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4 py-1', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-subtle">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={cn('inline-block size-5 rounded-full bg-white shadow', checked ? 'ml-[22px]' : 'ml-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={cn('inline-flex max-w-full rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn('relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]', active ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {active && <motion.span layoutId={`seg-${options.map((x) => x.value).join('-')}`} className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            {Icon && <Icon className="relative size-3.5" aria-hidden />}
            <span className="relative truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className, colorClass }: { checked: boolean; onChange: () => void; label?: string; className?: string; colorClass?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
        checked ? cn('border-transparent text-white', colorClass ?? 'bg-accent') : 'border-line-strong bg-surface hover:border-accent',
        className,
      )}
    >
      <motion.span initial={false} animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </motion.span>
    </button>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-surface-2 text-subtle ring-1 ring-line">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} />;
}
