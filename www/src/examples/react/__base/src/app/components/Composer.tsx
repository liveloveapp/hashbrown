import type { ReactElement } from 'react';
import styles from './Composer.module.css';

interface ComposerProps {
  onChange: (message: string) => void;
}

export default function Composer({ onChange }: ComposerProps): ReactElement {
  return (
    <div className={styles.container}>
      <textarea
        className={styles.chatComposer}
        placeholder="Show me all lights"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            target.value += '\n';
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            onChange(target.value);
            target.value = '';
          }
        }}
      ></textarea>
      <button className={styles.sendButton} aria-label="Send">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          height="24"
          width="24"
        >
          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
          <path d="M12 8l-4 4"></path>
          <path d="M12 8v8"></path>
          <path d="M16 12l-4 -4"></path>
        </svg>
      </button>
    </div>
  );
}
