/* eslint-disable @typescript-eslint/no-explicit-any */
import { HashbrownType, internal, isObjectType } from '../schema/base';
import { JsonValue } from '../skillet/parser/json-parser';
import { ExposedComponent } from '../ui';
import type {
  HBTree,
  PromptDiagnostic,
  SystemPrompt,
  UiAstNode,
  UiBlock,
} from './types';

const PLACEHOLDER_PREFIX = '__HBX_';

/**
 * Weave template expressions into a single string by inserting stable placeholders
 * (e.g., __HBX_0__) at expression positions. Returns the concatenated text and
 * the ordered list of placeholder tokens.
 */
function weavePlaceholders(strings: TemplateStringsArray, exprs: unknown[]) {
  let text = '';
  const placeholders: string[] = [];
  const placeholderPositions: number[] = [];

  strings.forEach((chunk, i) => {
    text += chunk;
    if (i < exprs.length) {
      const token = `${PLACEHOLDER_PREFIX}${i}__`;
      placeholders.push(token);
      placeholderPositions.push(text.length);
      text += token;
    }
  });

  return { text, placeholders, placeholderPositions } as const;
}

/**
 * Functional scan for <ui>...</ui> blocks. Produces an array of UiBlock descriptors
 * including absolute offsets and inner source text.
 */
function findUiBlocks(text: string): UiBlock[] {
  const next = (from: number, acc: UiBlock[]): UiBlock[] => {
    const startTag = text.indexOf('<ui>', from);
    if (startTag === -1) return acc;
    const endTag = text.indexOf('</ui>', startTag);
    if (endTag === -1) return acc;
    const innerStart = startTag + '<ui>'.length;
    const innerEnd = endTag;
    const blockText = text.slice(innerStart, innerEnd);
    const block: UiBlock = {
      start: startTag,
      end: endTag + '</ui>'.length,
      innerStart,
      innerEnd,
      source: blockText,
      ast: [],
    };
    return next(endTag + 5, acc.concat(block));
  };
  return next(0, []);
}

/** Whitespace check helper. */
const isWhitespace = (ch: string) => /\s/.test(ch);

/**
 * Parse a single <ui> inner source into UiAst nodes. Pure function: returns
 * the nodes and any diagnostics gathered while parsing.
 */
