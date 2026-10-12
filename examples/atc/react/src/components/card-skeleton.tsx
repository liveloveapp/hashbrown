/** The quiet hold-back line shown while a card's ID streams in. */
export function CardSkeleton({
  label = 'Identifying aircraft…',
}: {
  readonly label?: string;
}) {
  return (
    <div className="atc-card-skeleton">
      <p className="atc-card-muted">{label}</p>
      <div className="atc-skeleton-bar" aria-hidden="true" />
      <div className="atc-skeleton-bar is-short" aria-hidden="true" />
    </div>
  );
}
