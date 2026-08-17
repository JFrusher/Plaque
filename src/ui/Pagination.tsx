import styles from "./Pagination.module.css";

export interface PaginationProps {
  index: number;
  count: number;
  onChange: (index: number) => void;
}

export function Pagination({ index, count, onChange }: PaginationProps) {
  const clamp = (n: number) => Math.max(0, Math.min(count - 1, n));
  return (
    <nav className={styles.bar} aria-label="Sheets">
      <button type="button" onClick={() => onChange(clamp(index - 1))} disabled={index <= 0}>
        ‹ Prev
      </button>
      <span className={styles.label} aria-live="polite">
        {count === 0 ? "No sheets" : `Sheet ${index + 1} of ${count}`}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(index + 1))}
        disabled={count === 0 || index >= count - 1}
      >
        Next ›
      </button>
    </nav>
  );
}
