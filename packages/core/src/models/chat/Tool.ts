import { s } from '../../schema';

export type Tool<
  Name extends string = string,
  Schema extends s.ObjectType<Record<string, s.HashbrownType>> = s.ObjectType<
    Record<string, s.HashbrownType>
  >,
> = {
  name: Name;
  description: string;
  schema: Schema;
};
