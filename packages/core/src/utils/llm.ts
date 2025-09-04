/**
 * @important When adding new model IDs, sort the lists in descending order, and
 * do not include preview or snapshot model names.
 */

import { Prettify } from './types';

/**
 * This is a list of models that are known to be supported by OpenAI.
 * Refer to: https://platform.openai.com/docs/models/models
 *
 * @public
 */
export type OpenAiKnownModelIds =
  | 'o4-mini'
  | 'o4-mini-high'
  | 'o3'
  | 'o3-pro'
  | 'o3-mini'
  | 'o3-mini-high'
  | 'o1'
  | 'o1-pro'
  | 'o1-mini'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4'
  | 'gpt-4.5'
  | 'gpt-4.1'
  | 'gpt-4.1-nano'
  | 'gpt-4.1-mini'
  | 'gpt-3.5';

/**
 * This is a list of known Models for Google.
 * Refer to: https://ai.google.dev/gemini-api/docs/models
 *
 * @public
 */
export type GoogleKnownModelIds =
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-8b';

/**
 * This is a list of known Models for Writer.
 * Refer to: https://dev.writer.com/home/models
 *
 * @public
 */
export type WriterKnownModelIds =
  | 'palmyra-x5'
  | 'palmyra-x4'
  | 'palmyra-x-003-instruct'
  | 'palmyra-vision'
  | 'palmyra-med'
  | 'palmyra-fin'
  | 'palmyra-creative';

/**
 * This is a list of known Models for Azure.
 * Refer to: https://learn.microsoft.com/en-us/azure/cognitive-services/openai/reference#models
 *
 * @public
 */
export type AzureKnownModelIds = `${OpenAiKnownModelIds}@${string}`;

/**
 * This is a union of all known model ids.
 *
 * @public
 */
export type KnownModelIds = Prettify<
  | OpenAiKnownModelIds
  | GoogleKnownModelIds
  | WriterKnownModelIds
  | AzureKnownModelIds
  | (string & {})
>;
