import { type ResourceStatus, type Signal, signal } from '@angular/core';
import {
  createResourceSnapshot,
  createResourceValue,
} from './create-resource-snapshot.fn';

const missingErrorMessage = 'Resource failed without an error';

test('keeps resource value and snapshot reactive across every status', () => {
  const rawValue = signal('idle value');
  const status = signal<ResourceStatus>('idle');
  const error = signal<Error | undefined>(undefined);
  const value = createResourceValue(rawValue, status, error);
  const snapshot = createResourceSnapshot(value, status, error);

  expect(value()).toBe('idle value');
  expect(snapshot()).toEqual({ status: 'idle', value: 'idle value' });

  rawValue.set('loading value');
  status.set('loading');

  expect(value()).toBe('loading value');
  expect(snapshot()).toEqual({ status: 'loading', value: 'loading value' });

  rawValue.set('reloading value');
  status.set('reloading');

  expect(value()).toBe('reloading value');
  expect(snapshot()).toEqual({
    status: 'reloading',
    value: 'reloading value',
  });

  rawValue.set('resolved value');
  status.set('resolved');

  expect(value()).toBe('resolved value');
  expect(snapshot()).toEqual({
    status: 'resolved',
    value: 'resolved value',
  });

  rawValue.set('local value');
  status.set('local');

  expect(value()).toBe('local value');
  expect(snapshot()).toEqual({ status: 'local', value: 'local value' });

  const failure = new Error('failed');
  error.set(failure);
  status.set('error');

  expect(() => value()).toThrow(failure);
  expect(snapshot()).toEqual({ status: 'error', error: failure });

  rawValue.set('recovered value');
  status.set('resolved');

  expect(value()).toBe('recovered value');
  expect(snapshot()).toEqual({
    status: 'resolved',
    value: 'recovered value',
  });
});

test('keeps a loading value readable without reading a stale error', () => {
  const rawValue = signal('stale value');
  const status = signal<ResourceStatus>('loading');
  const rawError = signal<Error | undefined>(new Error('stale error'));
  const error = vi.fn(() => rawError()) as unknown as Signal<Error | undefined>;
  const value = createResourceValue(rawValue, status, error);
  const snapshot = createResourceSnapshot(value, status, error);

  const currentValue = value();
  const currentSnapshot = snapshot();

  expect(currentValue).toBe('stale value');
  expect(currentSnapshot).toEqual({
    status: 'loading',
    value: 'stale value',
  });
  expect(error).not.toHaveBeenCalled();
});

test('uses the same fallback error behavior for value and snapshot', () => {
  const rawValue = signal('result');
  const status = signal<ResourceStatus>('error');
  const error = signal<Error | undefined>(undefined);
  const value = createResourceValue(rawValue, status, error);
  const snapshot = createResourceSnapshot(value, status, error);

  const result = snapshot();

  expect(() => value()).toThrow(missingErrorMessage);
  expect(result).toEqual({ status: 'error', error: expect.any(Error) });

  if (result.status !== 'error') {
    throw new Error(`Expected an error snapshot, received ${result.status}`);
  }

  expect(result.error.message).toBe(missingErrorMessage);
});

test('does not read value while creating an error snapshot', () => {
  const value = vi.fn(() => 'result') as unknown as Signal<string>;
  const status = signal<ResourceStatus>('error');
  const failure = new Error('failed');
  const error = signal<Error | undefined>(failure);
  const snapshot = createResourceSnapshot(value, status, error);

  const result = snapshot();

  expect(result).toEqual({ status: 'error', error: failure });
  expect(value).not.toHaveBeenCalled();
});
