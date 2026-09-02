import { type AGUIEvent, EventType } from '@ag-ui/core';

import { cloneAndFreezeOptionalJsonValue } from './json-value';
import type { JsonValue } from './types';

type StateDelta = Extract<AGUIEvent, { type: EventType.STATE_DELTA }>['delta'];
type MutableContainer = JsonValue[] | Record<string, JsonValue>;

/**
 * Atomically applies an AG-UI state delta to an owned JSON document.
 *
 * @internal
 */
export function applyJsonPatch(
  document: JsonValue | undefined,
  patch: StateDelta,
): JsonValue | undefined {
  let workingDocument = toMutableJsonValue(
    cloneAndFreezeOptionalJsonValue(document),
  );

  for (let index = 0; index < patch.length; index += 1) {
    workingDocument = applyOperation(workingDocument, patch[index], index);
  }

  return cloneAndFreezeOptionalJsonValue(workingDocument);
}

function applyOperation(
  document: JsonValue | undefined,
  operation: unknown,
  index: number,
): JsonValue | undefined {
  const record = operationRecord(operation, index);
  const op = requiredString(record, 'op', index);
  const path = parsePointer(
    requiredString(record, 'path', index),
    index,
    'path',
  );

  switch (op) {
    case 'add':
      return addValue(document, path, patchValue(record, index));
    case 'remove':
      return removeValue(document, path, index).document;
    case 'replace':
      return replaceValue(document, path, patchValue(record, index), index);
    case 'move': {
      const from = parsePointer(
        requiredString(record, 'from', index),
        index,
        'from',
      );
      if (isDescendantPath(path, from)) {
        throw patchError(
          index,
          'cannot move a value into one of its descendants',
        );
      }

      const removed = removeValue(document, from, index);
      return addValue(removed.document, path, removed.value);
    }
    case 'copy': {
      const from = parsePointer(
        requiredString(record, 'from', index),
        index,
        'from',
      );
      const value = getValue(document, from, index);
      return addValue(document, path, toMutableJsonValue(value) as JsonValue);
    }
    case 'test': {
      const value = getValue(document, path, index);
      if (!jsonValuesEqual(value, patchValue(record, index))) {
        throw patchError(index, 'test operation failed');
      }

      return document;
    }
    default:
      throw patchError(index, `unsupported operation ${JSON.stringify(op)}`);
  }
}

function addValue(
  document: JsonValue | undefined,
  path: readonly string[],
  value: JsonValue,
): JsonValue {
  if (path.length === 0) {
    return value;
  }

  const { parent, token } = resolveParent(document, path);
  if (Array.isArray(parent)) {
    if (token === '-') {
      parent.push(value);
      return document as JsonValue;
    }

    const arrayIndex = arrayIndexForAdd(token, parent.length);
    parent.splice(arrayIndex, 0, value);
    return document as JsonValue;
  }

  Object.defineProperty(parent, token, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return document as JsonValue;
}

function removeValue(
  document: JsonValue | undefined,
  path: readonly string[],
  operationIndex: number,
): { document: JsonValue | undefined; value: JsonValue } {
  if (path.length === 0) {
    if (document === undefined) {
      throw patchError(operationIndex, 'cannot remove an absent root document');
    }

    return { document: undefined, value: document };
  }

  const { parent, token } = resolveParent(document, path, operationIndex);
  if (Array.isArray(parent)) {
    const arrayIndex = arrayIndexForExisting(
      token,
      parent.length,
      operationIndex,
    );
    const [value] = parent.splice(arrayIndex, 1);
    return { document: document as JsonValue, value };
  }

  if (!Object.hasOwn(parent, token)) {
    throw patchError(
      operationIndex,
      `path does not exist: ${pointerText(path)}`,
    );
  }

  const value = parent[token];
  delete parent[token];
  return { document: document as JsonValue, value };
}

function replaceValue(
  document: JsonValue | undefined,
  path: readonly string[],
  value: JsonValue,
  operationIndex: number,
): JsonValue {
  if (path.length === 0) {
    if (document === undefined) {
      throw patchError(
        operationIndex,
        'cannot replace an absent root document',
      );
    }

    return value;
  }

  const { parent, token } = resolveParent(document, path, operationIndex);
  if (Array.isArray(parent)) {
    parent[arrayIndexForExisting(token, parent.length, operationIndex)] = value;
    return document as JsonValue;
  }

  if (!Object.hasOwn(parent, token)) {
    throw patchError(
      operationIndex,
      `path does not exist: ${pointerText(path)}`,
    );
  }

  Object.defineProperty(parent, token, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return document as JsonValue;
}

function getValue(
  document: JsonValue | undefined,
  path: readonly string[],
  operationIndex: number,
): JsonValue {
  if (path.length === 0) {
    if (document === undefined) {
      throw patchError(
        operationIndex,
        'path does not exist: root document is absent',
      );
    }

    return document;
  }

  const { parent, token } = resolveParent(document, path, operationIndex);
  if (Array.isArray(parent)) {
    return parent[arrayIndexForExisting(token, parent.length, operationIndex)];
  }

  if (!Object.hasOwn(parent, token)) {
    throw patchError(
      operationIndex,
      `path does not exist: ${pointerText(path)}`,
    );
  }

  return parent[token];
}

function resolveParent(
  document: JsonValue | undefined,
  path: readonly string[],
  operationIndex = -1,
): { parent: MutableContainer; token: string } {
  if (document === undefined) {
    throw patchError(
      operationIndex,
      'path does not exist: root document is absent',
    );
  }

  let current = document;
  for (let index = 0; index < path.length - 1; index += 1) {
    const token = path[index];
    if (Array.isArray(current)) {
      current =
        current[arrayIndexForExisting(token, current.length, operationIndex)];
    } else if (isJsonObject(current)) {
      if (!Object.hasOwn(current, token)) {
        throw patchError(
          operationIndex,
          `path does not exist: ${pointerText(path)}`,
        );
      }
      current = current[token];
    } else {
      throw patchError(
        operationIndex,
        `path does not exist: ${pointerText(path)}`,
      );
    }
  }

  if (!Array.isArray(current) && !isJsonObject(current)) {
    throw patchError(
      operationIndex,
      `path parent is not a container: ${pointerText(path)}`,
    );
  }

  return { parent: current, token: path[path.length - 1] };
}

function patchValue(record: Record<string, unknown>, index: number): JsonValue {
  if (!Object.hasOwn(record, 'value') || record['value'] === undefined) {
    throw patchError(index, 'operation requires a JSON-compatible value');
  }

  return toMutableJsonValue(
    cloneAndFreezeOptionalJsonValue(record['value']),
  ) as JsonValue;
}

function toMutableJsonValue(
  value: JsonValue | undefined,
): JsonValue | undefined {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((child) => toMutableJsonValue(child) as JsonValue);
  }

  const clone = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value)) {
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: toMutableJsonValue(value[key]) as JsonValue,
      writable: true,
    });
  }
  return clone;
}

