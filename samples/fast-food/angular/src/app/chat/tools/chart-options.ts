import { s } from '@hashbrownai/core';
import type {
  ChartConfiguration,
  ChartType,
  TooltipCallbacks,
  TooltipItem,
} from 'chart.js';
import { chartSchema } from '../../chart/schema/chartSchema';

type RuntimeChartConfig = s.Infer<typeof chartSchema>;
type RuntimeChartOptions = RuntimeChartConfig['options'];
type RuntimeTooltipConfig = RuntimeChartOptions['plugins']['tooltip'];
type TemplateScope = Record<string, unknown>;
type TooltipMultiKey =
  | 'title'
  | 'beforeTitle'
  | 'afterTitle'
  | 'beforeBody'
  | 'afterBody'
  | 'footer';
type TooltipSingleKey = 'label' | 'afterLabel';

const TEMPLATE_PATTERN = /{{\s*([^}]+?)\s*}}/g;
const MAX_TEMPLATE_DEPTH = 10;

export const buildChartOptions = (
  options: RuntimeChartOptions,
): ChartConfiguration['options'] => {
  const { plugins, interaction, ...restOptions } = options;
  const { tooltip: tooltipConfig, ...otherPluginOptions } = plugins;

  return {
    responsive: true,
    maintainAspectRatio: true,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'transparent',
    ...restOptions,
    plugins: {
      ...otherPluginOptions,
      tooltip: createTooltipOptions(tooltipConfig),
    },
    interaction: normalizeInteraction(interaction),
  };
};

const normalizeInteraction = (
  interaction: RuntimeChartOptions['interaction'] | null | undefined,
) => {
  if (!interaction) {
    return undefined;
  }

  return {
    mode: interaction.mode ?? undefined,
    axis: interaction.axis ?? undefined,
    intersect:
      interaction.intersect === undefined ? undefined : interaction.intersect,
  };
};

const createTooltipOptions = (
  tooltipConfig: RuntimeTooltipConfig,
): Record<string, unknown> | undefined => {
  if (!tooltipConfig) {
    return undefined;
  }

  const callbacks = buildTooltipCallbacks(tooltipConfig);

  return {
    enabled: tooltipConfig.enabled ?? true,
    displayColors: tooltipConfig.displayColors ?? true,
    ...(callbacks ? { callbacks } : {}),
  };
};

const buildTooltipCallbacks = (
  config: RuntimeTooltipConfig,
): TooltipCallbacks<ChartType> | undefined => {
  if (!config) {
    return undefined;
  }

  const callbacks: Partial<TooltipCallbacks<ChartType>> = {};

  const registerMulti = <K extends TooltipMultiKey>(
    key: K,
    template?: string | null,
  ) => {
    const callback = createMultiDatumCallback(template);
    if (callback) {
      callbacks[key] = callback as TooltipCallbacks<ChartType>[K];
    }
  };

  const registerSingle = <K extends TooltipSingleKey>(
    key: K,
    template?: string | null,
  ) => {
    const callback = createSingleDatumCallback(template);
    if (callback) {
      callbacks[key] = callback as TooltipCallbacks<ChartType>[K];
    }
  };

  registerMulti('title', config.titleTemplate ?? null);
  registerMulti('beforeTitle', config.beforeTitleTemplate ?? null);
  registerMulti('afterTitle', config.afterTitleTemplate ?? null);
  registerSingle('label', config.labelTemplate ?? null);
  registerSingle('afterLabel', config.afterLabelTemplate ?? null);
  registerMulti('beforeBody', config.beforeBodyTemplate ?? null);
  registerMulti('afterBody', config.afterBodyTemplate ?? null);
  registerMulti('footer', config.footerTemplate ?? null);

  return Object.keys(callbacks).length
    ? (callbacks as TooltipCallbacks<ChartType>)
    : undefined;
};

const createMultiDatumCallback = (
  template?: string | null,
): ((items: TooltipItem<ChartType>[]) => string | string[]) | undefined => {
  const renderer = createTemplateRenderer(template);
  if (!renderer) {
    return undefined;
  }

  return (items) => {
    const lines = items
      .map((item) => renderer(item))
      .filter((line) => line.length > 0);

    if (!lines.length) {
      return '';
    }

    return lines;
  };
};

