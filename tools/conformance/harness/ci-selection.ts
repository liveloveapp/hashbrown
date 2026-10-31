/** Selects expensive CI fixtures from the complete Nx task graph, including dependencies. */
export function selectCiSetup(taskIds: readonly string[]): {
  readonly dotnet: boolean;
  readonly browser: boolean;
  readonly python: boolean;
} {
  return {
    python: taskIds.some((id) => {
      const [project, target] = id.split(':');
      return (
        project === 'pydantic-ai-conformance' &&
        [
          'install',
          'test',
          'consumer-test',
          'example-e2e',
          'compatibility-baseline',
        ].includes(target)
      );
    }),
    dotnet: taskIds.some((id) => id.startsWith('dotnet-conformance:')),
    browser: taskIds.some((id) => {
      const target = id.split(':')[1];
      return (
        id.startsWith('atc-e2e:e2e') ||
        target === 'example-e2e' ||
        target === 'provider-e2e' ||
        target === 'provider-smoke' ||
        target === 'package-pr-acceptance' ||
        target === 'package-acceptance' ||
        target === 'workbench-check' ||
        target === 'workbench-e2e'
      );
    }),
  };
}