function parsePointer(
  pointer: string,
  operationIndex: number,
  field: string,
): string[] {
  if (pointer === '') {
    return [];
  }

  if (!pointer.startsWith('/')) {
    throw patchError(
      operationIndex,
      `${field} must be an RFC 6901 JSON Pointer`,
    );
  }

  return pointer
    .slice(1)
    .split('/')
    .map((token) => {
      let decoded = '';
      for (let index = 0; index < token.length; index += 1) {
        if (token[index] !== '~') {
          decoded += token[index];
          continue;
        }

        const escaped = token[index + 1];
        if (escaped === '0') {
          decoded += '~';
        } else if (escaped === '1') {
          decoded += '/';
        } else {
          throw patchError(
            operationIndex,
            `${field} contains an invalid escape`,
          );
        }
        index += 1;
      }
      return decoded;
    });
}

function arrayIndexForAdd(token: string, length: number): number {
  const index = parseArrayIndex(token);
  if (index === undefined || index > length) {
    throw new TypeError(
      `Invalid array insertion index: ${JSON.stringify(token)}.`,
    );
  }
  return index;
}

function arrayIndexForExisting(
  token: string,
  length: number,
  operationIndex: number,
): number {
  const index = parseArrayIndex(token);
  if (index === undefined || index >= length) {
    throw patchError(
      operationIndex,
      `array index does not exist: ${JSON.stringify(token)}`,
    );
  }
  return index;
}

function parseArrayIndex(token: string): number | undefined {
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    return undefined;
  }

  const index = Number(token);
  return Number.isSafeInteger(index) ? index : undefined;
}

function operationRecord(
  operation: unknown,
  index: number,
): Record<string, unknown> {
  if (
    operation === null ||
    typeof operation !== 'object' ||
    Array.isArray(operation)
  ) {
    throw patchError(index, 'operation must be an object');
  }

  return operation as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  index: number,
): string {
  if (!Object.hasOwn(record, key) || typeof record[key] !== 'string') {
    throw patchError(index, `operation requires a string ${key}`);
  }

  return record[key];
}

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDescendantPath(
  path: readonly string[],
  ancestor: readonly string[],
): boolean {
  return (
    path.length > ancestor.length &&
    ancestor.every((token, index) => token === path[index])
  );
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }

    return left.every((value, index) => jsonValuesEqual(value, right[index]));
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) && jsonValuesEqual(left[key], right[key]),
  );
}

function pointerText(path: readonly string[]): string {
  return `/${path.join('/')}`;
}

function patchError(index: number, detail: string): TypeError {
  return new TypeError(`Invalid JSON Patch operation ${index}: ${detail}.`);
}
