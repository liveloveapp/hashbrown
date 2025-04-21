import { s } from '../../schema/s';

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