function parseUi(
  source: string,
  baseOffset: number,
): { nodes: UiAstNode[]; diagnostics: PromptDiagnostic[] } {
  type Attrs = Record<string, { value: string; start: number; end: number }>;
  let i = 0;
  const diags: PromptDiagnostic[] = [];

  const diag = (d: Omit<PromptDiagnostic, 'line' | 'column'>) => {
    diags.push({ ...d, line: 0, column: 0 });
  };

  const skipWs = () => {
    while (i < source.length && isWhitespace(source[i] ?? '')) i++;
  };

  const parseText = (): UiAstNode | null => {
    const start = i;
    let text = '';
    while (i < source.length && source[i] !== '<') {
      text += source[i];
      i++;
    }
    return text.length === 0
      ? null
      : { kind: 'text', text, start: baseOffset + start, end: baseOffset + i };
  };

  const parseAttrs = (): Attrs => {
    let attrs: Attrs = {};
    while (i < source.length) {
      skipWs();
      const ch = source[i];
      if (ch === '/' || ch === '>' || ch == null) break;

      const nameStart = i;
      let name = '';
      while (i < source.length) {
        const c = source[i] ?? '';
        if (/[-A-Za-z0-9_:$]/.test(c)) {
          name += c;
          i++;
        } else {
          break;
        }
      }
      skipWs();

      const readUnquoted = () => {
        const vs = i;
        while (i < source.length && /[^\s/>]/.test(source[i] ?? '')) i++;
        return {
          value: source.slice(vs, i),
          start: baseOffset + vs,
          end: baseOffset + i,
        };
      };

      const readQuoted = (q: string) => {
        i++;
        const vs = i;
        while (i < source.length && source[i] !== q) i++;
        const segment = source.slice(vs, i);
        const span = {
          value: segment,
          start: baseOffset + vs,
          end: baseOffset + i,
        };
        if (source[i] === q) i++;
        return span;
      };

      const attrSpan =
        source[i] === '='
          ? (() => {
              i++;
              skipWs();
              const q = source[i];
              return q === '"' || q === "'" ? readQuoted(q) : readUnquoted();
            })()
          : {
              value: 'true',
              start: baseOffset + nameStart,
              end: baseOffset + i,
            };

      if (Object.prototype.hasOwnProperty.call(attrs, name)) {
        diag({
          code: 'E1401',
          severity: 'error',
          message: `Duplicate attribute "${name}"`,
          start: baseOffset + nameStart,
          end: baseOffset + i,
          snippet: source.slice(nameStart, i),
        });
      }

      attrs = { ...attrs, [name]: attrSpan };
      skipWs();
    }
    return attrs;
  };

  const parseElement = (): UiAstNode | null => {
    if (source[i] !== '<') return null;
    const start = i;
    i++;
    if (source[i] === '/') return null;

    let tag = '';
    while (i < source.length && /[-A-Za-z0-9]/.test(source[i] ?? '')) {
      tag += source[i];
      i++;
    }
    skipWs();
    const attrs = parseAttrs();
    const selfClosing = source[i] === '/' ? (i++, true) : false;
    if (source[i] === '>') i++;

    const parseChildren = (acc: UiAstNode[]): UiAstNode[] => {
      if (i >= source.length) return acc;
      if (source[i] === '<' && source[i + 1] === '/') {
        i += 2;
        while (i < source.length && /[-A-Za-z0-9]/.test(source[i] ?? '')) i++;
        while (i < source.length && source[i] !== '>') i++;
        if (source[i] === '>') i++;
        return acc;
      }
      const child = source[i] === '<' ? parseElement() : parseText();
      return child == null ? acc : parseChildren(acc.concat(child));
    };

    const children = selfClosing ? [] : parseChildren([]);
    const end = baseOffset + i;
    return {
      kind: 'element',
      tag,
      start: baseOffset + start,
      end,
      attrs,
      children,
      selfClosing,
    };
  };

  const parseNodes = (acc: UiAstNode[]): UiAstNode[] => {
    skipWs();
    if (i >= source.length) return acc;
    const node = source[i] === '<' ? parseElement() : parseText();
    return node == null ? acc : parseNodes(acc.concat(node));
  };

  const nodes = parseNodes([]);
  return { nodes, diagnostics: diags };
}

/** Map absolute offset to 1-based {line, column}. */
function absoluteToLineCol(
  text: string,
  abs: number,
): { line: number; column: number } {
  const slice = text.slice(0, Math.min(abs, text.length));
  const lines = slice.split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1] ?? '').length + 1;
  return { line, column };
}

/** Plain-object check that excludes arrays and class instances. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (Object.prototype.toString.call(v) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Ensure values are JSON-serializable according to policy. */
function ensureSerializable(value: unknown): true | string {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'bigint') return 'BigInt';
  if (typeof value === 'function') return 'function';
  if (typeof value === 'symbol') return 'symbol';
  if (value instanceof Date) return 'Date';
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  if (Array.isArray(value)) {
    const firstBad = value.map(ensureSerializable).find((r) => r !== true);
    return firstBad ?? true;
  }
  if (isPlainObject(value)) {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return 'circular';
    }
  }
  return 'class-instance';
}

// Minimal local representation for prompt example injection.
type ComponentTree = {
  [tagName: string]: {
    props: Record<string, JsonValue>;
    children?: ComponentTree[] | string;
  };
};

