import { CheckCircle, X } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  message: string;
  tone?: 'bad';
  action?: { label: string; run: () => void };
}
interface ToastApi {
  show(message: string, options?: { tone?: 'bad'; action?: Toast['action'] }): void;
}
const ToastContext = createContext<ToastApi>({ show: () => undefined });
export const useToast = (): ToastApi => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>((message, options) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, ...options }]);
    setTimeout(() => dismiss(id), options?.action ? 7000 : 3500);
  }, [dismiss]);
  const api = useRef({ show });
  api.current.show = show;
  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone ?? ''}`}>
            <span>{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------- dialog sheet

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="sheet-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function FormSheet(props: {
  title: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
  error?: string | null;
  warning?: ReactNode;
  children: ReactNode;
  extraAction?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const message = props.error ?? failure;
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <form
        className="sheet-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setFailure(null);
          try {
            await props.onSubmit();
          } catch (error) {
            setFailure(error instanceof Error ? error.message : 'That couldn’t be saved. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sheet-body">
          {props.children}
          {props.warning && <div className="notice warn" role="status">{props.warning}</div>}
          {message && <div className="notice bad" role="alert">{message}</div>}
        </div>
        <div className="sheet-foot">
          {props.extraAction}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : props.submitLabel ?? 'Save'}</button>
        </div>
      </form>
    </Sheet>
  );
}

export function ConfirmSheet(props: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <div className="sheet-body"><div>{props.body}</div></div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={props.onClose}>Cancel</button>
        <button type="button" className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`} onClick={props.onConfirm}>{props.confirmLabel}</button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- fields

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  prefix?: string;
}

export function Field({ label, hint, error, value, onChange, prefix, ...input }: FieldProps) {
  const id = useId();
  const described = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  const control = (
    <input
      id={id}
      className="input"
      value={value}
      aria-invalid={error ? true : undefined}
      aria-describedby={described}
      onChange={(e) => onChange(e.target.value)}
      {...input}
    />
  );
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {prefix ? <div className="prefix-input"><span aria-hidden="true">{prefix}</span>{control}</div> : control}
      {hint && !error && <div className="field-hint" id={`${id}-h`}>{hint}</div>}
      {error && <div className="field-error" id={`${id}-e`}>{error}</div>}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint, error }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export const CountField = (props: FieldProps) => <Field type="text" inputMode="numeric" autoComplete="off" {...props} />;
export const DecimalField = (props: FieldProps) => <Field type="text" inputMode="decimal" autoComplete="off" {...props} />;
export const MoneyField = (props: FieldProps) => <Field type="text" inputMode="decimal" autoComplete="off" prefix="₦" {...props} />;

// ---------------------------------------------------------------- display

export function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${tone ?? ''}`}>{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}
      </div>
      {children && <div className="row no-print">{children}</div>}
    </header>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-chip good">{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function SavedIcon() {
  return <CheckCircle size={16} weight="fill" aria-hidden="true" />;
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
