import styles from './TeamAvatars.module.css';

/**
 * Overlapping team member avatars for a post's byline, from the Angular
 * post preview and post page `.team` blocks.
 *
 * @param props.team - Team member ids; each maps to `/image/team/<id>.png`.
 */
export function TeamAvatars({ team }: { team: readonly string[] }) {
  return (
    <div className={styles.team}>
      {team.map((member) => (
        // Angular rendered these without alt text; the name is the best we have.
        <img key={member} src={`/image/team/${member}.png`} alt={member} />
      ))}
    </div>
  );
}
