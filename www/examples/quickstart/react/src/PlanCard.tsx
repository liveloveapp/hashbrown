import type { ReactNode } from 'react';

/** Presents validated streaming plan fields, with an optional application-owned footer. */
export function PlanCard(props: {
  readonly title: string;
  readonly steps: string[];
  readonly children?: ReactNode;
}) {
  return (
    <article className="wb-summary" aria-label="Summary card">
      <h2 data-wb-path="title">{props.title || 'Building your plan…'}</h2>
      <ol>
        {(props.steps ?? []).map((step, index) => (
          <li key={index} data-wb-path={`steps.${index}`}>
            {step}
          </li>
        ))}
      </ol>
      {props.children}
    </article>
  );
}
