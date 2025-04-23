import { HashbrownType, internal } from './base';

export function isStreaming(schema: HashbrownType): boolean {
  return schema[internal].definition.streaming;
}
