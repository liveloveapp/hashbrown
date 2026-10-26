import { types } from 'node:util';
import type {
  ContentBlock,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';

type Json = null | boolean | number | string | Json[];
type RecordValue = Record<string, unknown>;

function plainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
  return (
    Object.getPrototypeOf(prototype) === null &&
    constructor !== undefined &&
    'value' in constructor &&
    typeof constructor.value === 'function' &&
    Function.prototype.toString.call(constructor.value) ===
      Function.prototype.toString.call(Object)
  );
}

function fail(): never {
  throw new Error('Bedrock native data is invalid or unsupported');
}
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Encodes owned SDK JSON and bytes without colliding with native JSON tags. @internal */
export function encodeBedrockNative(
  value: unknown,
  omitUndefined = false,
): Json {
  const ancestors = new Set<object>();
  function encode(item: unknown): Json {
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : fail();
    if (typeof item !== 'object' || item === null || ancestors.has(item))
      return fail();
    if (!types.isUint8Array(item) && !Array.isArray(item) && !plainObject(item))
      return fail();
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length) return fail();
    for (const descriptor of Object.values(descriptors))
      if (!('value' in descriptor)) return fail();
    if (types.isUint8Array(item)) {
      const constructor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(item),
        'constructor',
      );
      if (
        !Buffer.isBuffer(item) &&
        (!constructor ||
          !('value' in constructor) ||
          Function.prototype.toString.call(constructor.value) !==
            Function.prototype.toString.call(Uint8Array))
      )
        return fail();
      if (Object.keys(descriptors).length !== item.length) return fail();
      ancestors.delete(item);
      return ['bytes', Buffer.from(item).toString('base64')];
    }
    let result: Json;
    if (Array.isArray(item)) {
      const constructor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(item),
        'constructor',
      );
      if (
        !constructor ||
        !('value' in constructor) ||
        Function.prototype.toString.call(constructor.value) !==
          Function.prototype.toString.call(Array)
      )
        return fail();
      if (
        Object.keys(descriptors).length !== item.length + 1 ||
        Array.from({ length: item.length }, (_, index) => String(index)).some(
          (key) => !Object.hasOwn(descriptors, key),
        )
      )
        return fail();
      result = [
        'array',
        Array.from({ length: item.length }, (_, index) =>
          encode(descriptors[String(index)].value),
        ),
      ];
    } else
      result = [
        'object',
        Object.entries(descriptors).flatMap(([key, descriptor]) =>
          descriptor.value === undefined && omitUndefined
            ? []
            : [[key, encode(descriptor.value)]],
        ),
      ];
    ancestors.delete(item);
    return result;
  }
  return encode(value);
}

