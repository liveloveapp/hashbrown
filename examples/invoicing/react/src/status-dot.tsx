import type { StatusTone } from './ledger-views';

/** A state as a coloured dot plus a word, so colour never carries meaning alone. */
export function StatusDot({
  tone,
  label,
}: {
  readonly tone: StatusTone;
  readonly label: string;
}) {
  return (
    <span className="status-dot" data-tone={tone}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}
