import type { ReactElement, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  children: ReactNode;
}

export default function Card({ title, children }: CardProps): ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.title}>{title}</div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
