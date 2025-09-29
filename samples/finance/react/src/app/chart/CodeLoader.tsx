import { useEffect, useMemo, useRef } from 'react';
import styles from './CodeLoader.module.css';

interface CodeLoaderProps {
  code: string;
}

export const CodeLoader = ({ code }: CodeLoaderProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    return code.split('\n').map((line) => Math.max(1, Math.round(line.length / 2)));
  }, [code]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    queueMicrotask(() => {
      root.scrollTop = root.scrollHeight;
    });
  }, [lines]);

  return (
    <div ref={rootRef} className={styles.root}>
      {lines.map((length, index) => (
        <div key={index} className={styles.line} style={{ width: `${length}ch` }} />
      ))}
    </div>
  );
};
