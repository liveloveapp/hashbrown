import { expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';

import { useTool } from './use-tool';

it('should populate an empty schema if no schema is provided', () => {
  const expected = s.object('Empty schema', {});

  const { result } = renderHook(() =>
    useTool(
      {
        name: 'test-tool',
        description: 'A test tool without schema',
        handler: async () => 'result',
      },
      [],
    ),
  );

  expect(result.current.schema).toEqual(expected);
});

it('should return the provided schema if it exists', () => {
  const expected = s.string('A string schema');

  const { result } = renderHook(() =>
    useTool(
      {
        name: 'test-tool',
        description: 'A test tool with schema',
        schema: expected,
        handler: async () => 'result',
      },
      [],
    ),
  );

  expect(result.current.schema).toEqual(expected);
});

it('should require a deps array', () => {
  renderHook(() => {
    try {
      // @ts-expect-error - Testing missing deps array
      useTool({
        name: 'test-tool',
        description: 'A test tool without deps',
        handler: async () => 'result',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('useTool requires a deps array');
    }
  });
});

it('should re-render if the name changes', () => {
  const oldName = 'test-tool';
  const newName = 'updated-tool';
  const handler = async () => 'result';
  const { result, rerender } = renderHook(
    ({ name }) =>
      useTool(
        {
          name,
          description: 'A test tool with empty deps',
          handler,
        },
        [],
      ),
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
      useTool(
        {
          name: 'test-tool',
          description,
          handler,
        },
        [],
      ),
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
      useTool(
        {
          name: 'test-tool',
          description: 'A test tool with empty deps',
          schema,
          handler,
        },
        [],
      ),
    {
      initialProps: { schema: oldSchema },
    },
  );
  const expected = { ...result.current };

  rerender({ schema: newSchema });

  expect(result.current.schema).toBe(expected.schema);
});

it('should NOT re-render if the handler changes', () => {
  const oldHandler = async () => 'old result';
  const newHandler = async () => 'new result';
  const { result, rerender } = renderHook(
    ({ handler }) =>
      useTool(
        {
          name: 'test-tool',
          description: 'A test tool with empty deps',
          handler,
        },
        [],
      ),
    {
      initialProps: { handler: oldHandler },
    },
  );
  const initialResult = { ...result.current };

  rerender({ handler: newHandler });

  expect(result.current.handler).toBe(initialResult.handler);
});

it('should only calculate tool once, on initial render, if the deps array is empty, but a re-render occurs with the same props', () => {
  const handler = async () => 'result';
  const { result, rerender } = renderHook(() =>
    useTool(
      {
        name: 'test-tool',
        description: 'A test tool with empty deps',
        handler,
      },
      [],
    ),
  );
  const initialTool = result.current;

  rerender();

  expect(result.current.name).toBe(initialTool.name);
  expect(result.current.description).toBe(initialTool.description);
  expect(result.current.schema).toEqual(initialTool.schema);
  expect(result.current.handler).toBe(initialTool.handler);
  expect(result.current).toBe(initialTool); // Ensure the tool object is the same
});

it('should re-calculate tool if any of the deps in the deps array changes', async () => {
  const { result, rerender } = renderHook(
    ({ foo }) =>
      useTool(
        {
          name: 'test-tool',
          description: 'A test tool with empty deps',
          handler: async () => foo,
        },
        [foo],
      ),
    {
      initialProps: { foo: 100 },
    },
  );
  const initialHandler = result.current.handler;
  await expect(result.current.handler()).resolves.toBe(100);

  rerender({ foo: 200 }); // Change the dependency

  await expect(result.current.handler()).resolves.toBe(200);
  expect(result.current.handler).not.toBe(initialHandler); // Ensure handler was recreated
});

it('should not re-calculate tool if deps array has contents, but those values do not change', () => {
  const { result, rerender } = renderHook(
    ({ foo }) =>
      useTool(
        {
          name: 'test-tool',
          description: 'A test tool with empty deps',
          handler: async () => foo,
        },
        [foo],
      ),
    {
      initialProps: { foo: 100 },
    },
  );
  const initialHandler = result.current.handler;

  rerender({ foo: 100 }); // Same dependency value

  expect(result.current.handler).toBe(initialHandler); // Ensure handler was not recreated
});
