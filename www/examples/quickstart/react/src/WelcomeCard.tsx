/** A developer-owned card whose text can be supplied by the model. */
export function WelcomeCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <article aria-label="Welcome card">
      <h2>{title}</h2>
      <p>{message}</p>
    </article>
  );
}