const createSingleDatumCallback = (
  template?: string | null,
): ((item: TooltipItem<ChartType>) => string | string[]) | undefined => {
  const renderer = createTemplateRenderer(template);
  if (!renderer) {
    return undefined;
  }

  return (item) => renderer(item);
};

const createTemplateRenderer = (
  template?: string | null,
): ((item: TooltipItem<ChartType>) => string) | null => {
  if (!template) {
    return null;
  }

  const normalized = template.trim();
  if (!normalized) {
    return null;
  }

  return (item) => {
    const scope: TemplateScope = {
      datum: item,
      chart: item.chart,
      dataset: item.dataset,
      label: item.label,
      dataIndex: item.dataIndex,
      datasetIndex: item.datasetIndex,
      parsed: item.parsed,
      raw: item.raw,
      formattedValue: item.formattedValue,
    };

    return renderTemplate(normalized, scope);
  };
};

const renderTemplate = (template: string, scope: TemplateScope): string => {
  return template.replace(TEMPLATE_PATTERN, (_, expression = ''): string => {
    const value = evaluatePath(expression.trim(), scope, 0);

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }

    return String(value);
  });
};

type TemplateToken =
  | { kind: 'prop'; value: string }
  | { kind: 'literal'; value: string | number }
  | { kind: 'expression'; value: string };

const evaluatePath = (
  path: string,
  scope: TemplateScope,
  depth: number,
): unknown => {
  const trimmed = path.trim();
  if (!trimmed || depth > MAX_TEMPLATE_DEPTH) {
    return undefined;
  }

  const tokens = tokenizePath(trimmed);
  if (!tokens.length) {
    return undefined;
  }

  let current: unknown = scope;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (token.kind === 'prop') {
      current = readProperty(current, token.value);
      continue;
    }

    if (token.kind === 'literal') {
      current = readProperty(current, token.value);
      continue;
    }

    const resolvedKey = evaluatePath(token.value, scope, depth + 1);
    if (resolvedKey === null || resolvedKey === undefined) {
      return undefined;
    }
    current = readProperty(current, resolvedKey);
  }

  return current;
};

const tokenizePath = (path: string): TemplateToken[] => {
  const tokens: TemplateToken[] = [];
  let buffer = '';

  const pushBuffer = () => {
    if (!buffer) {
      return;
    }
    tokens.push({ kind: 'prop', value: buffer });
    buffer = '';
  };

  for (let index = 0; index < path.length; index++) {
    const char = path[index];

    if (char === '.') {
      pushBuffer();
      continue;
    }

    if (char === '[') {
      pushBuffer();
      const closingIndex = findClosingBracket(path, index + 1);
      if (closingIndex === -1) {
        buffer += char;
        continue;
      }

      const content = path.slice(index + 1, closingIndex);
      tokens.push(parseBracketContent(content));
      index = closingIndex;
      continue;
    }

    buffer += char;
  }

  pushBuffer();
  return tokens;
};

const findClosingBracket = (value: string, start: number): number => {
  let depth = 1;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
};

const parseBracketContent = (raw: string): TemplateToken => {
  const content = raw.trim();
  if (!content) {
    return { kind: 'literal', value: '' };
  }

  const firstChar = content[0];
  const lastChar = content[content.length - 1];

  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === "'" && lastChar === "'")
  ) {
    return { kind: 'literal', value: content.slice(1, -1) };
  }

  if (/^-?\d+$/.test(content)) {
    return { kind: 'literal', value: Number(content) };
  }

  return { kind: 'expression', value: content };
};

const readProperty = (target: unknown, key: unknown): unknown => {
  if (target === null || target === undefined) {
    return undefined;
  }

  if (Array.isArray(target)) {
    const index =
      typeof key === 'number'
        ? key
        : typeof key === 'string' && key !== ''
          ? Number(key)
          : NaN;
    if (Number.isInteger(index)) {
      return target[index];
    }
  }

  if (typeof target === 'object' || typeof target === 'function') {
    const normalizedKey =
      typeof key === 'number'
        ? key.toString()
        : typeof key === 'string'
          ? key
          : String(key);
    return (target as Record<string, unknown>)[normalizedKey];
  }

  return undefined;
};
