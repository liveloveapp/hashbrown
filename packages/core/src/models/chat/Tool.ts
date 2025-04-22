import { s } from '../../schema';

export type Tool<
  Name extends string = string,
  Schema extends s.ObjectType<Record<string, s.AnyType>> = s.ObjectType<
    Record<string, s.AnyType>
  >,
> = {
  name: Name;
  description: string;
  schema: Schema;
};
