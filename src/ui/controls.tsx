import type { ReactNode } from "react";
import styles from "./controls.module.css";

/**
 * Level 2 of the sidebar hierarchy: a module view inside a domain.
 *
 * The disclosure is a native <details>, so open/closed costs no state, survives
 * being re-rendered, and is what the browser's own find-in-page expands.
 */
export function Panel({
  title,
  badge,
  active,
  children,
  open = true,
}: {
  title: string;
  /** Right-aligned counter. Null or undefined prints nothing; 0 prints "0". */
  badge?: number | string | null;
  /** Marks the panel that the current selection is about. */
  active?: boolean;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className={active ? `${styles.panel} ${styles.panelActive}` : styles.panel} open={open}>
      <summary className={styles.summary}>
        <span className={styles.title}>{title}</span>
        {badge !== undefined && badge !== null && <span className={styles.badge}>{badge}</span>}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/**
 * Level 3: a group of fields inside a panel. Indented behind a guide line so
 * the eye can tell "these six numbers are one idea" from "these are the next
 * thing", which a flat column of labelled inputs cannot say.
 */
export function SubGroup({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className={styles.sub} open={open}>
      <summary className={styles.subSummary}>{title}</summary>
      <div className={styles.subBody}>{children}</div>
    </details>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <Field label={label}>
      <span className={styles.withSuffix}>
        <input
          type="number"
          className={styles.input}
          value={round(value)}
          step={step}
          {...(min === undefined ? {} : { min })}
          {...(max === undefined ? {} : { max })}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            if (!Number.isNaN(next)) onChange(next);
          }}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        className={styles.input}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="text"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <Field label={label}>
      <span className={styles.withSuffix}>
        <input
          type="color"
          className={styles.color}
          value={value ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
        />
        {allowNone && (
          <button type="button" className={styles.mini} onClick={() => onChange(null)}>
            {value === null ? "None" : "Clear"}
          </button>
        )}
      </span>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className={styles.checkbox} title={hint}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className={styles.hint}>{children}</p>;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
