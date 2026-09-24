'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { StarShineIcon } from './icons';
import { GITHUB_REPO_URL } from './links';
import styles from './GitHubStarButton.module.css';

/** The GitHub API endpoint the Angular button reads the star count from. */
export const GITHUB_REPO_API_URL =
  'https://api.github.com/repos/liveloveapp/hashbrown';

/** The `localStorage` key the Angular button caches the star count under. */
export const GITHUB_STAR_COUNT_KEY = 'gitHubStarCount';

const CHANGE_EVENT = 'hashbrown:github-star-count';

function readStars(): number {
  try {
    const stars = Number(localStorage.getItem(GITHUB_STAR_COUNT_KEY));
    return Number.isNaN(stars) ? 0 : stars;
  } catch {
    return 0;
  }
}

function writeStars(stars: number): void {
  try {
    localStorage.setItem(GITHUB_STAR_COUNT_KEY, stars.toString());
  } catch {
    // Storage can be unavailable (private mode); the count just isn't cached.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * A link to the GitHub repository with its star count. The count starts from
 * the value cached in `localStorage`, then updates from the GitHub API, as in
 * the Angular `GitHubStarButton`. The server renders it without a count.
 */
export function GitHubStarButton() {
  const stars = useSyncExternalStore(subscribe, readStars, () => 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(GITHUB_REPO_API_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: { stargazers_count?: unknown } | undefined) => {
        if (typeof value?.stargazers_count === 'number') {
          writeStars(value.stargazers_count);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <a
      className={styles.button}
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className={styles.stars}>
        {stars > 0 && <div className={styles.count}>{stars}</div>}
        <StarShineIcon className={styles.star} />
        <div className={styles.label}>on GitHub</div>
      </div>
    </a>
  );
}
