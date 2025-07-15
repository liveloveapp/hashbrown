import { expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';

import { useTool } from './use-tool';

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => null);

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

it('should populate an empty schema if no schema is provided', () => {
  const expected = s.object('Empty schema', {});

  const { result } = renderHook(() =>
    useTool({
      name: 'test-tool',
      description: 'A test tool without schema',
      handler: async () => 'result',
    }),
  );

  expect(result.current.schema).toEqual(expected);
});

it('should return the provided schema if it exists', () => {
  const expected = s.string('A string schema');

  const { result } = renderHook(() =>
    useTool({
      name: 'test-tool',
      description: 'A test tool with schema',
      schema: expected,
      handler: async () => 'result',
    }),
  );

  expect(result.current.schema).toEqual(expected);
});

it('should re-render if the name changes', () => {
  const oldName = 'test-tool';
  const newName = 'updated-tool';
  const handler = async () => 'result';
  const { result, rerender } = renderHook(
    ({ name }) =>
      useTool({
        name,
        description: 'A test tool with empty deps',
        handler,
      }),
    {
      initialProps: { name: oldName },
    },
  );
  const shallowCopy = { ...result.current };
  const expected = { ...shallowCopy, name: newName };

  rerender({ name: newName });

  expect(result.current.name).toBe(expected.name);
});

it('should re-render if the description changes', () => {
  const oldDescription = 'A test tool with empty deps';
  const newDescription = 'An updated description for the test tool';
  const handler = async () => 'result';
  const { result, rerender } = renderHook(
    ({ description }) =>
      useTool({
        name: 'test-tool',
        description,
        handler,
      }),
    {
      initialProps: { description: oldDescription },
    },
  );
  const shallowCopy = { ...result.current };
  const expected = { ...shallowCopy, description: newDescription };

  rerender({ description: newDescription });

  expect(result.current.description).toBe(expected.description);
});

it('should NOT re-render if the schema changes', () => {
  const oldSchema = s.string('An old string schema');
  const newSchema = s.string('An updated string schema');
  const handler = async () => 'result';
  const { result, rerender } = renderHook(
    ({ schema }) =>
      useTool({
        name: 'test-tool',
        description: 'A test tool with empty deps',
        schema,
        handler,
      }),
    {
      initialProps: { schema: oldSchema },
    },
  );
  const expected = { ...result.current };

  rerender({ schema: newSchema });

  expect(result.current.schema).toBe(expected.schema);
});

it('should re-render if the handler changes', () => {
  const oldHandler = async () => 'old result';
  const newHandler = async () => 'new result';
  const { result, rerender } = renderHook(
    ({ handler }) =>
      useTool({
        name: 'test-tool',
        description: 'A test tool with empty deps',
        handler,
      }),
    {
      initialProps: { handler: oldHandler },
    },
  );

  rerender({ handler: newHandler });

  expect(warnSpy).toHaveBeenCalledWith(
    'Handler for tool "test-tool" changed between renders. Wrap it in useCallback or expect unnecessary re‑creates.',
  );
  expect(result.current.handler).toBe(newHandler);
});
