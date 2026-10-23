import { ɵbuiltInToolLabel } from './built-in-tool-labels';

test('web search labels follow the shared wording', () => {
  // Arrange
  const query = 'hashbrown';

  // Act
  const running = ɵbuiltInToolLabel('web_search', 'running', { query });
  const runningNoQuery = ɵbuiltInToolLabel('web_search', 'running', {});
  const completed = ɵbuiltInToolLabel('web_search', 'completed', {
    query,
    sourceCount: 3,
  });
  const single = ɵbuiltInToolLabel('web_search', 'completed', {
    query,
    sourceCount: 1,
  });
  const failed = ɵbuiltInToolLabel('web_search', 'failed', { query });

  // Assert
  expect(running).toBe("Searching the web for 'hashbrown'");
  expect(runningNoQuery).toBe('Searching the web');
  expect(completed).toBe("Searched 'hashbrown' · 3 sources");
  expect(single).toBe("Searched 'hashbrown' · 1 source");
  expect(failed).toBe('Web search failed');
});

test('labels are trimmed to 120 code points', () => {
  // Arrange
  const query = '😀'.repeat(200);

  // Act
  const label = ɵbuiltInToolLabel('web_search', 'running', { query });

  // Assert
  expect(Array.from(label)).toHaveLength(120);
});

test('other builtins use the fallback labels', () => {
  // Arrange
  const detail = {};

  // Act
  const running = ɵbuiltInToolLabel('code_interpreter', 'running', detail);
  const completed = ɵbuiltInToolLabel('code_interpreter', 'completed', detail);
  const failed = ɵbuiltInToolLabel('code_interpreter', 'failed', detail);

  // Assert
  expect(running).toBe('Using code_interpreter');
  expect(completed).toBe('Used code_interpreter');
  expect(failed).toBe('code_interpreter failed');
});

test('a completed web search with no query reads Searched the web', () => {
  // Arrange
  const noDetail = {};
  const withSources = { sourceCount: 2 };

  // Act
  const bare = ɵbuiltInToolLabel('web_search', 'completed', noDetail);
  const counted = ɵbuiltInToolLabel('web_search', 'completed', withSources);

  // Assert
  expect(bare).toBe('Searched the web');
  expect(counted).toBe('Searched the web · 2 sources');
});

test.each([
  ['web_fetch', 'Fetching a page', 'Fetched a page', 'Web fetch failed'],
  ['code_execution', 'Running code', 'Ran code', 'Code execution failed'],
  ['file_search', 'Searching files', 'Searched files', 'File search failed'],
  [
    'image_generation',
    'Generating an image',
    'Generated an image',
    'Image generation failed',
  ],
])(
  'uses shared plain wording for %s',
  (builtin, running, completed, failed) => {
    const detail = {};

    const labels = ['running', 'completed', 'failed'].map((status) =>
      ɵbuiltInToolLabel(
        builtin,
        status as 'running' | 'completed' | 'failed',
        detail,
      ),
    );

    expect(labels).toEqual([running, completed, failed]);
  },
);

test('includes validated query details for fetch and file search', () => {
  const query = 'flight plan';

  const fetch = ɵbuiltInToolLabel('web_fetch', 'running', {
    query: 'https://example.test',
  });
  const search = ɵbuiltInToolLabel('file_search', 'completed', {
    query,
    sourceCount: 2,
  });

  expect(fetch).toBe("Fetching 'https://example.test'");
  expect(search).toBe("Searched files for 'flight plan' · 2 sources");
});