/** Decodes strict persisted native values into fresh plain objects and Uint8Arrays. @internal */
export function decodeBedrockNative(value: unknown): unknown {
  // Validate descriptors and cycles before inspecting the untrusted representation.
  encodeBedrockNative(value);
  function decode(item: unknown): unknown {
    if (!Array.isArray(item))
      return item !== null && typeof item === 'object' ? fail() : item;
    if (item.length !== 2) return fail();
    const [tag, payload] = item;
    if (tag === 'bytes') {
      if (
        typeof payload !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          payload,
        )
      )
        return fail();
      const bytes = Buffer.from(payload, 'base64');
      if (bytes.toString('base64') !== payload) return fail();
      return Uint8Array.from(bytes);
    }
    if (!Array.isArray(payload)) return fail();
    if (tag === 'array') return payload.map(decode);
    if (tag !== 'object') return fail();
    const result: RecordValue = {};
    for (const entry of payload) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        Object.hasOwn(result, entry[0])
      )
        return fail();
      Object.defineProperty(result, entry[0], {
        value: decode(entry[1]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  return decode(value);
}
function own<T>(value: T): T {
  return decodeBedrockNative(encodeBedrockNative(value, true)) as T;
}

interface CapturedBlock {
  readonly value: RecordValue;
  readonly input: string;
  readonly closed: boolean;
  readonly usable: boolean;
}
/** Immutable indexed stream capture, including unsupported opaque events. @internal */
export interface BedrockCapture {
  readonly blocks: Readonly<Record<number, CapturedBlock>>;
  readonly messageStopped: boolean;
  readonly usable: boolean;
  readonly events: readonly unknown[];
}
/** Creates an empty indexed stream capture. @internal */
export function createBedrockCapture(): BedrockCapture {
  return { blocks: {}, messageStopped: false, usable: true, events: [] };
}
function concatBytes(left: unknown, right: unknown): Uint8Array {
  if (
    !(right instanceof Uint8Array) ||
    (left !== undefined && !(left instanceof Uint8Array))
  )
    return fail();
  return new Uint8Array([...((left as Uint8Array) ?? []), ...right]);
}

/** Adds one SDK stream event while retaining native block order and opaque data. @internal */
export function captureBedrockEvent(
  state: BedrockCapture,
  event: ConverseStreamOutput,
): BedrockCapture {
  const owned = own(event) as unknown as RecordValue;
  const next = {
    ...state,
    events: [...state.events, owned],
    usable: state.usable && !Object.hasOwn(owned, '$unknown'),
  };
  if (owned['messageStop']) return { ...next, messageStopped: true };
  const start = owned['contentBlockStart'];
  const delta = owned['contentBlockDelta'];
  const stop = owned['contentBlockStop'];
  const body = start ?? delta ?? stop;
  if (!record(body)) return next;
  const index = body['contentBlockIndex'];
  if (
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0 ||
    state.messageStopped
  )
    return { ...next, usable: false };
  const previous = state.blocks[index];
  if (previous?.closed || (start && previous) || (stop && !previous))
    return {
      ...next,
      usable: false,
      ...(previous
        ? {
            blocks: {
              ...state.blocks,
              [index]: { ...previous, usable: false },
            },
          }
        : {}),
    };
  let value = own(previous?.value ?? {});
  let input = previous?.input ?? '';
  let usable = previous?.usable ?? true;
  const initial = body['start'];
  const change = body['delta'];
  if (start) {
    if (record(initial) && Object.keys(initial).length === 0)
      value = { text: '' };
    else if (!record(initial) || Object.keys(initial).length !== 1)
      usable = false;
    else if (record(initial['toolUse']))
      value = { toolUse: initial['toolUse'] };
    else if (record(initial['toolResult']))
      value = { toolResult: { ...initial['toolResult'], content: [] } };
    else if (record(initial['image']))
      value = {
        image: { ...initial['image'], source: { bytes: new Uint8Array() } },
      };
    else usable = false;
  }
  if (delta) {
    if (!record(change) || Object.keys(change).length !== 1) usable = false;
    else if (
      typeof change['text'] === 'string' &&
      (Object.keys(value).length === 0 ||
        typeof value['text'] === 'string' ||
        record(value['citationsContent']))
    ) {
      if (record(value['citationsContent'])) {
        const citations = value['citationsContent'];
        const parts = citations['content'] as { text: string }[];
        value = {
          citationsContent: {
            ...citations,
            content: [{ text: (parts[0]?.text ?? '') + change['text'] }],
          },
        };
      } else
        value = {
          text:
            (typeof value['text'] === 'string' ? value['text'] : '') +
            change['text'],
        };
    } else if (
      record(change['toolUse']) &&
      record(value['toolUse']) &&
      typeof change['toolUse']['input'] === 'string'
    )
      input += change['toolUse']['input'];
    else if (Array.isArray(change['toolResult']) && record(value['toolResult']))
      value = {
        toolResult: {
          ...value['toolResult'],
          content: [
            ...(value['toolResult']['content'] as unknown[]),
            ...change['toolResult'],
          ],
        },
      };
    else if (
      record(change['reasoningContent']) &&
      (Object.keys(value).length === 0 || record(value['reasoningContent']))
    ) {
      const reasoning = change['reasoningContent'];
      const current = record(value['reasoningContent'])
        ? value['reasoningContent']
        : {};
      if (
        reasoning['redactedContent'] instanceof Uint8Array &&
        !current['reasoningText']
      )
        value = {
          reasoningContent: {
            redactedContent: concatBytes(
              current['redactedContent'],
              reasoning['redactedContent'],
            ),
          },
        };
      else if (
        !current['redactedContent'] &&
        (typeof reasoning['text'] === 'string' ||
          typeof reasoning['signature'] === 'string')
      ) {
        const text = record(current['reasoningText'])
          ? current['reasoningText']
          : { text: '' };
        value = {
          reasoningContent: {
            reasoningText: {
              text: (text['text'] as string) + (reasoning['text'] ?? ''),
              ...(reasoning['signature'] !== undefined ||
              text['signature'] !== undefined
                ? {
                    signature:
                      ((text['signature'] ?? '') as string) +
                      (reasoning['signature'] ?? ''),
                  }
                : {}),
            },
          },
        };
      } else usable = false;
    } else if (
      record(change['citation']) &&
      (Object.keys(value).length === 0 ||
        typeof value['text'] === 'string' ||
        record(value['citationsContent']))
    ) {
      const current = record(value['citationsContent'])
        ? value['citationsContent']
        : {
            content:
              typeof value['text'] === 'string'
                ? [{ text: value['text'] }]
                : [],
            citations: [],
          };
      value = {
        citationsContent: {
          ...current,
          citations: [
            ...(current['citations'] as unknown[]),
            change['citation'],
          ],
        },
      };
    } else if (
      record(change['image']) &&
      record(value['image']) &&
      record(change['image']['source']) &&
      change['image']['source']['bytes'] instanceof Uint8Array &&
      !change['image']['error']
    ) {
      const source = value['image']['source'] as RecordValue;
      value = {
        image: {
          ...value['image'],
          source: {
            bytes: concatBytes(
              source['bytes'],
              change['image']['source']['bytes'],
            ),
          },
        },
      };
    } else usable = false;
  }
  if (stop && record(value['toolUse'])) {
    try {
      value = {
        toolUse: {
          ...value['toolUse'],
          input: input === '' ? {} : JSON.parse(input),
        },
      };
    } catch {
      usable = false;
    }
  }
  return {
    ...next,
    usable: next.usable && usable,
    blocks: {
      ...state.blocks,
      [index]: { value, input, closed: Boolean(stop), usable },
    },
  };
}
/** Returns a fresh fully closed native block for canonical provenance. @internal */
export function readBedrockCaptureBlock(
  state: BedrockCapture,
  index: number,
): ContentBlock | undefined {
  const block = state.blocks[index];
  return block?.closed && block.usable
    ? (own(block.value) as unknown as ContentBlock)
    : undefined;
}
/** Returns complete ordered content only after normal EOF, messageStop and every block STOP. @internal */
export function readBedrockCaptureContent(
  state: BedrockCapture,
  normalEOF = false,
): ContentBlock[] | undefined {
  if (
    !normalEOF ||
    !state.messageStopped ||
    !state.usable ||
    Object.values(state.blocks).some((block) => !block.closed)
  )
    return undefined;
  return Object.keys(state.blocks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => own(state.blocks[index].value) as unknown as ContentBlock);
}