/** Lower a UiAst element into an HBNode, collecting diagnostics functionally. */
function lowerToHB(
  node: UiAstNode,
  exprsByToken: ReadonlyMap<string, unknown>,
): { hb: ComponentTree | null; diagnostics: PromptDiagnostic[] } {
  if (node.kind === 'text') return { hb: null, diagnostics: [] };

  const foldAttrs = (
    entries: Array<[string, { value: string; start: number; end: number }]>,
  ): {
    props: Record<string, JsonValue>;
    diagnostics: PromptDiagnostic[];
  } => {
    return entries.reduce(
      (acc, [k, span]) => {
        const raw = span.value;
        if (raw.startsWith(PLACEHOLDER_PREFIX)) {
          const val = exprsByToken.get(raw) as JsonValue;
          const ser = ensureSerializable(val);
          return ser !== true
            ? {
                props: acc.props,
                diagnostics: acc.diagnostics.concat({
                  code: 'E1301',
                  severity: 'error',
                  message: `${raw} is not JSON-serializable (${ser}).`,
                  start: span.start,
                  end: span.end,
                  line: 0,
                  column: 0,
                  snippet: raw,
                }),
              }
            : {
                props: { ...acc.props, [k]: val },
                diagnostics: acc.diagnostics,
              };
        }
        const value =
          raw === 'true'
            ? true
            : raw === 'false'
              ? false
              : raw === 'null'
                ? null
                : /^-?\d+(?:\.\d+)?$/.test(raw)
                  ? Number(raw)
                  : raw;
        return {
          props: { ...acc.props, [k]: value as JsonValue },
          diagnostics: acc.diagnostics,
        };
      },
      {
        props: {} as Record<string, JsonValue>,
        diagnostics: [] as PromptDiagnostic[],
      },
    );
  };

  const { props, diagnostics: attrDiags } = foldAttrs(
    Object.entries(node.attrs),
  );
  const childrenLowered = node.children.map((c) => lowerToHB(c, exprsByToken));
  const childDiags = childrenLowered.flatMap((r) => r.diagnostics);
  const children = childrenLowered
    .map((r) => r.hb)
    .filter((h): h is ComponentTree => h != null);
  const hb: ComponentTree = {
    [node.tag]: {
      props,
      ...(children.length ? { children } : {}),
    },
  };
  return { hb, diagnostics: attrDiags.concat(childDiags) };
}

// Internal flexible HB node to support string children for 'text' components
type FlexHBNode = {
  [tagName: string]: {
    props: Record<string, JsonValue>;
    children?: FlexHBNode[] | string;
    $elementChildren?: FlexHBNode[];
  };
};

/**
 * Lower a UiAst element into a flexible HB node that can represent text children
 * (when component policy is 'text'). This variant requires access to the component
 * registry (by name or selector) to know each component's children policy.
 */
function lowerWithPolicy(
  node: UiAstNode,
  exprsByToken: ReadonlyMap<string, unknown>,
  byName: ReadonlyMap<string, ExposedComponent<any>>,
): FlexHBNode | null {
  if (node.kind === 'text') return null;

  const foldAttrs = (
    entries: Array<[string, { value: string; start: number; end: number }]>,
  ): Record<string, JsonValue> => {
    return entries.reduce(
      (acc, [k, span]) => {
        const raw = span.value;
        if (raw.startsWith(PLACEHOLDER_PREFIX)) {
          const val = exprsByToken.get(raw) as JsonValue;
          const ser = ensureSerializable(val);
          return {
            ...acc,
            [k]: ser === true ? val : null,
          };
        }
        const value =
          raw === 'true'
            ? true
            : raw === 'false'
              ? false
              : raw === 'null'
                ? null
                : /^-?\d+(?:\.\d+)?$/.test(raw)
                  ? Number(raw)
                  : raw;
        return { ...acc, [k]: value as JsonValue };
      },
      {} as Record<string, JsonValue>,
    );
  };

  const props = foldAttrs(Object.entries(node.attrs));
  const comp = byName.get(node.tag);
  const policy = comp ? comp.children : undefined;

  if (policy === 'text') {
    // Concatenate only text children (preserve placeholders) as content
    const content = node.children
      .map((c) => (c.kind === 'text' ? c.text : ''))
      .join('');
    const elementChildren = node.children
      .map((c) =>
        c.kind === 'element' ? lowerWithPolicy(c, exprsByToken, byName) : null,
      )
      .filter((h): h is FlexHBNode => h != null);
    // Include a meta property for validation; stripped out for injection later
    return {
      [node.tag]: {
        props,
        children: content,
        $elementChildren: elementChildren,
      },
    } as unknown as FlexHBNode;
  }

  // Default behavior: lower element children only (ignore text nodes)
  const loweredChildren = node.children
    .map((c) =>
      c.kind === 'element' ? lowerWithPolicy(c, exprsByToken, byName) : null,
    )
    .filter((h): h is FlexHBNode => h != null);

  return {
    [node.tag]: {
      props,
      ...(loweredChildren.length ? { children: loweredChildren } : {}),
    },
  } as FlexHBNode;
}

