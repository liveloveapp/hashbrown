import Link from 'next/link';

/** Spike index: links to each migrated route family. */
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: 24 }}>
      <h1>hashbrown.dev on Next.js (spike)</h1>
      <ul>
        <li>
          <Link href="/docs/react/start/quick">React quick start</Link>
        </li>
        <li>
          <Link href="/docs/angular/start/quick">Angular quick start</Link>
        </li>
        <li>
          <Link href="/blog">Blog</Link>
        </li>
        <li>
          <Link href="/api/react/useChat">API: useChat</Link>
        </li>
      </ul>
    </main>
  );
}
