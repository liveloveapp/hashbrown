/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Skillet is an LLM-optimized streaming JSON Parser - perfectly suited for streaming hot and fresh JSON.
 *
 * Portions of this code are derived from partial-json (MIT License) (https://github.com/promplate/partial-json-parser-js).
 * See the LICENSE file in the project root for full license text.
 *
 * @license MIT
 * @author LiveLoveApp, LLC
 * @see https://github.com/liveloveapp/hashbrown
 * @see https://github.com/promplate/partial-json-parser-js
 */

import { Logger, NONE_LEVEL } from '../logger/logger';
import * as s from '../schema/base';
import {
  internal,
  isArrayType,
  isAnyOfType,
  isBooleanType,
  isEnumType,
  isLiteralType,
  isNullType,
  isNumberType,
  isObjectType,
  isStringType,
  PRIMITIVE_WRAPPER_FIELD_NAME,
} from '../schema/base';

const LOG_SETTINGS: { [name: string]: number } = {
  all: NONE_LEVEL,
};

class PartialJSON extends Error {}

class MalformedJSON extends Error {}

class IncompleteNonStreamingObject extends Error {}

class UnexpectedStreamingType extends Error {}

function shouldBeWrappedPrimitive(schema: s.HashbrownType): boolean {
  if (isAnyOfType(schema) || isObjectType(schema)) {
    return false;
  }

  return true;
}

function parseJSON(
  jsonString: string,
  schema: s.HashbrownType,
  assumeFinishedMessage: boolean,
): any {
  if (typeof jsonString !== 'string') {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    return '';
  }
  return _parseJSON(jsonString.trim(), schema, assumeFinishedMessage);
}

const _parseJSON = (
  jsonString: string,
  schema: s.HashbrownType,
  assumeFinishedMessage: boolean,
) => {
  const logger = new Logger(LOG_SETTINGS);

  logger.for('_parseJSON').info('In _parseJson');
  // Since each parse run is effectively starting over, this string should indicate
  // how far we can expect to get this time
  logger.for('_parseJSON').info(jsonString);

  const length = jsonString.length;
  let index = 0;

  // Track current object/array so we can move up and down the document stack as we go
  const containerStack: s.HashbrownType[] = [schema];

  const markPartialJSON = (msg: string) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };

  const throwMalformedError = (msg: string) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };

  const pickAnyOfOption = (
    anyOfSchema: s.HashbrownType,
  ): s.HashbrownType | undefined => {
    const options = (anyOfSchema as any)[internal].definition
      .options as s.HashbrownType[];
    const token = jsonString[index];

    const matchesToken = (option: s.HashbrownType) => {
      if (token === '{') {
        return isObjectType(option);
      }
      if (token === '[') {
        return isArrayType(option);
      }
      if (token === '"') {
        return (
          isStringType(option) || isLiteralType(option) || isEnumType(option)
        );
      }
      if (token === 'n') {
        return isNullType(option);
      }
      if (token === 't' || token === 'f') {
        return isBooleanType(option);
      }
      return isNumberType(option);
    };

    const directMatches = options.filter(matchesToken);
    if (directMatches.length > 0) {
      return directMatches[0];
    }

    const nestedAnyOf = options.find((opt) => isAnyOfType(opt));
    return nestedAnyOf ?? options[0];
  };

  const parseAny: (
    currentKey: string,
    allowsIncomplete: boolean,
    insideArray: boolean,
  ) => any = (currentKey, allowsIncomplete, insideArray) => {
    skipBlank();

    logger.for('parseAny').info(`Remaining string: ${jsonString.slice(index)}`);

    const currentLastContainer = containerStack[containerStack.length - 1];

    logger.for('parseAny').debug('Current last container:');
    logger.for('parseAny').debug(currentLastContainer);

    if (index >= length) markPartialJSON('Unexpected end of input');
    if (jsonString[index] === '"') {
      return parseStr(allowsIncomplete);
    }
    if (s.isAnyOfType(currentLastContainer)) {
      const matchingOption = pickAnyOfOption(currentLastContainer);
      if (!matchingOption) {
        throwMalformedError('No matching option found in anyOf');
        return '';
      }

      const resolvedOption = matchingOption as s.HashbrownType;
      containerStack.push(resolvedOption);
      const value = parseAny(
        currentKey,
        s.isStreaming(resolvedOption),
        insideArray,
      );
      if (containerStack[containerStack.length - 1] === resolvedOption) {
        containerStack.pop();
      }
      return value;
    }

    if (jsonString[index] === '{') {
      /*
        If the top-level schema is a primitive that should be object-wrapped, we 
        assume a wrapped primitive is starting

        Else, we parse as a regular object.
      */
      if (shouldBeWrappedPrimitive(currentLastContainer)) {
        return parseWrappedPrimitive();
      } else {
        return parseObj(currentKey, insideArray);
      }
    }

    if (jsonString[index] === '[') {
      return parseArr(currentKey, allowsIncomplete);
    }
    if (jsonString.substring(index, index + 4) === 'null') {
      index += 4;
      return null;
    }
    if (jsonString.substring(index, index + 4) === 'true') {
      index += 4;
      return true;
    }
    if (jsonString.substring(index, index + 5) === 'false') {
      index += 5;
      return false;
    }

    return parseNum();
  };

  const parseStr: (allowsIncomplete: boolean) => string = (
    allowsIncomplete,
  ) => {
    if (containerStack.length === 1) {
      // String literal at top level, so see if the the schema allows streaming
      allowsIncomplete = s.isStreaming(schema);
    }

    const start = index;

    // Is the next character a string?
    // parseAny checks before calling parseStr, but functions parsing
    // key names (i.e. parseObj) do not, and we need to detect potentially
    // malformed JSON immediately following a comma
    if (jsonString[start] !== '"') {
      throwMalformedError('String expected but not started');
    }

    let escape = false;
    index++; // skip initial quote
    while (
      index < length &&
      (jsonString[index] !== '"' || (escape && jsonString[index - 1] === '\\'))
    ) {
      escape = jsonString[index] === '\\' ? !escape : false;
      index++;
    }
    if (jsonString.charAt(index) == '"') {
      try {
        return JSON.parse(
          jsonString.substring(start, ++index - Number(escape)),
        );
      } catch (e) {
        throwMalformedError(String(e));
      }
    } else if (allowsIncomplete) {
      try {
        return JSON.parse(
          jsonString.substring(start, index - Number(escape)) + '"',
        );
      } catch {
        // SyntaxError: Invalid escape sequence
        return JSON.parse(
          jsonString.substring(start, jsonString.lastIndexOf('\\')) + '"',
        );
      }
    }
    markPartialJSON('Unterminated string literal');
  };

  const handleIncompleteWrappedPrimitive = (val: any) => {
    if (val == null) {
      throw new IncompleteNonStreamingObject(
        'Incomplete wrapped primitive object found',
      );
    }

    return val;
  };

  const parseWrappedPrimitive = () => {
    logger
      .for('parseWrappedPrimitive')
      .info(`Parsing wrapped primitive object`);
    index++; // skip initial brace
    skipBlank();
    let value: any = undefined;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return handleIncompleteWrappedPrimitive(value);
        }

        const key = parseStr(false);

        if (key !== PRIMITIVE_WRAPPER_FIELD_NAME) {
          // How did we get here if this isn't really a wrapped primitive?
          throwMalformedError(
            `Wrapped primitive has unexpected key name: ${key}`,
          );
        }

        skipBlank();
        index++; // skip colon
        try {
          logger.for('parseWrappedPrimitive').debug(`Handling key: ${key}`);

          const matchingSchema = containerStack[containerStack.length - 1];

          logger.for('parseWrappedPrimitive').debug('Found top-level schema:');
          logger.for('parseWrappedPrimitive').debug(matchingSchema);

          // This isn't a real object, so don't pass the key name
          value = parseAny('', s.isStreaming(matchingSchema), false);

          logger.for('parseWrappedPrimitive').debug('Value:');
          logger.for('parseWrappedPrimitive').debug(value);
        } catch (e) {
          logger.for('parseWrappedPrimitive').error(e);
          return handleIncompleteWrappedPrimitive(value);
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.for('parseWrappedPrimitive').error(e);

      return handleIncompleteWrappedPrimitive(value);
    }
    index++; // skip final brace

    const completedContainer = containerStack.pop();
    logger
      .for('parseWrappedPrimitive')
      .info(
        `Completed wrapped primitive container: ${completedContainer?.[internal].definition.description}`,
      );

    return value;
  };

  const handleIncompleteObject = (
    currentContainerStackIndex: number,
    obj: any,
  ) => {
    const currentContainer = containerStack[currentContainerStackIndex];

    if (s.isStreaming(currentContainer)) {
      logger.for('parseObj').debug('Index >= length: returning partial object');
      return obj;
    }

    logger
      .for('parseObj')
      .debug(
        'Index >= length: opting not to return partial obj if non-streaming properties are missing',
      );

    // Are all non-streaming fields present?
    if (
      Object.entries(
        (currentContainer[internal].definition as any).shape,
      ).every(([key, subSchema]) => {
        logger
          .for('parseObj')
          .debug(
            `key ${key} is streaming: ${s.isStreaming(subSchema as any)} and present: ${key in obj}`,
          );

        // if this key is streaming and not present, add an "empty" value
        if (s.isStreaming(subSchema as any)) {
          if (!(key in obj)) {
            if (
              s.isStringType(subSchema as any) ||
              s.isLiteralType(subSchema as any) ||
              s.isEnumType(subSchema as any)
            ) {
              obj[key] = '';
            } else if (s.isArrayType(subSchema as any)) {
              obj[key] = [];
            } else if (s.isObjectType(subSchema as any)) {
              obj[key] = {};
            } else {
              throw new UnexpectedStreamingType(
                'Unexpected schema type for a streaming prop',
              );
            }
          }
          return true;
        }

        if (key in obj) {
          return true;
        }

        // If the key schema is an anyOf and includes nullish, default to null
        if (s.isAnyOfType(subSchema as any)) {
          const options = (subSchema as any)[internal].definition
            .options as s.HashbrownType[];
          if (options.some((opt) => isNullType(opt))) {
            obj[key] = null;
            return true;
          }
        }

        return false;
      })
    ) {
      return obj;
    }

    throw new IncompleteNonStreamingObject(
      'Incomplete but non-streaming object found',
    );
  };

  const parseObj = (parentKey: string, insideArray: boolean) => {
    logger.for('parseObj').info(`Parsing object with parent: ${parentKey}`);
    index++; // skip initial brace
    skipBlank();
    const obj: Record<string, any> = {};

    // If we are not in an array, find key in current level of document stock, and add to stack
    if (parentKey !== '') {
      const currentContainer = containerStack[containerStack.length - 1];

      // If parentKey is set, we are not in an array, so get the next stack container
      // (arrays handle it differently, so they can do clean up when the array is complete)
      const nextContainer = (currentContainer[internal].definition as any)
        .shape[parentKey];

      logger
        .for('parseObj')
        .debug(`Starting new object with key: ${parentKey}`);
      logger.for('parseObj').debug(nextContainer);

      if (nextContainer == null) {
        throwMalformedError(`Key: ${parentKey} not expected in container`);
      }

      containerStack.push(nextContainer);
    }

    const currentContainerStackIndex = containerStack.length - 1;

    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return handleIncompleteObject(currentContainerStackIndex, obj);
        }

        const key = parseStr(false);

        skipBlank();
        index++; // skip colon
        try {
          logger.for('parseObj').debug(`Handling key: ${key}`);

          const currentContainer = containerStack[currentContainerStackIndex];

          // This is a regular object, so find the schema for the key
          const schemaFragmentForKey = (
            currentContainer[internal].definition as any
          ).shape[key];

          if (s.isAnyOfType(schemaFragmentForKey)) {
            containerStack.push(schemaFragmentForKey);

            logger
              .for('parseObj')
              .debug(
                `Object key ${key} in container ${currentContainerStackIndex} is anyOf`,
              );

            // AnyOfs are never directly streaming
            const value = parseAny(key, false, false);
            if (containerStack[containerStack.length - 1] === schemaFragmentForKey) {
              containerStack.pop();
            }

            logger.for('parseObj').debug('Value:');
            logger.for('parseObj').debug(value);
            obj[key] = value;
          } else {
            const currentKeyAllowsIncomplete = s.isStreaming(
              schemaFragmentForKey,
            );

            logger
              .for('parseObj')
              .debug(
                `Object key ${key} in container ${currentContainerStackIndex} allows incomplete: ${currentKeyAllowsIncomplete}`,
              );

            const value = parseAny(key, currentKeyAllowsIncomplete, false);

            logger.for('parseObj').debug('Value:');
            logger.for('parseObj').debug(value);
            obj[key] = value;
          }
        } catch (e) {
          logger.for('parseObj').error(e);
          return handleIncompleteObject(currentContainerStackIndex, obj);
        }
        skipBlank();
        if (jsonString[index] === ',') index++; // skip comma
      }
    } catch (e) {
      logger.for('parseObj').error(e);

      return handleIncompleteObject(currentContainerStackIndex, obj);
    }
    index++; // skip final brace

    // Are we inside an array?  They handle adding/removing stack containers for themselves
    if (!insideArray) {
      // Done with this container, so pop off stack
      const completedContainer = containerStack.pop();
      logger
        .for('parseObj')
        .debug(
          `Completed object container: ${completedContainer?.[internal]?.definition?.description}`,
        );
    } else {
      logger
        .for('parseObj')
        .debug('Inside array. Object completed, but keeping container stack');
    }
    return obj;
  };

  const parseArr = (currentKey: string, allowsIncomplete: boolean) => {
    if (containerStack.length === 1 && s.isArrayType(containerStack[0])) {
      // See if the the schema allows streaming
      allowsIncomplete = s.isStreaming(schema);
    }

    index++; // skip initial bracket
    logger.for('parseArr').info('parseArr: Start');
    const arr = [];

    const currentContainer = containerStack[containerStack.length - 1];
    let arrayContainer: s.HashbrownType | undefined;

    if (currentKey) {
      const shapeEntry = (currentContainer as any)?.[internal]?.definition
        ?.shape?.[currentKey];
      if (shapeEntry) {
        arrayContainer = (shapeEntry as any)[internal].definition.element;
      }
    } else {
      arrayContainer = (currentContainer as any)?.[internal]?.definition
        ?.element as s.HashbrownType | undefined;
    }

    if (!arrayContainer) {
      throwMalformedError(
        `Array schema not found for key: ${currentKey || '<root array>'}`,
      );
    }
    const resolvedArrayContainer = arrayContainer as s.HashbrownType;

    logger.for('parseArr').debug('Array container: ');
    logger.for('parseArr').debug(arrayContainer);

    logger.for('parseArr').debug(`Allows streaming? ${allowsIncomplete}`);

    // logger.log(`Is anyOf? ${s.isAnyOfType(arrayContainer)}`);

    let containerNeedsPopping = false;
    let contentsAllowIncomplete = false;

    // If this array is of objects, push the container onto the stack
    if (s.isObjectType(resolvedArrayContainer)) {
      logger.for('parseArr').debug('Array container is object type');
      containerStack.push(resolvedArrayContainer);
      containerNeedsPopping = true;
    } else if (s.isAnyOfType(resolvedArrayContainer)) {
      logger
        .for('parseArr')
        .debug('Array container is anyOf. Pushing anyOf to container stack');
      containerStack.push(resolvedArrayContainer);
      containerNeedsPopping = true;
    } else {
      logger.for('parseArr').debug('Array container is primitive');
      // It's not an object, so check if it is a streaming primitive
      contentsAllowIncomplete = s.isStreaming(resolvedArrayContainer);

      logger
        .for('parseArr')
        .debug(
          `Array primitive content allows streaming: ${contentsAllowIncomplete}`,
        );
    }

    try {
      while (jsonString[index] !== ']') {
        logger
          .for('parseArr')
          .debug(`Array content allows incomplete: ${contentsAllowIncomplete}`);
        arr.push(parseAny('', contentsAllowIncomplete, true));
        skipBlank();
        if (jsonString[index] === ',') {
          index++; // skip comma
        }
      }
    } catch {
      // logger.for('parseArr').error(e);
      if (allowsIncomplete) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++; // skip final bracket

    // Array was completed, so put container off if needed
    if (containerNeedsPopping) {
      containerStack.pop();
    }

    return arr;
  };

  const parseNum = () => {
    if (index === 0) {
      if (jsonString === '-') throwMalformedError("Not sure what '-' is");
      try {
        // JSON string starts with a number, so we'll try to parse the whole thing as one.
        // Thus, set index to length.
        index = jsonString.length;

        return JSON.parse(jsonString);
      } catch (e) {
        throwMalformedError(String(e));
      }
    }

    const start = index;

    if (jsonString[index] === '-') index++;
    while (jsonString[index] && ',]}'.indexOf(jsonString[index]) === -1)
      index++;

    if (index == length) markPartialJSON('Unterminated number literal');

    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch {
      if (jsonString.substring(start, index) === '-')
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(
          jsonString.substring(start, jsonString.lastIndexOf('e')),
        );
      } catch (e) {
        throwMalformedError(String(e));
      }
    }
  };

  const skipBlank = () => {
    while (index < length && ' \n\r\t'.includes(jsonString[index])) {
      index++;
    }
  };

  try {
    const result = parseAny('', false, false);

    // We returned, but have we not consumed the whole length?
    // We only check this on finished messages so as not to spam
    // the warning on each few-character chunk of a streaming
    // message.
    if (assumeFinishedMessage && index < length) {
      // NB: We call console.warn directly here instead of using the
      // logger mechanism, because getting here almost always means the
      // LLM hallucinated, adding extra stuff after the response or encoded
      // it in a strange way (like escaping part or all of the JSON).
      console.warn(`Extra data detected after parsing.\n
Parsed: ${JSON.stringify(result)}\n
Left over: ${jsonString.substring(index)}\n
This is often caused by extra or incorrectly formatted data being returned by the 
LLM, despite requesting data with a particular structure.

Different models, by default, handle complex structured data with varied levels of accuracy.

Model behavior can typically be improved by:
- Adding 1-3 examples of correct output to your prompt (aka few-shot).
- Adding guardrails to the prompt like "Do not escape tool function arguments."
`);
    }

    return result;
  } catch (e) {
    if (e instanceof IncompleteNonStreamingObject) {
      logger
        .for('_parseJSON')
        .error('Got incomplete object error at top level');

      return '';
    }

    if (e instanceof PartialJSON) {
      logger.for('_parseJSON').error('Got unterminated container');

      return '';
    }

    if (e instanceof MalformedJSON) {
      if (e.message.includes('Exponent part is missing a number')) {
        logger
          .for('_parseJSON')
          .error('Found number with exponent sans number');
        return '';
      }

      if (e.message.includes('Unterminated fractional number')) {
        logger
          .for('_parseJSON')
          .error('Found number with decimal point sans numbers');
        return '';
      }
    }

    throw e;
  }
};

const parse = parseJSON;

export { parse, parseJSON, PartialJSON, MalformedJSON };