/** Compute Levenshtein distance for nearest-name suggestions. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

/** Validate examples against component registry; returns diagnostics (functional). */
function validateExamples(
  examples: readonly any[],
  blocks: readonly UiBlock[],
  components: readonly ExposedComponent<any>[],
  toLineCol: (offset: number) => { line: number; column: number },
): PromptDiagnostic[] {
  const byName = new Map<string, ExposedComponent<any>>();
  const allNames: string[] = [];
  components.forEach((c) => {
    if (c && typeof c.name === 'string') {
      byName.set(c.name, c);
      allNames.push(c.name);
    }
    // Support Angular-style selector aliases
    if (c && typeof (c as any).selector === 'string') {
      const sel = (c as any).selector as string;
      byName.set(sel, c);
      allNames.push(sel);
    }
  });

  const getNodeEntry = (node: any) => {
    if (!node || typeof node !== 'object') return null;
    const entries = Object.entries(node);
    if (entries.length === 0) return null;
    const [tag, value] = entries[0];
    return { tag, value: value as any };
  };

  const visit = (node: any, blk: UiBlock): PromptDiagnostic[] => {
    const entry = getNodeEntry(node);
    if (!entry) return [];
    const { tag, value } = entry;
    const comp = byName.get(tag);
    if (!comp) {
      const suggestions = allNames
        .map((n) => ({ n, d: levenshtein(n.toLowerCase(), tag.toLowerCase()) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 1)
        .map((x) => x.n);
      return [
        {
          code: 'E1001',
          severity: 'error',
          message:
            `<${tag}> not found.` +
            (suggestions.length ? ` Did you mean <${suggestions[0]}>?` : ''),
          start: blk.innerStart,
          end: blk.innerEnd,
          ...toLineCol(blk.innerStart),
          snippet: blk.source,
        },
      ];
    }

    const diags: PromptDiagnostic[] = [];
    if (comp.props && typeof comp.props === 'object') {
      const definedProps = new Set(Object.keys(comp.props));

      const nodeProps: Record<string, unknown> = value?.props || {};

      definedProps.forEach((key) => {
        if (!(key in nodeProps)) {
          diags.push({
            code: 'E1102',
            severity: 'error',
            message: `<${tag}> missing required prop "${key}".`,
            start: blk.innerStart,
            end: blk.innerEnd,
            ...toLineCol(blk.innerStart),
            snippet: blk.source,
          });
        }
      });

      Object.entries(nodeProps).forEach(([k, v]) => {
        if (!definedProps.has(k)) {
          diags.push({
            code: 'W2001',
            severity: 'warning',
            message: `Prop "${k}" is not defined on <${tag}>.`,
            start: blk.innerStart,
            end: blk.innerEnd,
            ...toLineCol(blk.innerStart),
            snippet: blk.source,
          });
        } else {
          try {
            const schema = (comp as any).props?.[k];
            if (schema && typeof schema.validate === 'function') {
              schema.validate(v);
            }
          } catch (e) {
            diags.push({
              code: 'E1203',
              severity: 'error',
              message: `Prop "${k}" on <${tag}> failed schema validation: \n\n${(e as Error).message}`,
              start: blk.innerStart,
              end: blk.innerEnd,
              ...toLineCol(blk.innerStart),
              snippet: blk.source,
            });
          }
        }
      });
    }

    const policy = comp.children;
    const arrayChildren = Array.isArray(value?.children)
      ? (value?.children as any[])
      : [];

    if (policy === 'text') {
      // Text-only components: any element child is not allowed
      const elementChildren = Array.isArray(value?.$elementChildren)
        ? (value?.$elementChildren as any[])
        : arrayChildren;
      const hasElementChildren = elementChildren.length > 0;
      if (hasElementChildren) {
        diags.push({
          code: 'W2101',
          severity: 'warning',
          message: `<${tag}> expects text children, element found.`,
          start: blk.innerStart,
          end: blk.innerEnd,
          ...toLineCol(blk.innerStart),
          snippet: blk.source,
        });
      }
      // no recursion for text children
      return diags;
    }

    if (policy === false && arrayChildren.length) {
      diags.push({
        code: 'W2101',
        severity: 'warning',
        message: `<${tag}> does not accept children.`,
        start: blk.innerStart,
        end: blk.innerEnd,
        ...toLineCol(blk.innerStart),
        snippet: blk.source,
      });
    } else if (Array.isArray(policy) && arrayChildren.length) {
      const allowed = new Set(policy.map((p: any) => p.name));
      arrayChildren.forEach((ch: any) => {
        const childEntry = getNodeEntry(ch);
        const childTag = childEntry?.tag ?? '';
        if (!allowed.has(childTag)) {
          diags.push({
            code: 'W2101',
            severity: 'warning',
            message: `<${tag}> children restricted; "${childTag}" not allowed.`,
            start: blk.innerStart,
            end: blk.innerEnd,
            ...toLineCol(blk.innerStart),
            snippet: blk.source,
          });
        }
      });
    }

    const childDiags = arrayChildren.flatMap((c: any) => visit(c, blk));
    return diags.concat(childDiags);
  };

  return examples.flatMap((tree, idx) =>
    tree.flatMap((n: any) =>
      blocks[idx] ? visit(n, blocks[idx] as UiBlock) : [],
    ),
  );
}

/** Replace <ui> blocks with inline JSON fences or placeholders. */
function injectExamples(
  text: string,
  blocks: readonly UiBlock[],
  examples: readonly HBTree[],
  mode: 'inline' | 'placeholder' | 'none',
): string {
  if (mode === 'none') return text;
  const parts = blocks.reduce(
    (acc, blk, i) => {
      const pre = text.slice(acc.cursor, blk.start);
      const mid =
        mode === 'inline'
          ? `\n\n${JSON.stringify(examples[i], null, 2)}\n\n`
          : `[See compiled UI example ${String.fromCharCode('A'.charCodeAt(0) + i)}]`;
      return { cursor: blk.end, out: acc.out + pre + mid };
    },
    { cursor: 0, out: '' },
  );
  return parts.out + text.slice(parts.cursor);
}

/**
 * Helper function to replace remaining placeholder tokens with their actual values.
 * Only replaces placeholders that appeared outside of <ui> blocks in the original
 * author text, since placeholders inside <ui> blocks are handled by the component
 * lowering system.
 */
function replacePlaceholders(
  text: string,
  exprsByToken: Map<string, unknown>,
  skipTokens: ReadonlySet<string>,
): string {
  let result = text;

  exprsByToken.forEach((value, token) => {
    if (skipTokens.has(token)) return;

    // Convert value to string - handle various types
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (value === null || value === undefined) {
      stringValue = '';
    } else if (typeof value === 'object') {
      // For objects/arrays, stringify them
      try {
        stringValue = JSON.stringify(value, null, 2);
      } catch {
        stringValue = String(value);
      }
    } else {
      stringValue = String(value);
    }

    if (result.indexOf(token) === -1) return;

    result = result.split(token).join(stringValue);
  });
  return result;
}

/**
 * @public
 */
export function prompt(
  strings: TemplateStringsArray,
  ...exprs: unknown[]
): SystemPrompt {
  const { text, placeholders, placeholderPositions } = weavePlaceholders(
    strings,
    exprs,
  );
  const exprsByToken = new Map<string, unknown>(
    placeholders.map((p, i) => [p, exprs[i]]),
  );

  const blocks = findUiBlocks(text);
  const tokensInsideUiBlocks = new Set<string>();
  placeholderPositions.forEach((start, idx) => {
    if (blocks.some((block) => start >= block.start && start < block.end)) {
      tokensInsideUiBlocks.add(placeholders[idx]);
    }
  });
  const parsed = blocks.map((b) => parseUi(b.source, b.innerStart));
  const astBlocks = parsed.map((p) => p.nodes);
  const parseDiagnostics = parsed
    .flatMap((p) => p.diagnostics)
    .map((d) => ({ ...d, ...absoluteToLineCol(text, d.start) }));

  const lowered = astBlocks.map((ast) =>
    ast.map((n) => lowerToHB(n, exprsByToken)),
  );
  const loweredTrees: HBTree[] = lowered.map((nodes) =>
    nodes.map((r) => r.hb).filter((x): x is ComponentTree => x != null),
  );
  const lowerDiagnostics = lowered
    .flatMap((nodes) => nodes.flatMap((r) => r.diagnostics))
    .map((d) => ({ ...d, ...absoluteToLineCol(text, d.start) }));

  let diagnostics: PromptDiagnostic[] =
    parseDiagnostics.concat(lowerDiagnostics);

  function compile(components: readonly any[], schema: HashbrownType): string {
    // Build component lookup by name and selector for policy-aware lowering
    const byName = new Map<string, ExposedComponent<any>>();
    components.forEach((c) => {
      if (c && typeof c.name === 'string') byName.set(c.name, c);
      if (c && typeof (c as any).selector === 'string')
        byName.set((c as any).selector as string, c);
    });

    // Lower AST using the component children policy (supports 'text')
    const policyExamples = astBlocks.map((ast) =>
      ast
        .map((n) => lowerWithPolicy(n, exprsByToken, byName))
        .filter((n): n is FlexHBNode => n != null),
    );

    // Prepare a cleaned version for injection without meta helper properties
    const cleanForInjection = (nodes: FlexHBNode[]): FlexHBNode[] =>
      nodes.map((n) => {
        const entries = Object.entries(n as Record<string, any>);
        if (entries.length === 0) {
          return n;
        }
        const [tag, value] = entries[0];
        const cleanedValue: any = { ...(value ?? {}) };
        if (Array.isArray(cleanedValue.children)) {
          cleanedValue.children = cleanForInjection(
            cleanedValue.children as FlexHBNode[],
          );
        }
        if ('$elementChildren' in cleanedValue) {
          delete cleanedValue.$elementChildren;
        }
        return { [tag]: cleanedValue } as FlexHBNode;
      });

    const validation = validateExamples(
      policyExamples as any,
      blocks,
      components as any,
      (o) => absoluteToLineCol(text, o),
    );
    diagnostics = parseDiagnostics.concat(lowerDiagnostics).concat(validation);
    const cleaned = (policyExamples as any).map((tree: FlexHBNode[]) =>
      cleanForInjection(tree),
    );

    const shouldWrapUi =
      isObjectType(schema) &&
      Object.prototype.hasOwnProperty.call(
        schema[internal].definition.shape,
        'ui',
      );
    const toInject = shouldWrapUi
      ? (cleaned as any).map((tree: FlexHBNode[]) => ({ ui: tree }))
      : cleaned;

    // If no components are provided, do not inline JSON fences; preserve author text.
    const mode: 'inline' | 'placeholder' | 'none' =
      components.length > 0 ? 'inline' : 'none';
    const withExamples = injectExamples(text, blocks, toInject as any, mode);

    // Replace any remaining placeholder tokens with their actual values
    // (but not those inside <ui> blocks, which are handled by the lowering system)
    return replacePlaceholders(
      withExamples,
      exprsByToken,
      tokensInsideUiBlocks,
    );
  }

  return {
    compile,
    examples: loweredTrees,
    get diagnostics() {
      return diagnostics;
    },
    meta: {
      uiBlocks: blocks.map((b) => ({
        start: b.start,
        end: b.end,
        source: b.source,
      })),
    },
  };
}

export type { SystemPrompt } from './types';
