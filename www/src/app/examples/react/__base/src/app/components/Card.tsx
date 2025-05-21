import type { ReactElement } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  children: ReactElement;
}

export function Card({ title, children }: CardProps): ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.title}>{title}</div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
