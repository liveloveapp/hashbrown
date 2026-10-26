import type { ReactNode } from 'react';

/** Presents validated streaming plan fields, with an optional application-owned footer. */
export function PlanCard(props: {
  readonly title: string;
  readonly steps: string[];
  readonly children?: ReactNode;
  readonly label?: string;
}) {
  return (
    <article className="wb-summary" aria-label="Summary card">
      <span className="wb-muted">
        {props.label ?? 'SummaryCard · trusted component'}
      </span>
      <h2>{props.title || 'Building your plan…'}</h2>
      <ol>
        {(props.steps ?? []).map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {props.children}
    </article>
  );
}
