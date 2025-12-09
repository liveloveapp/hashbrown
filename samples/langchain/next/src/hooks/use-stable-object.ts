import { useRef } from 'react';
import { hash } from 'ohash';
import deepEqual from 'fast-deep-equal';

function areObjectsDifferent(a: unknown, b: unknown): boolean {
  const hashA = hash(a);
  const hashB = hash(b);
  if (hashA !== hashB) return true;

  return !deepEqual(a, b);
}

export function useStableObject<T>(value: T): T {
  const ref = useRef<{ value: T; hash: string } | null>(null);

  if (ref.current === null) {
    ref.current = { value, hash: hash(value) };
  } else if (areObjectsDifferent(ref.current.value, value)) {
    ref.current = { value, hash: hash(value) };
  }

  return ref.current.value;
}
