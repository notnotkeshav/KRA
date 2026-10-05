import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export const inputCls =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500";

export const cardCls = "rounded-lg border border-slate-200 bg-white shadow-sm";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:text-slate-300",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardCls} ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const alertStyles = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
} as const;

export function Alert({ tone, title, children, className = "" }: { tone: keyof typeof alertStyles; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${alertStyles[tone]} ${className}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

const badgeStyles = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  indigo: "bg-indigo-100 text-indigo-800",
} as const;

export function Badge({ tone = "gray", children, title }: { tone?: keyof typeof badgeStyles; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      {label}
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`${cardCls} px-4 py-3`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Horizontal bar; `value` and `max` share a unit. */
export function Bar({ value, max, tone = "indigo", label }: { value: number; max: number; tone?: "indigo" | "green" | "amber"; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { indigo: "bg-indigo-500", green: "bg-green-500", amber: "bg-amber-500" }[tone];
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
      role="meter"
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Modal built on the native <dialog>, which provides focus trapping and Escape handling. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className="m-auto w-full max-w-lg rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      {open && (
        <div>
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 id="modal-title" className="text-base font-semibold text-slate-900">{title}</h2>
          </header>
          <div className="px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", tone = "danger", busy, onConfirm, onCancel, children,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; tone?: "danger" | "primary";
  busy?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
      {children}
    </Modal>
  );
}
