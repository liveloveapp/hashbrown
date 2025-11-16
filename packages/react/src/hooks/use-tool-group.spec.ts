import { expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';

import { useToolGroup } from './use-tool-group';
import { useTool } from './use-tool';

it('should return tools from callback', () => {
  const tool1 = {
    name: 'tool1',
    description: 'First tool',
    schema: s.object('Empty schema', {}),
    handler: async () => 'result1',
  };
  const tool2 = {
    name: 'tool2',
    description: 'Second tool',
    schema: s.object('Empty schema', {}),
    handler: async () => 'result2',
  };

  const { result } = renderHook(() =>
    useToolGroup(() => [tool1, tool2], []),
  );

  expect(result.current).toHaveLength(2);
  expect(result.current[0]).toBe(tool1);
  expect(result.current[1]).toBe(tool2);
});

it('should return empty array if callback returns empty array', () => {
  const { result } = renderHook(() => useToolGroup(() => [], []));

  expect(result.current).toHaveLength(0);
  expect(result.current).toEqual([]);
});

it('should memoize the result when deps do not change', () => {
  const callback = () => [
    {
      name: 'tool',
      description: 'A tool',
      schema: s.object('Empty schema', {}),
      handler: async () => 'result',
    },
  ];

  const { result, rerender } = renderHook(() => useToolGroup(callback, []));

  const firstResult = result.current;
  rerender();

  expect(result.current).toBe(firstResult);
});

it('should re-calculate when deps change', () => {
  const { result, rerender } = renderHook(
    ({ count }) =>
      useToolGroup(
        () => [
          {
            name: `tool-${count}`,
            description: 'A tool',
            schema: s.object('Empty schema', {}),
            handler: async () => `result-${count}`,
          },
        ],
        [count],
      ),
    { initialProps: { count: 1 } },
  );

  const firstResult = result.current;
  expect(firstResult[0].name).toBe('tool-1');

  rerender({ count: 2 });

  expect(result.current).not.toBe(firstResult);
  expect(result.current[0].name).toBe('tool-2');
});

it('should work with useTool to create dynamic tool lists', () => {
  const { result, rerender } = renderHook(
    ({ includeSecondTool }) => {
      const tool1 = useTool({
        name: 'tool1',
        description: 'First tool',
        handler: async () => 'result1',
        deps: [],
      });

      const tool2 = useTool({
        name: 'tool2',
        description: 'Second tool',
        handler: async () => 'result2',
        deps: [],
      });

      return useToolGroup(() => {
        const tools = [tool1];
        if (includeSecondTool) {
          tools.push(tool2);
        }
        return tools;
      }, [includeSecondTool, tool1, tool2]);
    },
    { initialProps: { includeSecondTool: false } },
  );

  expect(result.current).toHaveLength(1);
  expect(result.current[0].name).toBe('tool1');

  rerender({ includeSecondTool: true });

  expect(result.current).toHaveLength(2);
  expect(result.current[0].name).toBe('tool1');
  expect(result.current[1].name).toBe('tool2');
});

it('should handle conditional tool inclusion based on multiple conditions', () => {
  const { result, rerender } = renderHook(
    ({ condition1, condition2 }) => {
      const tool1 = useTool({
        name: 'tool1',
        description: 'First tool',
        handler: async () => 'result1',
        deps: [],
      });

      const tool2 = useTool({
        name: 'tool2',
        description: 'Second tool',
        handler: async () => 'result2',
        deps: [],
      });

      const tool3 = useTool({
        name: 'tool3',
        description: 'Third tool',
        handler: async () => 'result3',
        deps: [],
      });

      return useToolGroup(() => {
        const tools = [];
        if (condition1) {
          tools.push(tool1);
        }
        if (condition2) {
          tools.push(tool2);
        }
        if (condition1 && condition2) {
          tools.push(tool3);
        }
        return tools;
      }, [condition1, condition2, tool1, tool2, tool3]);
    },
    { initialProps: { condition1: false, condition2: false } },
  );

  expect(result.current).toHaveLength(0);

  rerender({ condition1: true, condition2: false });
  expect(result.current).toHaveLength(1);
  expect(result.current[0].name).toBe('tool1');

  rerender({ condition1: false, condition2: true });
  expect(result.current).toHaveLength(1);
  expect(result.current[0].name).toBe('tool2');

  rerender({ condition1: true, condition2: true });
  expect(result.current).toHaveLength(3);
  expect(result.current[0].name).toBe('tool1');
  expect(result.current[1].name).toBe('tool2');
  expect(result.current[2].name).toBe('tool3');
});

it('should not re-calculate when deps have same values', () => {
  const callback = () => [
    {
      name: 'tool',
      description: 'A tool',
      schema: s.object('Empty schema', {}),
      handler: async () => 'result',
    },
  ];

  const { result, rerender } = renderHook(
    ({ value }) => useToolGroup(callback, [value]),
    { initialProps: { value: 'test' } },
  );

  const firstResult = result.current;

  rerender({ value: 'test' });

  expect(result.current).toBe(firstResult);
});

it('should work with tools created from different sources', () => {
  const staticTool = {
    name: 'static',
    description: 'A static tool',
    schema: s.object('Empty schema', {}),
    handler: async () => 'static-result',
  };

  const { result } = renderHook(() => {
    const dynamicTool = useTool({
      name: 'dynamic',
      description: 'A dynamic tool',
      handler: async () => 'dynamic-result',
      deps: [],
    });

    return useToolGroup(() => [staticTool, dynamicTool], [dynamicTool]);
  });

  expect(result.current).toHaveLength(2);
  expect(result.current[0].name).toBe('static');
  expect(result.current[1].name).toBe('dynamic');
});
