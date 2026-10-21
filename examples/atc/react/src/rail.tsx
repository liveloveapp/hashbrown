/**
 * The `{ }` icon of the developer tools toggle, for the rail and the phone
 * header.
 */
export function DevIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M7 3.5C5.3 3.5 5 4.4 5 5.8v2.1c0 1.1-.5 1.8-1.8 2.1 1.3.3 1.8 1 1.8 2.1v2.1c0 1.4.3 2.3 2 2.3M13 3.5c1.7 0 2 .9 2 2.3v2.1c0 1.1.5 1.8 1.8 2.1-1.3.3-1.8 1-1.8 2.1v2.1c0 1.4-.3 2.3-2 2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The thin column at the far left of the workbench. Its one button turns dev
 * mode on and off (`aria-pressed`). Phones hide the rail and use the header
 * button instead.
 */
export function Rail({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <nav className="atc-rail" aria-label="Tools">
      <button
        type="button"
        className="atc-rail-button"
        aria-label="Developer tools"
        aria-pressed={on}
        data-testid="dev-toggle"
        onClick={onToggle}
      >
        <DevIcon />
      </button>
    </nav>
  );
}
