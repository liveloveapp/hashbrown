'use client';

/** The event a code example's See it run button dispatches. */
export const SEE_IT_RUN_EVENT = 'hb-workbench:see-it-run';

/** What {@link SEE_IT_RUN_EVENT} carries. */
export interface SeeItRunDetail {
  /** The replay milestone to seek to. */
  readonly moment: string;
  /** The id of the code example the reader clicked. */
  readonly snippet: string;
  /**
   * The 1-based, inclusive lines the code example quotes in its file, so the
   * Source tab can scroll to this snippet rather than the file's first one.
   */
  readonly lines?: { readonly start: number; readonly end: number };
}

/**
 * A code example's "See it run" button: tells the page's workbench panel to
 * jump its Replay to `moment`.
 *
 * @param moment - The replay milestone this snippet runs at.
 * @param snippet - The id of the code example element.
 * @param header - The code example's header (its file), for the accessible name.
 * @param lines - The lines the code example quotes in its file, if known.
 */
export function SeeItRunButton({
  moment,
  snippet,
  header,
  lines,
}: SeeItRunDetail & { readonly header: string }) {
  return (
    <button
      type="button"
      aria-label={`See it run: ${header}`}
      onClick={(event) =>
        event.currentTarget.dispatchEvent(
          new CustomEvent<SeeItRunDetail>(SEE_IT_RUN_EVENT, {
            bubbles: true,
            detail: { moment, snippet, ...(lines ? { lines } : {}) },
          }),
        )
      }
    >
      See it run
    </button>
  );
}
