import { HashbrownType, internal } from './base';

/**
 * @public
 */
export function getDescription(schema: HashbrownType): string {
  return schema[internal].definition.description;
}
