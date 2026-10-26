import type { LaunchOptions } from '@playwright/test';

/** Builds local-only browser experiments; selection does not verify model identity. */
export function localChromeLaunch(options: {
  readonly tools: boolean;
  readonly modelVersion?: string;
}): {
  modelVersion: 'default' | 'v4' | 'v4_4b';
  launchOptions: LaunchOptions;
} {
  const modelVersion =
    options.modelVersion ?? (options.tools ? 'v4' : 'default');
  if (
    modelVersion !== 'default' &&
    modelVersion !== 'v4' &&
    modelVersion !== 'v4_4b'
  ) {
    throw new Error(
      'LOCAL_LLM_CHROME_MODEL_VERSION must be default, v4, or v4_4b',
    );
  }
  const features = [
    ...(options.tools
      ? ['AIPromptAPIToolUse', 'OnDeviceModelConversationBackend']
      : []),
    ...(modelVersion === 'default'
      ? []
      : [`AIApiFoundationalModel:model_version/${modelVersion}`]),
  ];
  return {
    modelVersion,
    launchOptions: {
      // Playwright disables OptimizationHints, removing Chrome's AI model broker.
      args: [
        '--disable-features=',
        ...(features.length ? [`--enable-features=${features.join(',')}`] : []),
      ],
      ignoreDefaultArgs: [
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-field-trial-config',
      ],
    },
  };
}
