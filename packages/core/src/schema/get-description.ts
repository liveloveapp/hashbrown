import { HashbrownType, internal } from './base';

export function getDescription(schema: HashbrownType): string {
  return schema[internal].definition.description;
}
