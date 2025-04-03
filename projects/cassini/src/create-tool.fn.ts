import { Observable } from 'rxjs';
import { Tool } from './types';
import { s } from './schema';

export class BoundTool<
  Name extends string = string,
  InputSchema extends s.AnyType = s.AnyType,
  Output extends object = object
> {
  constructor(
    readonly name: Name,
    readonly description: string,
    readonly schema: InputSchema,
    readonly handler: (
      input: s.Infer<InputSchema>
    ) => Promise<Output> | Observable<Output>
  ) {}

  toTool(): Tool<Name> {
    return {
      name: this.name,
      description: this.description,
      schema: s.toJsonSchema(this.schema),
    };
  }
}

export function createTool<
  Name extends string,
  InputSchema extends s.AnyType = s.AnyType,
  Output extends object = object
>(input: {
  name: Name;
  description: string;
  schema: InputSchema;
  handler: (
    input: s.Infer<InputSchema>
  ) => Promise<Output> | Observable<Output>;
}) {
  return new BoundTool(
    input.name,
    input.description,
    input.schema,
    input.handler
  );
}
